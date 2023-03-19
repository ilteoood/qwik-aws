import type { RenderOptions } from '@builder.io/qwik';
import { _deserializeData, _serializeData, _verifySerializable } from '@builder.io/qwik';
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
import type { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

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
    async function handler(event: APIGatewayEvent, context: Context): Promise<any> {
        try {
            const url = new URL(event.path, 'http://localhost:3000');
            const options: RequestInit = {
                method: event.httpMethod || 'GET',
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
                    const response: APIGatewayProxyResult = {
                        statusCode: status,
                        body: '',
                        headers: {},
                    };
                    mergeHeadersCookies(headers, cookies).forEach(
                        (value, key) => (response.headers![key] = value)
                    );
                    return new WritableStream({
                        write(chunk: Uint8Array) {
                            if (bodyChunk instanceof Uint8Array) {
                                const newBuffer = new Uint8Array(bodyChunk.length + chunk.length);
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
            const handledResponse = await requestHandler(serverRequestEv, opts, qwikSerializer);
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
export interface QwikCityAzureOptions extends ServerRenderOptions { }

/**
 * @alpha
 */
export interface PlatformAzure extends Partial<Context> { }

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
