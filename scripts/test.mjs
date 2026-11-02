import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

const outfile = 'node_modules/.cache/advanced-tables-tests.cjs';
await build({
  entryPoints: ['test/visible-width.test.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
});
execFileSync(process.execPath, [outfile], { stdio: 'inherit' });
