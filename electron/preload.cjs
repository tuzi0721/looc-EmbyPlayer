const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hillsLite", {
  invoke(command, args) {
    return ipcRenderer.invoke("hills:invoke", command, args ?? {});
  },
  invokeCancellable(command, args, options = {}) {
    const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const { signal } = options;

    const promise = ipcRenderer.invoke("hills:invoke:cancellable", requestId, command, args ?? {});

    if (signal && signal.aborted) {
      // If already aborted, cancel immediately.
      ipcRenderer.invoke("hills:invoke:cancel", requestId).catch(() => {});
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal) {
      const onAbort = () => {
        ipcRenderer.invoke("hills:invoke:cancel", requestId).catch(() => {});
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return promise;
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
