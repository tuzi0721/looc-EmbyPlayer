import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const scanEntries = ["src", "electron"];
const sourceExtensions = new Set([".css", ".html", ".js", ".mjs", ".ts", ".tsx", ".vue"]);
const ignoredDirectories = new Set(["dist", "node_modules", "release-electron"]);

const forbidden = [
  {
    label: "planned Chinese UI copy",
    pattern: /待接入|计划中|敬请期待/g,
  },
  {
    label: "unimplemented Chinese UI copy",
    pattern: /未接入|未实现/g,
  },
  {
    label: "unimplemented English UI copy",
    pattern: /\b(?:not implemented|coming soon)\b/gi,
  },
];

function toRelative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

async function collectFiles(entry) {
  const full = path.join(root, entry);
  const stat = await fs.stat(full);
  if (stat.isFile()) return [full];
  if (!stat.isDirectory()) return [];

  const files = [];
  const children = await fs.readdir(full, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory() && ignoredDirectories.has(child.name)) continue;
    const childPath = path.join(full, child.name);
    if (child.isDirectory()) {
      files.push(...(await collectFiles(path.relative(root, childPath))));
      continue;
    }
    if (!child.isFile()) continue;
    if (sourceExtensions.has(path.extname(child.name).toLowerCase())) files.push(childPath);
  }
  return files;
}

function lineColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

const files = [
  ...new Set((await Promise.all(scanEntries.map(collectFiles))).flat().map(toRelative)),
].sort();

const failures = [];
for (const file of files) {
  const text = await fs.readFile(path.join(root, file), "utf8");
  for (const rule of forbidden) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const where = lineColumn(text, match.index ?? 0);
      failures.push({
        file,
        label: rule.label,
        line: where.line,
        column: where.column,
        value: match[0],
      });
    }
  }
}

if (failures.length > 0) {
  console.error("No planned UI check failed. Remove fake or placeholder product entries.");
  for (const failure of failures) {
    console.error(
      `- ${failure.file}:${failure.line}:${failure.column} ${failure.label}: ${failure.value}`,
    );
  }
  process.exit(1);
}

console.log(`No planned UI check ok: ${files.length} source files scanned.`);
