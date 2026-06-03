import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourceMpvDir = path.join(projectRoot, "src-tauri", "resources", "mpv");
const packagedRoot = path.join(projectRoot, "src-tauri", "target", "release");
const packagedMpvDir = path.join(packagedRoot, "resources", "mpv");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
const distRoot = path.join(projectRoot, "dist");
const distIndexPath = path.join(distRoot, "index.html");

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

const releaseExe = assertFile(path.join(packagedRoot, "emby-player.exe"), "Tauri release executable", 1024 * 1024);
assertFile(path.join(packagedRoot, "electron_mpv_host.exe"), "Electron mpv helper executable", 128 * 1024);
const config = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
const configStat = assertFile(tauriConfigPath, "Tauri config", 100);
const packageStat = assertFile(path.join(projectRoot, "package.json"), "package manifest", 100);
if (releaseExe.mtimeMs + 1000 < configStat.mtimeMs) {
  fail("Tauri release executable is older than tauri.conf.json; rebuild with npm.cmd run tauri:build");
}
if (releaseExe.mtimeMs + 1000 < packageStat.mtimeMs) {
  fail("Tauri release executable is older than package.json; rebuild with npm.cmd run tauri:build");
}
if (config?.mainBinaryName !== "emby-player") {
  fail(`tauri.conf.json mainBinaryName must be "emby-player", got ${JSON.stringify(config?.mainBinaryName)}`);
}
if (config?.build?.frontendDist !== "../dist") {
  fail(`tauri.conf.json build.frontendDist must be "../dist", got ${JSON.stringify(config?.build?.frontendDist)}`);
}
const distIndexStat = assertFile(distIndexPath, "frontend dist index", 100);
if (releaseExe.mtimeMs + 1000 < distIndexStat.mtimeMs) {
  fail("Tauri release executable is older than dist/index.html; rebuild with npm.cmd run tauri:build");
}
const distIndex = fs.readFileSync(distIndexPath, "utf8");
if (!distIndex.includes('<div id="app"></div>')) fail("frontend dist index does not contain the Vue app mount");
if (!distIndex.includes("./assets/")) fail("frontend dist index does not reference local built assets");
const distAssetsDir = path.join(distRoot, "assets");
const distAssets = listFiles(distAssetsDir);
if (!distAssets.some((file) => /^index-.*\.js$/.test(file))) fail("frontend dist assets do not include a built index js chunk");
if (!distAssets.some((file) => /^index-.*\.css$/.test(file))) fail("frontend dist assets do not include a built index css chunk");

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
  )} (${totalMiB} MiB), release executable and frontend dist present.`,
);
