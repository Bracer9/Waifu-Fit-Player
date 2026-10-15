import { demoChart } from '../src/demo.ts';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const meta = JSON.parse(await readFile('public/demo-media.json', 'utf8'));
const folder = (await readdir('maps', { withFileTypes: true })).find((entry) =>
  entry.isDirectory(),
);
if (!folder) throw new Error('No song folder exists in maps/.');
const output = path.join('maps', folder.name, 'demo.wfp.json');
await writeFile(output, JSON.stringify(demoChart(meta.fileName), null, 2));
console.log(`Demo chart exported: ${output}`);
