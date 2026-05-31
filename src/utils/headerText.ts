export function normalizeNullableText(value: string): string | null {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function headersToText(headers: [string, string][] | undefined | null): string {
  if (!Array.isArray(headers)) return "";
  return headers
    .filter(([name, value]) => name.trim().length > 0 && value.trim().length > 0)
    .map(([name, value]) => `${name.trim()}: ${value.trim()}`)
    .join("\n");
}

export function parseHeaderText(value: string): [string, string][] {
  const headers: [string, string][] = [];
  const seen = new Set<string>();
  const lines = value.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(":");
    const equalsIndex = line.indexOf("=");
    const separatorIndex =
      colonIndex >= 0 && equalsIndex >= 0
        ? Math.min(colonIndex, equalsIndex)
        : Math.max(colonIndex, equalsIndex);

    if (separatorIndex <= 0) {
      throw new Error(`Headers 第 ${index + 1} 行需要使用 Name: Value`);
    }

    const name = line.slice(0, separatorIndex).trim();
    const headerValue = line.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new Error(`Headers 第 ${index + 1} 行名称无效`);
    }
    if (!headerValue) {
      throw new Error(`Headers 第 ${index + 1} 行值为空`);
    }

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    headers.push([name, headerValue]);
  }

  return headers;
}
