// Checks every HTML page: balanced tags, required parts, internal links and
// anchors, and that nothing is loaded from another site. No dependencies.
// Usage: node scripts/check.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VOID = new Set(['meta', 'link', 'br', 'img', 'hr', 'input', 'source']);
// The only contact address that may appear on the pages.
const EMAIL = 'appfab.apps@outlook.com';
const errors = [];
const pages = readdirSync('.').filter((f) => f.endsWith('.html'));
const ids = new Map();
const fail = (page, message) => errors.push(`${page}: ${message}`);

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const tags = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)];
  ids.set(page, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  if (!/^<!doctype html>/i.test(html)) fail(page, 'no doctype');
  for (const part of ['<html lang="en">', '<meta charset="utf-8">', 'name="viewport"', 'name="description"', '<title>', '<main>']) {
    if (!html.includes(part)) fail(page, `missing ${part}`);
  }
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) fail(page, 'needs exactly one h1');

  const open = [];
  for (const [, slash, rawName, rest] of tags) {
    const name = rawName.toLowerCase();
    if (VOID.has(name) || rest.endsWith('/')) continue;
    if (!slash) open.push(name);
    else if (open.pop() !== name) {
      fail(page, `unbalanced </${name}>`);
      break;
    }
  }
  if (open.length) fail(page, `not closed: ${open.join(', ')}`);

  // Nothing may be loaded from elsewhere, and there are no scripts or forms.
  for (const tag of ['script', 'iframe', 'form', 'object', 'embed', 'video', 'audio']) {
    if (tags.some((t) => t[2].toLowerCase() === tag)) fail(page, `<${tag}> is not allowed`);
  }
  if (/\son\w+="/.test(html)) fail(page, 'inline event handler');
  for (const [, , name, rest] of tags) {
    const src = rest.match(/\ssrc="([^"]+)"/)?.[1] ?? (name === 'link' ? rest.match(/\shref="([^"]+)"/)?.[1] : undefined);
    if (src && /^(https?:)?\/\//.test(src)) fail(page, `loads ${src} from another site`);
    if (src && !/^(https?:)?\/\//.test(src) && !existsSync(src)) fail(page, `missing file ${src}`);
  }
  for (const [address] of html.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
    if (address !== EMAIL) fail(page, 'contains an e-mail address other than the support address');
  }
}

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const [, href] of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    if (/^https:\/\//.test(href) || href === `mailto:${EMAIL}`) continue;
    if (/^\w+:|^\//.test(href)) {
      fail(page, `unexpected link ${href}`);
      continue;
    }
    const [file, anchor] = href.split('#');
    const target = file || page;
    if (!existsSync(join('.', target))) fail(page, `broken link ${href}`);
    else if (anchor && !ids.get(target)?.has(anchor)) fail(page, `broken anchor ${href}`);
  }
}

const css = readFileSync('style.css', 'utf8');
for (const [, url] of css.matchAll(/url\("([^"]+)"\)/g)) {
  if (/^(https?:)?\/\//.test(url)) errors.push(`style.css: loads ${url} from another site`);
  else if (!existsSync(url)) errors.push(`style.css: missing file ${url}`);
}
if (/@import/.test(css)) errors.push('style.css: @import is not allowed');
if (!readFileSync('support.html', 'utf8').includes(`mailto:${EMAIL}`)) errors.push('support.html: the support address is missing');
for (const required of ['index.html', 'privacy.html', 'support.html']) if (!pages.includes(required)) errors.push(`missing ${required}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${pages.length} pages OK: ${pages.join(', ')}`);
