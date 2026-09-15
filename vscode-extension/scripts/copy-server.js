// Copies the pre-built stdio MCP server bundle from the repo root into
// vscode-extension/server so it can be packaged into the .vsix.
//
// icedq-mcp-server.js at the repo root is already the esbuild-bundled
// output (single file, only node builtin imports) — there is no separate
// "build:stdio" step or dist/ folder to build it from, so it's copied
// directly from the repo root.
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const extensionRoot = path.resolve(__dirname, '..');
const serverDir = path.join(extensionRoot, 'server');

console.log('[icedq-mcp] copying server bundle into extension...');
fs.rmSync(serverDir, { recursive: true, force: true });
fs.mkdirSync(serverDir, { recursive: true });

fs.copyFileSync(
  path.join(repoRoot, 'icedq-mcp-server.js'),
  path.join(serverDir, 'icedq-mcp-server.js')
);

for (const dir of ['guidance', 'skills']) {
  const src = path.join(repoRoot, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(serverDir, dir), { recursive: true });
  }
}

// dist/icedq-mcp-server.js uses ESM `import` syntax; mark this folder as a
// module scope so Node resolves it correctly when VS Code spawns it directly.
fs.writeFileSync(
  path.join(serverDir, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2)
);

// Keep the extension's version and changelog in lockstep with the root
// project's — never hand-edited, always derived at build time so they can't
// drift out of sync with the actual released version.
//
// The version comes from CHANGELOG.md's topmost entry, not package.json:
// package.json's version is often a forward-looking "-SNAPSHOT" for the next
// release already in progress (e.g. 2.0.21-SNAPSHOT), while CHANGELOG.md's
// latest heading is the actual last-released version (e.g. 2.0.0) — the one
// this extension should track.
console.log('[icedq-mcp] syncing version and changelog from root project...');

const rootChangelogPath = path.join(repoRoot, 'CHANGELOG.md');
const rootChangelog = fs.readFileSync(rootChangelogPath, 'utf8');
const versionMatch = rootChangelog.match(/^##\s*\[(\d+\.\d+\.\d+)\]/m);
if (!versionMatch) {
  throw new Error('Could not find a "## [x.y.z]" version heading in root CHANGELOG.md');
}
const releaseVersion = versionMatch[1];

const extensionPackageJsonPath = path.join(extensionRoot, 'package.json');
const extensionPackageJson = JSON.parse(fs.readFileSync(extensionPackageJsonPath, 'utf8'));
if (extensionPackageJson.version !== releaseVersion) {
  extensionPackageJson.version = releaseVersion;
  fs.writeFileSync(
    extensionPackageJsonPath,
    JSON.stringify(extensionPackageJson, null, 2) + '\n'
  );
  console.log(`[icedq-mcp] extension version set to ${releaseVersion} (from root CHANGELOG.md)`);
}

fs.writeFileSync(path.join(extensionRoot, 'CHANGELOG.md'), rootChangelog);

console.log('[icedq-mcp] server bundle ready at', serverDir);
