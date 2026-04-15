import { cpSync, mkdirSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// Copy static assets to dist
mkdirSync('dist', { recursive: true });
cpSync('manifest.json', 'dist/manifest.json');
cpSync('src/content.css', 'dist/content.css');
mkdirSync('dist/icons', { recursive: true });
try {
  cpSync('icons/icon-48.png', 'dist/icons/icon-48.png');
  cpSync('icons/icon-128.png', 'dist/icons/icon-128.png');
} catch {
  // Icons are optional placeholders
}

const ctx = await esbuild.context({
  entryPoints: ['src/content.ts'],
  bundle: true,
  outfile: 'dist/content.js',
  format: 'iife',
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build complete');
}
