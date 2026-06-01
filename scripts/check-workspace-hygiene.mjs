import { execFileSync } from "node:child_process";

const allowedIgnored = new Set([
  ".electron-user-data/",
  ".vscode/",
  "dist/",
  "node_modules/",
  "release-electron/",
  "src-tauri/target/",
]);

const output = execFileSync("git", ["status", "--short", "--ignored"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const failures = [];
for (const line of output ? output.split(/\r?\n/) : []) {
  if (line.startsWith("## ")) continue;

  if (line.startsWith("!! ")) {
    const file = line.slice(3).replaceAll("\\", "/").trim();
    if (!allowedIgnored.has(file)) {
      failures.push(`unexpected ignored path: ${file}`);
    }
    continue;
  }

  if (line.startsWith("?? ")) {
    failures.push(`unexpected untracked path: ${line.slice(3).trim()}`);
  }
}

if (failures.length > 0) {
  console.error("Workspace hygiene check failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Workspace hygiene ok: ${allowedIgnored.size} allowed ignored roots, no unexpected untracked files.`,
);
