import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import { router } from "./router";
import { installTauriCompatBridge } from "./platform";

import "./styles/theme.css";
import "./styles/glass.css";

function initialMemoryRoute(): string | null {
  if (typeof window === "undefined") return null;
  const { protocol, pathname, search, hash } = window.location;
  if (hash.startsWith("#/")) return hash.slice(1);
  if (protocol === "file:" || !pathname || pathname === "/" || pathname.endsWith("/index.html")) {
    return null;
  }
  return `${pathname}${search}`;
}

const app = createApp(App);
installTauriCompatBridge();
app.use(createPinia());
app.use(router);
const initialRoute = initialMemoryRoute();
if (initialRoute) router.replace(initialRoute).catch(() => {});
app.mount("#app");
