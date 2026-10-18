// Runs real TypeScript source. Only explicitly supplied system boundaries are mocked.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { builtinModules } = require('node:module');
const { execSync } = require('node:child_process');
let ts;
try { ts = require('typescript'); }
catch { ts = require(path.join(execSync('npm root -g', {encoding:'utf8'}).trim(), 'typescript')); }
const root = path.resolve(__dirname, '../..');

function load(file, mocks = {}, globals = {}) {
  const cache = new Map();
  function visit(relative) {
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) throw new Error('Module escaped repository root');
    if (cache.has(full)) return cache.get(full).exports;
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      fileName: relative,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache.set(full, mod);
    const requireSource = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('node:') || builtinModules.includes(name)) return require(name);
      if (name.startsWith('.')) {
        const relativePath = path.relative(root, path.resolve(path.dirname(full), name));
        for (const extension of ['', '.ts', '.tsx', '.js', '.cjs', '/index.ts']) {
          const candidate = path.join(root, relativePath + extension);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return visit(relativePath + extension);
        }
      }
      throw new Error(`Missing explicit test boundary ${name} in ${relative}`);
    };
    vm.runInNewContext(code, {
      module: mod, exports: mod.exports, require: requireSource, console,
      Buffer, TextEncoder, TextDecoder, URL, Blob, Date, AbortController, AbortSignal,
      DOMException, structuredClone, queueMicrotask, setTimeout, clearTimeout, setInterval, clearInterval,
      crypto: crypto.webcrypto, ...globals,
    }, { filename: relative });
    return mod.exports;
  }
  return visit(file);
}
module.exports = { load, root, ts };
