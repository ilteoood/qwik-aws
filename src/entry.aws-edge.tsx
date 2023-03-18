/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the express server when building for production.
 *
 * Learn more about the cloudflare integration here:
 * - https://qwik.builder.io/integrations/deployments/node/
 *
 */
import { createQwikCity, type PlatformNode } from '@builder.io/qwik-city/middleware/node';
import qwikCityPlan from '@qwik-city-plan';
import { manifest } from '@qwik-client-manifest';
import render from './entry.ssr';


declare global {
    interface QwikCityPlatform extends PlatformNode { }
}

createQwikCity({ render, qwikCityPlan, manifest });

export const handler = (event: any) => {
    return render({base: event.request.uri})
}