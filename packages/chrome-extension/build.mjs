import { cpSync, mkdirSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// Copy static assets to dist
mkdirSync('dist', { recursive: true });
cpSync('manifest.json', 'dist/manifest.json');
cpSync('src/content.css', 'dist/content.css');
cpSync('src/options.html', 'dist/options.html');
mkdirSync('dist/icons', { recursive: true });
try {
  cpSync('icons/icon-48.png', 'dist/icons/icon-48.png');
  cpSync('icons/icon-128.png', 'dist/icons/icon-128.png');
} catch {
  // Icons are optional placeholders
}

const buildOpts = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
};

const contentCtx = await esbuild.context({
  ...buildOpts,
  entryPoints: ['src/content.ts'],
  outfile: 'dist/content.js',
});

const optionsCtx = await esbuild.context({
  ...buildOpts,
  entryPoints: ['src/options.ts'],
  outfile: 'dist/options.js',
});

if (watch) {
  await contentCtx.watch();
  await optionsCtx.watch();
  console.log('Watching for changes...');
} else {
  await contentCtx.rebuild();
  await optionsCtx.rebuild();
  await contentCtx.dispose();
  await optionsCtx.dispose();
  console.log('Build complete');
}
