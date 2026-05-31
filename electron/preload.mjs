import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hillsLite", {
  invoke(command, args) {
    return ipcRenderer.invoke("hills:invoke", command, args ?? {});
  },
  listen(event, handler) {
    const channel = `hills:event:${event}`;
    const listener = (_event, payload) => handler({ event, payload });
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  openFileDialog(options) {
    return ipcRenderer.invoke("hills:dialog:open", options ?? {});
  },
  platformType() {
    return ipcRenderer.invoke("hills:platform:type");
  },
});
