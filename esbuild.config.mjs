import { build, context } from 'esbuild';
import path from 'path';

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  alias: {
    '@winccoa-tools-pack/npm-winccoa-core': path.resolve(
      'node_modules/@winccoa-tools-pack/npm-winccoa-core/dist/cjs/index.js'
    ),
  },
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching...');
} else {
  await build(options);
}
