import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const CLI_DIR = resolve(__dirname, '..');
const WEB_DIST = resolve(ROOT, 'packages', 'web', 'dist');
const OUT_WEB = resolve(CLI_DIR, 'dist', 'web');

// Copy web dist into cli/dist/web/
if (!existsSync(WEB_DIST)) {
  console.error('Web dist not found. Run `bun run build:web` first.');
  process.exit(1);
}

cpSync(WEB_DIST, OUT_WEB, { recursive: true });
console.log('Copied web assets to dist/web/');

// Bundle the Node.js standalone entry
await build({
  entryPoints: [
    resolve(ROOT, 'packages', 'server', 'src', 'standalone-node.ts'),
  ],
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: resolve(CLI_DIR, 'dist', 'index.min.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: ['@azure/identity'],
});

console.log('Bundled dist/index.min.js');
