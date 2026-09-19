import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('maplibre-gl/package.json'));
const output = new URL('../public/maplibre/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(join(packageRoot, 'dist', name), new URL(name, output));
}
await copyFile(join(packageRoot, 'LICENSE.txt'), new URL('LICENSE.txt', output));
