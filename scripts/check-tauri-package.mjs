import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourceMpvDir = path.join(projectRoot, "src-tauri", "resources", "mpv");
const packagedRoot = path.join(projectRoot, "src-tauri", "target", "release");
const packagedMpvDir = path.join(packagedRoot, "resources", "mpv");

const requiredRuntimeFiles = new Map([
  ["mpv.exe", 50 * 1024 * 1024],
  ["libmpv-2.dll", 20 * 1024 * 1024],
  ["d3dcompiler_43.dll", 1024 * 1024],
  [path.join("mpv", "fonts.conf"), 100],
]);

function fail(message) {
  console.error(`Tauri package integrity failed: ${message}`);
  process.exit(1);
}

function assertFile(filePath, description, minBytes = 1) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    fail(`${description} is missing at ${path.relative(projectRoot, filePath)}`);
  }
  if (!stat.isFile()) fail(`${description} is not a file: ${path.relative(projectRoot, filePath)}`);
  if (stat.size < minBytes) {
    fail(`${description} is too small (${stat.size} bytes): ${path.relative(projectRoot, filePath)}`);
  }
  return stat;
}

function listFiles(root, prefix = "") {
  const entries = fs.readdirSync(path.join(root, prefix), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) return listFiles(root, relativePath);
    if (entry.isFile()) return [relativePath];
    return [];
  });
}

assertFile(path.join(packagedRoot, "emby-player.exe"), "Tauri release executable", 1024 * 1024);

const sourceFiles = listFiles(sourceMpvDir);
if (sourceFiles.length === 0) fail("bundled mpv source directory is empty");

let totalBytes = 0;
for (const relativePath of sourceFiles) {
  const sourceStat = assertFile(path.join(sourceMpvDir, relativePath), `source mpv file ${relativePath}`);
  const packagedStat = assertFile(path.join(packagedMpvDir, relativePath), `packaged mpv file ${relativePath}`);
  if (sourceStat.size !== packagedStat.size) {
    fail(`packaged mpv file size mismatch for ${relativePath}: source ${sourceStat.size}, packaged ${packagedStat.size}`);
  }
  totalBytes += packagedStat.size;
}

for (const [relativePath, minBytes] of requiredRuntimeFiles) {
  assertFile(path.join(packagedMpvDir, relativePath), `required bundled mpv runtime file ${relativePath}`, minBytes);
}

const totalMiB = (totalBytes / 1024 / 1024).toFixed(1);
console.log(
  `Tauri package integrity ok: ${sourceFiles.length} bundled mpv files copied to ${path.relative(
    projectRoot,
    packagedMpvDir,
  )} (${totalMiB} MiB), release executable present.`,
);
