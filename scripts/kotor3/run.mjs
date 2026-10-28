#!/usr/bin/env node
/**
 * run.mjs: runs one of the KOTOR III TypeScript tools in scripts/kotor3/ under Node.
 * It bundles the tool with esbuild (already a dev dependency) so it can use KotOR.js's own
 * resource classes through the "@/..." path alias, then runs it with the remaining arguments.
 *   node scripts/kotor3/run.mjs build-mod
 *   node scripts/kotor3/run.mjs verify-mod
 *   node scripts/kotor3/run.mjs verify-mod --list-ncs   (also prints each compiled script's instructions)
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
// `document` is a do-nothing stand-in (every property, call and `new` gives it back): the script tools
// import the engine's own NWScript tables and NCS reader, which load the engine's module graph, and a
// few of those modules build DOM elements at load time. Nothing in the tools uses the DOM.
const banner = "globalThis.window=globalThis.window||{location:{origin:'node',href:'file:///'},addEventListener(){}};"
  + "for(const n of ['FileSystemFileHandle','FileSystemDirectoryHandle','HTMLElement','Image']){globalThis[n]=globalThis[n]||class{}};"
  + "if(!globalThis.document){const s=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>'':k==='then'?undefined:s,"
  + "apply:()=>s,construct:()=>s,set:()=>true});globalThis.document=s;}";
// three's package.json "exports" map needs the .js on deep examples/jsm imports; webpack adds it, esbuild does not.
const threeExamples = {
  name: 'three-examples-jsm',
  setup(b) {
    b.onResolve({ filter: /^three\/examples\/jsm\// }, (a) => (a.path.endsWith('.js') ? undefined : { path: path.resolve('node_modules', `${a.path}.js`) }));
  },
};
await build({
  entryPoints: [path.resolve('scripts/kotor3', `${tool}.ts`)],
  bundle: true, platform: 'node', format: 'cjs', outfile,
  tsconfig: 'tsconfig.json', logLevel: 'error', banner: { js: banner }, plugins: [threeExamples],
});
const r = spawnSync(process.execPath, [outfile, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
