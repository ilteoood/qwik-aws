import type { RenderOptions } from '@builder.io/qwik';
import {
	_deserializeData,
	_serializeData,
	_verifySerializable,
} from '@builder.io/qwik';
import type {
	ServerRenderOptions,
	ServerRequestEvent,
} from '@builder.io/qwik-city/middleware/request-handler';
import {
	mergeHeadersCookies,
	requestHandler,
} from '@builder.io/qwik-city/middleware/request-handler';
import type { Render } from '@builder.io/qwik/server';
import { setServerPlatform } from '@builder.io/qwik/server';
import qwikCityPlan from '@qwik-city-plan';
import type { APIGatewayProxyResult, Context } from 'aws-lambda';

export function getNotFound(_pathname: string) {
	return 'Resource Not Found ' + _pathname;
}

const staticPaths = new Set([
	'/favicon.svg',
	'/manifest.json',
	'/q-manifest.json',
	'/robots.txt',
	'/service-worker.js',
]);
function isStaticPath(method: string, url: URL) {
	if (method.toUpperCase() !== 'GET') {
		return false;
	}
	const p = url.pathname;
	if (p.startsWith('/build/')) {
		return true;
	}
	if (p.startsWith('/assets/')) {
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

const defaultHeaders = {
	'cache-control': 'max-age=100',
	'content-type': 'text/html; charset=utf-8',
};

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

	async function handler(event: any, context: Context): Promise<any> {
		const request = event.Records[0].cf.request;

		const distributionDomainName =
			event.Records[0].cf.config.distributionDomainName;
		const querystring = request.querystring ? `?${request.querystring}` : '';

		const fullPath = `https://${distributionDomainName}${request.uri}${querystring}`;
		const url = new URL(fullPath);

		try {
			if (isStaticPath(request.method || 'GET', url)) {
				// env variables here
				const AWS_REGION = 'us-east-1';
				const S3_DOMAIN_NAME = 'XXX';

				request.origin = {
					s3: {
						region: AWS_REGION,
						domainName: S3_DOMAIN_NAME,
						authMethod: 'none',
					},
				};
				return request;
			}

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
				request: new Request(url, {
					method: request.method || 'GET',
					headers: mapAwsHeadersToHttpHeader(request.headers),
					body: request.body?.data
						? request.body.encoding === 'base64'
							? Buffer.from(request.body.data, 'base64').toString()
							: request.body.data
						: undefined,
				}),
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
					response.headers = mapHttpHeadersToAwsHeaders(response.headers);
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
			const handledResponse = await requestHandler(
				serverRequestEv,
				opts,
				qwikSerializer
			);
			if (handledResponse) {
				handledResponse.completion.then((err) => {
					if (err) {
						console.error(err);
					}
				});
				const response = await handledResponse.response;
				if (response) {
					return response;
				}
			}

			// qwik city did not have a route for this request
			// response with 404 for this pathname
			const notFoundHtml = getNotFound(url.pathname);
			return {
				status: 404,
				headers: mapHttpHeadersToAwsHeaders({
					...defaultHeaders,
					'Content-Type': 'text/html; charset=utf-8',
					'X-Not-Found': url.pathname,
				}),
				body: notFoundHtml,
			};
		} catch (e: unknown) {
			return {
				status: 500,
				headers: mapHttpHeadersToAwsHeaders({
					...defaultHeaders,
					'Content-Type': 'text/html; charset=utf-8',
					'X-Not-Found': url.pathname,
				}),
				body: String(e || 'Error'),
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

const mapHttpHeadersToAwsHeaders = (headers = {}) => {
	const awsHeaders: any = {};
	Object.entries(headers).forEach(([key, value]) => {
		awsHeaders[key.toLocaleLowerCase()] = [{ key, value }];
	});
	return awsHeaders;
};

const mapAwsHeadersToHttpHeader = (headers: any) => {
	const result: Record<string, string> = {};
	for (const key in headers) {
		result[key] = headers[key][0].value;
	}
	return result;
};
