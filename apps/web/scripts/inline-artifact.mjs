/**
 * Turn the `--mode artifact` build into one self-contained HTML fragment:
 * title, inlined CSS (fonts already embedded as data URIs) and the inlined
 * JS bundle. The artifact host supplies the <!doctype>, <head> and <body>.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-artifact');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const scriptSrc = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/.exec(html)?.[1];
const styleHref = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/.exec(html)?.[1];
if (!scriptSrc || !styleHref) throw new Error('Could not find the built script or stylesheet in index.html');

const js = readFileSync(join(dist, scriptSrc), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, styleHref), 'utf8');
if (/url\((?!["']?data:)/.test(css)) throw new Error('Stylesheet still references external files');

const page = `<title>Mainsight</title>
<style>${css}</style>
<div id="root"></div>
<noscript>Mainsight needs JavaScript. If your power is off, call 105.</noscript>
<script type="module">${js}</script>
`;

mkdirSync(join(root, 'artifact'), { recursive: true });
const out = join(root, 'artifact', 'mainsight.html');
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
