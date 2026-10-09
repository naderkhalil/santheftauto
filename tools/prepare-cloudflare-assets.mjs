import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('dist'), target = path.resolve('dist-cloudflare');
// This route is visibly disabled in the released course picker. Preserve its
// original art locally; Workers' 25 MiB asset limit excludes it from this build.
const excluded = new Set(['assets/cerebral-valley/neighborhood.glb']);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
let count = 0;
async function copy(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.name.startsWith('.') || /\.(br|gz)$/.test(name) || excluded.has(name)) continue;
    const from = path.join(source, name), to = path.join(target, name);
    if (entry.isDirectory()) { await mkdir(to, { recursive: true }); await copy(from, name); }
    else if (entry.isFile()) {
      if ((await stat(from)).size > 25 * 1024 * 1024) throw Error(`Cloudflare asset exceeds 25 MiB: ${name}`);
      await cp(from, to); count++;
    }
  }
}
await copy(source);
await writeFile(path.join(target, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: public, max-age=3600

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/assets/*.js
  Cache-Control: public, max-age=31536000, immutable

/assets/*.css
  Cache-Control: public, max-age=31536000, immutable
`);
console.log(`Prepared ${count} Cloudflare assets. Disabled Cerebral Valley art stays in the original build.`);
