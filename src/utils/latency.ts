export function formatLatencyMs(value?: number | null): string | null {
  if (value == null) return null;
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0) return null;
  if (latency > 0 && latency < 10) return "<10ms";
  if (latency < 1000) return `${Math.round(latency)}ms`;
  const seconds = latency / 1000;
  return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}
