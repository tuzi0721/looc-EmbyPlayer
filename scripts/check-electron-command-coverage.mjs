import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const electronMain = path.join(root, "electron", "main.mjs");
const sourceExt = new Set([".js", ".mjs", ".ts", ".vue"]);
const ignoredDirs = new Set(["node_modules", "dist", "release-electron"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      if (!ignoredDirs.has(name)) walk(file, out);
      continue;
    }
    if (sourceExt.has(path.extname(name))) out.push(file);
  }
  return out;
}

function collectRendererCommands() {
  const commands = new Map();
  const invokeCall = /\binvoke\s*(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g;
  for (const file of walk(srcDir)) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = invokeCall.exec(content))) {
      const command = match[1];
      const list = commands.get(command) ?? [];
      list.push(path.relative(root, file));
      commands.set(command, list);
    }
  }
  return commands;
}

function collectElectronHandlers() {
  const content = fs.readFileSync(electronMain, "utf8");
  const handled = new Set(
    [...content.matchAll(/command\s*===\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]),
  );
  const noOpBlock = content.match(/const noOpCommands = new Set\(\[([\s\S]*?)\]\);/m)?.[1] ?? "";
  const noOps = new Set([...noOpBlock.matchAll(/["'`]([^"'`]+)["'`]/g)].map((match) => match[1]));
  return { handled, noOps };
}

const rendererCommands = collectRendererCommands();
const { handled, noOps } = collectElectronHandlers();
const missing = [...rendererCommands.keys()]
  .filter((command) => !handled.has(command) && !noOps.has(command))
  .sort();

if (missing.length > 0) {
  console.error("Electron command coverage check failed.");
  for (const command of missing) {
    console.error(`- ${command}: ${rendererCommands.get(command).join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `Electron command coverage ok: ${rendererCommands.size} renderer commands, ` +
    `${handled.size} Electron handlers, ${noOps.size} explicit no-op commands.`,
);
