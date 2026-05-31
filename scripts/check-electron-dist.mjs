import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const productName = packageJson.build?.productName ?? packageJson.name;
const version = packageJson.version;
const outputDir = packageJson.build?.directories?.output ?? "dist-electron";
const portablePath = path.join(projectRoot, outputDir, `${productName} ${version}.exe`);

function fail(message) {
  console.error(`Electron portable integrity failed: ${message}`);
  process.exit(1);
}

let stat;
try {
  stat = fs.statSync(portablePath);
} catch {
  fail(`portable exe is missing at ${path.relative(projectRoot, portablePath)}`);
}

if (!stat.isFile()) {
  fail(`portable path is not a file: ${path.relative(projectRoot, portablePath)}`);
}

const minPortableBytes = 50 * 1024 * 1024;
if (stat.size < minPortableBytes) {
  fail(`portable exe is too small (${stat.size} bytes): ${path.relative(projectRoot, portablePath)}`);
}

const sizeMiB = (stat.size / 1024 / 1024).toFixed(1);
console.log(
  `Electron portable integrity ok: ${path.relative(projectRoot, portablePath)} (${sizeMiB} MiB).`,
);
