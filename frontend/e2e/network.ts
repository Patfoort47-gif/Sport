import {readFileSync} from 'node:fs';
import type {BrowserContext, Page} from '@playwright/test';
const tailwind = readFileSync(new URL('../node_modules/@tailwindcss/browser/dist/index.global.js', import.meta.url));
// A tiny PNG makes tile requests deterministic without contacting the public OSM servers in CI.
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export async function visualNetwork(target: Page|BrowserContext) {
  await target.route('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.18/dist/index.global.js', route => route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:tailwind}));
  await target.route('https://tile.openstreetmap.org/**', route => route.fulfill({status:200,contentType:'image/png',body:tile}));
}
