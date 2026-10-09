import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';

const br = promisify(brotliCompress), gz = promisify(gzip);
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await compress(path); continue; }
    if (!['.js', '.css', '.html', '.json', '.svg'].includes(extname(path))) continue;
    const source = await readFile(path); if (source.length < 1024) continue;
    const [brotli, deflate] = await Promise.all([br(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }), gz(source, { level: 6 })]);
    await Promise.all([writeFile(path + '.br', brotli), writeFile(path + '.gz', deflate)]);
  }
}
await compress('dist');
console.log('Prepared compressed static assets.');
