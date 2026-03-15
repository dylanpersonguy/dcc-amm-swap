#!/usr/bin/env node
/**
 * Postinstall patch for @decentralchain/protobuf-serialization
 * Fixes ESM/CJS interop issue with protobufjs on Node 24+
 * 
 * The package uses `import * as $protobuf from "protobufjs/minimal"`
 * which breaks because protobufjs is CJS and namespace import doesn't
 * expose `roots` properly. We switch to a default import instead.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname, '..', 'node_modules',
  '@decentralchain', 'protobuf-serialization', 'dist', 'index.js'
);

if (!fs.existsSync(target)) {
  console.log('[postinstall] protobuf-serialization not found, skipping patch');
  process.exit(0);
}

let code = fs.readFileSync(target, 'utf8');

// Fix 1: Missing .js extension on protobufjs/minimal import
code = code.replace(
  /from "protobufjs\/minimal"/g,
  'from "protobufjs/minimal.js"'
);

// Fix 2: Switch namespace import to default import for CJS interop
if (code.includes('import * as $protobuf from "protobufjs/minimal.js"')) {
  code = code.replace(
    'import * as $protobuf from "protobufjs/minimal.js";',
    'import protobufMinimal from "protobufjs/minimal.js";\nconst $protobuf = protobufMinimal;'
  );
  fs.writeFileSync(target, code, 'utf8');
  console.log('[postinstall] Patched @decentralchain/protobuf-serialization for ESM/CJS interop');
} else if (code.includes('import protobufMinimal from')) {
  console.log('[postinstall] protobuf-serialization already patched');
} else {
  console.log('[postinstall] protobuf-serialization has unexpected import pattern, skipping');
}
