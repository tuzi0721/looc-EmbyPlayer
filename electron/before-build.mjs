import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export const ELECTRON_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: hills-image: http: https:",
  "connect-src 'self' hills-image: http: https: ws: wss:",
  "media-src 'self' blob: http: https:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const CSP_META_PATTERN =
  /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"Content-Security-Policy"|'Content-Security-Policy'|Content-Security-Policy)(?:\s|\/?>))[^>]*>/gi;

export function injectElectronCsp(html) {
  if (typeof html !== "string") throw new TypeError("Electron index HTML must be a string");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${ELECTRON_CSP}">`;
  const withoutExisting = html.replace(CSP_META_PATTERN, "");
  const next = withoutExisting.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    ${meta}`);
  if (next === withoutExisting) throw new Error("failed to inject Electron CSP into dist/index.html");
  const matches = next.match(CSP_META_PATTERN) ?? [];
  if (matches.length !== 1 || matches[0] !== meta) {
    throw new Error("failed to enforce the exact Electron CSP in dist/index.html");
  }
  return next;
}

// Runtime node_modules are intentionally not copied: Vite bundles the renderer,
// and the Electron main/preload layer uses only Electron, Node built-ins, and local files.
export default async function beforeBuild() {
  const indexPath = path.join(rootDir, "dist", "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const next = injectElectronCsp(html);
  if (next !== html) await fs.writeFile(indexPath, next, "utf8");
  return false;
}
