import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const productName = packageJson.build?.productName ?? packageJson.name;
const outputDir = packageJson.build?.directories?.output ?? "dist-electron";
const sourceMpvDir = path.join(projectRoot, "src-tauri", "resources", "mpv");
const packagedRoot = path.join(projectRoot, outputDir, "win-unpacked");
const packagedResourcesDir = path.join(packagedRoot, "resources");
const packagedMpvDir = path.join(packagedResourcesDir, "mpv");
const sourceHelperPath = path.join(projectRoot, "src-tauri", "target", "release", "electron_mpv_host.exe");
const packagedHelperPath = path.join(packagedResourcesDir, "electron_mpv_host.exe");

const requiredRuntimeFiles = new Map([
  ["mpv.exe", 50 * 1024 * 1024],
  ["libmpv-2.dll", 20 * 1024 * 1024],
  ["d3dcompiler_43.dll", 1024 * 1024],
  [path.join("mpv", "fonts.conf"), 100],
]);

function fail(message) {
  console.error(`Electron package integrity failed: ${message}`);
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

assertFile(path.join(packagedRoot, `${productName}.exe`), "packaged app executable", 1024 * 1024);
assertFile(path.join(packagedResourcesDir, "app.asar"), "app.asar", 100 * 1024);

const extraResources = packageJson.build?.extraResources ?? [];
const hasBundledMpvResource = extraResources.some((resource) => {
  return resource?.from === "src-tauri/resources/mpv" && resource?.to === "mpv";
});
if (!hasBundledMpvResource) {
  fail('package.json build.extraResources must copy "src-tauri/resources/mpv" to "mpv"');
}
const hasElectronMpvHostResource = extraResources.some((resource) => {
  return (
    resource?.from === "src-tauri/target/release/electron_mpv_host.exe" &&
    resource?.to === "electron_mpv_host.exe"
  );
});
if (!hasElectronMpvHostResource) {
  fail('package.json build.extraResources must copy "electron_mpv_host.exe" to resources');
}

const sourceHelperStat = assertFile(sourceHelperPath, "source electron mpv host helper", 100 * 1024);
const packagedHelperStat = assertFile(packagedHelperPath, "packaged electron mpv host helper", 100 * 1024);
if (sourceHelperStat.size !== packagedHelperStat.size) {
  fail(
    `packaged electron mpv host helper size mismatch: source ${sourceHelperStat.size}, packaged ${packagedHelperStat.size}`,
  );
}

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
  `Electron package integrity ok: ${sourceFiles.length} bundled mpv files copied to ${path.relative(
    projectRoot,
    packagedMpvDir,
  )} (${totalMiB} MiB), electron mpv host helper copied, app.asar present.`,
);
