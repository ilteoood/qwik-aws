/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the express server when building for production.
 *
 * Learn more about the cloudflare integration here:
 * - https://qwik.builder.io/integrations/deployments/node/
 *
 */
// eslint-disable-next-line
import qwikCityPlan from '@qwik-city-plan';
import { manifest } from '@qwik-client-manifest';
import { createQwikCity } from './createQwikCity';
import render from './entry.ssr';

export const handler = createQwikCity({ render, qwikCityPlan, manifest });