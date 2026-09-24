import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoots = ['apps/api', 'apps/web'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const generatedDirectories = new Set(['dist', 'coverage', 'node_modules']);

export function prohibitedImports(source, filePath) {
  const currentApp = appRoots.find((appRoot) =>
    filePath.startsWith(path.join(repoRoot, appRoot) + path.sep),
  );
  if (!currentApp) return [];
  const otherApp = appRoots.find((appRoot) => appRoot !== currentApp);
  const otherRoot = path.join(repoRoot, otherApp);
  const otherPackage = otherApp === 'apps/api' ? '@nosso-clima/api' : '@nosso-clima/web';
  const tree = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  const violations = [];
  function inspect(specifier, position) {
    if (specifier?.type !== 'StringLiteral') return;
    const imported = specifier.value;
    const resolved = path.resolve(path.dirname(filePath), imported);
    if (
      imported === otherPackage ||
      imported.startsWith(`${otherPackage}/`) ||
      (imported.startsWith('.') &&
        (resolved === otherRoot || resolved.startsWith(`${otherRoot}${path.sep}`)))
    ) {
      violations.push(
        `${path.relative(repoRoot, filePath)}:${position.line}: prohibited import ${imported}`,
      );
    }
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type))
      inspect(node.source, node.loc.start);
    if (node.type === 'ImportExpression') inspect(node.source, node.loc.start);
    if (
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' || node.callee?.name === 'require')
    )
      inspect(node.arguments?.[0], node.loc.start);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  return violations;
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory())
        return generatedDirectories.has(entry.name) ? [] : collectFiles(fullPath);
      return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
    }),
  );
  return files.flat();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = (
    await Promise.all(appRoots.map((appRoot) => collectFiles(path.join(repoRoot, appRoot))))
  ).flat();
  const violations = (
    await Promise.all(
      files.map(async (filePath) => prohibitedImports(await readFile(filePath, 'utf8'), filePath)),
    )
  ).flat();
  if (violations.length) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Application boundaries OK\n');
  }
}
