import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const testFiles = readdirSync('test')
  .filter((file) => file.endsWith('.test.ts'))
  .sort();
if (testFiles.length === 0) {
  throw new Error('No test files found');
}

const outfile = 'node_modules/.cache/advanced-tables-tests.cjs';
await build({
  stdin: {
    contents: testFiles
      .map((file) => `import ${JSON.stringify(`./test/${file}`)};`)
      .join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
});
execFileSync(process.execPath, [outfile], { stdio: 'inherit' });
