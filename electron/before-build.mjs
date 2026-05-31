// Runtime node_modules are intentionally not copied: Vite bundles the renderer,
// and the Electron main/preload layer uses only Electron, Node built-ins, and local files.
export default async function beforeBuild() {
  return false;
}
