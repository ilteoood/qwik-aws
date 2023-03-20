import type { RenderOptions } from '@builder.io/qwik';
import {
	_deserializeData,
	_serializeData,
	_verifySerializable
} from '@builder.io/qwik';
import type {
	ServerRenderOptions,
	ServerRequestEvent
} from '@builder.io/qwik-city/middleware/request-handler';
import {
	mergeHeadersCookies,
	requestHandler
} from '@builder.io/qwik-city/middleware/request-handler';
import type { Render } from '@builder.io/qwik/server';
import { setServerPlatform } from '@builder.io/qwik/server';
import qwikCityPlan from '@qwik-city-plan';
import { isStaticPath } from '@qwik-city-static-paths';
import type { APIGatewayProxyResult, Context } from 'aws-lambda';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';

/**
 * Common mime types mapped to Content-Type headers
 */
const MIME_TYPES: { [ext: string]: string } = {
	'3gp': 'video/3gpp',
	'3gpp': 'video/3gpp',
	asf: 'video/x-ms-asf',
	asx: 'video/x-ms-asf',
	avi: 'video/x-msvideo',
	avif: 'image/avif',
	bmp: 'image/x-ms-bmp',
	css: 'text/css',
	flv: 'video/x-flv',
	gif: 'image/gif',
	htm: 'text/html',
	html: 'text/html',
	ico: 'image/x-icon',
	jng: 'image/x-jng',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	js: 'application/javascript',
	json: 'application/json',
	kar: 'audio/midi',
	m4a: 'audio/x-m4a',
	m4v: 'video/x-m4v',
	mid: 'audio/midi',
	midi: 'audio/midi',
	mng: 'video/x-mng',
	mov: 'video/quicktime',
	mp3: 'audio/mpeg',
	mp4: 'video/mp4',
	mpeg: 'video/mpeg',
	mpg: 'video/mpeg',
	ogg: 'audio/ogg',
	pdf: 'application/pdf',
	png: 'image/png',
	rar: 'application/x-rar-compressed',
	shtml: 'text/html',
	svg: 'image/svg+xml',
	svgz: 'image/svg+xml',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	ts: 'video/mp2t',
	txt: 'text/plain',
	wbmp: 'image/vnd.wap.wbmp',
	webm: 'video/webm',
	webp: 'image/webp',
	wmv: 'video/x-ms-wmv',
	woff: 'font/woff',
	woff2: 'font/woff2',
	xml: 'text/xml',
	zip: 'application/zip',
};

const staticPaths = new Set(["/favicon.svg", "/manifest.json", "/q-manifest.json", "/robots.txt", "/service-worker.js"]);
function isStaticPath(method: string, url: URL) {
	console.log('isStaticPath', method, url);
	if (method.toUpperCase() !== 'GET') {
		return false;
	}
	const p = url.pathname;
	if (p.startsWith("/build/")) {
		return true;
	}
	if (p.startsWith("/assets/")) {
		return true;
	}
	if (staticPaths.has(p)) {
		return true;
	}
	if (p.endsWith('/q-data.json')) {
		const pWithoutQdata = p.replace(/\/q-data.json$/, '');
		if (staticPaths.has(pWithoutQdata + '/')) {
			return true;
		}
		if (staticPaths.has(pWithoutQdata)) {
			return true;
		}
	}
	return false;
}


/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityAzureOptions) {
	const qwikSerializer = {
		_deserializeData,
		_serializeData,
		_verifySerializable,
	};
	if (opts.manifest) {
		setServerPlatform(opts.manifest);
	}

	const staticFolder = resolve(join(import.meta.url, '..', 'static'));

	async function handler(event: any, context: Context): Promise<any> {
		console.log('context', JSON.stringify(event), JSON.stringify(context));

		const request = event.Records[0].cf.request;
		const fullPath = `https://${
			event.Records[0].cf.config.distributionDomainName
		}${request.uri}${request.querystring ? `?${request.querystring}` : ''}`;
		const requestMethod = request.method || 'GET';
		try {
			const url = new URL(fullPath);

			if (isStaticPath(requestMethod, url)) {
				const staticFilePath = join(staticFolder, url.pathname);
				const staticFileContent = await readFile(staticFilePath, 'utf8');

				console.log('STATIC FILE', staticFolder, staticFilePath, staticFileContent);

				return {
					status: 200,
					body: staticFileContent,
					headers: { 'Content-Type': MIME_TYPES[extname(staticFilePath).replace(/^\./, '')]}
				};
			}

			const options: RequestInit = {
				method: requestMethod || 'GET',
				headers: [],
				body: event.body,
			};

			const serverRequestEv: ServerRequestEvent<APIGatewayProxyResult> = {
				mode: 'server',
				locale: undefined,
				url,
				platform: context,
				env: {
					get(key) {
						return process.env[key];
					},
				},
				// @ts-ignore
				request: new Request(url, options),
				getWritableStream: (status, headers, cookies, resolve) => {
					let bodyChunk = new Uint8Array();
					const response: any = {
						status,
						body: '',
						headers: {},
					};
					mergeHeadersCookies(headers, cookies).forEach(
						(value, key) => (response.headers![key] = value)
					);
					response.headers = mapHeadersToAwsHeaders(response.headers);
					return new WritableStream({
						write(chunk: Uint8Array) {
							if (bodyChunk instanceof Uint8Array) {
								const newBuffer = new Uint8Array(
									bodyChunk.length + chunk.length
								);
								newBuffer.set(bodyChunk);
								newBuffer.set(chunk, bodyChunk.length);
								bodyChunk = newBuffer;
							}
						},
						close() {
							response.body = new TextDecoder().decode(bodyChunk);
							resolve(response);
						},
					});
				},
			};

			// send request to qwik city request handler
			console.log('handledResponse-pre', fullPath);
			const handledResponse = await requestHandler(
				serverRequestEv,
				opts,
				qwikSerializer
			);
			console.log('handledResponse', handledResponse);
			if (handledResponse) {
				handledResponse.completion.then((err) => {
					if (err) {
						console.error(err);
					}
				});
				const response = await handledResponse.response;
				console.log('----response----', response);

				if (response) {
					return response;
				}
			}

			// TODO: not found
		} catch (e: any) {
			console.error(e);
			return {
				status: 500,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' },
			};
		}
	}

	return handler;
}

/**
 * @alpha
 */
export interface QwikCityAzureOptions extends ServerRenderOptions {}

/**
 * @alpha
 */
export interface PlatformAzure extends Partial<Context> {}

/**
 * @alpha
 * @deprecated Please use `createQwikCity()` instead.
 *
 * Example:
 *
 * ```ts
 * import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';
 * import qwikCityPlan from '@qwik-city-plan';
 * import render from './entry.ssr';
 *
 * export default createQwikCity({ render, qwikCityPlan });
 * ```
 */
export function qwikCity(render: Render, opts?: RenderOptions) {
	return createQwikCity({ render, qwikCityPlan, ...opts });
}

const mapHeadersToAwsHeaders = (headers = {}) => {
	const awsHeaders: any = {};
	console.log('headers', headers);
	Object.entries(headers).forEach(([key, value]) => {
		awsHeaders[key] = [{ key, value }];
	});
	console.log('awsHeaders', awsHeaders);
	return awsHeaders;
};
