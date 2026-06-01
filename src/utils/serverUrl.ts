function inferProtocol(port: string): string {
  return port === "443" || port === "8920" ? "https" : "http";
}

function normalizePort(value: string): string {
  const port = value.trim();
  if (!port) return "";
  if (!/^\d{1,5}$/.test(port)) {
    throw new Error("端口必须是 1-65535 之间的数字");
  }
  const n = Number(port);
  if (n < 1 || n > 65535) {
    throw new Error("端口必须是 1-65535 之间的数字");
  }
  return String(n);
}

export function normalizeServerBaseUrl(address: string, portInput = ""): string {
  const trimmed = address.trim();
  const port = normalizePort(portInput);
  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${inferProtocol(port)}://${trimmed}`;
  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("服务器地址只支持 http 或 https");
  }
  if (port) url.port = port;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";

  const text = url.toString();
  if (url.pathname === "/" && text.endsWith("/")) return text.slice(0, -1);
  return text.replace(/\/+$/, "");
}
