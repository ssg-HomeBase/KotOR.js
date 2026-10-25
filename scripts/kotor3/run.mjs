#!/usr/bin/env node
/**
 * run.mjs: runs one of the KOTOR III TypeScript tools in scripts/kotor3/ under Node.
 * It bundles the tool with esbuild (already a dev dependency) so it can use KotOR.js's own
 * resource classes through the "@/..." path alias, then runs it with the remaining arguments.
 *   node scripts/kotor3/run.mjs build-mod
 *   node scripts/kotor3/run.mjs verify-mod
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const [tool, ...args] = process.argv.slice(2);
if (!tool || !fs.existsSync(path.resolve('scripts/kotor3', `${tool}.ts`))) {
  console.error('usage: node scripts/kotor3/run.mjs <build-mod|verify-mod> [args]');
  process.exit(2);
}
const outfile = path.resolve('node_modules/.cache/kotor3', `${tool}.cjs`);
// KotOR.js touches a few browser names when its modules load; give them harmless stand-ins under Node.
const banner = "globalThis.window=globalThis.window||{location:{origin:'node',href:'file:///'},addEventListener(){}};"
  + "for(const n of ['FileSystemFileHandle','FileSystemDirectoryHandle','HTMLElement','Image']){globalThis[n]=globalThis[n]||class{}};";
await build({
  entryPoints: [path.resolve('scripts/kotor3', `${tool}.ts`)],
  bundle: true, platform: 'node', format: 'cjs', outfile,
  tsconfig: 'tsconfig.json', logLevel: 'error', banner: { js: banner },
});
const r = spawnSync(process.execPath, [outfile, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
