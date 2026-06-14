import "dotenv/config";

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: envStr("HOST", "0.0.0.0"),
  corsOrigin: envStr("CORS_ORIGIN", "*"),
  databaseUrl: envStr("DATABASE_URL", "postgres://emby:emby@localhost:5432/emby_cloud"),
  jwtSecret: envStr("JWT_SECRET", "dev-insecure-secret-change-me"),
  jwtExpiresIn: envStr("JWT_EXPIRES_IN", "30d"),
  // 32-byte (64 hex char) key for AES-256-GCM credential encryption.
  embyEncKey: envStr("EMBY_ENC_KEY", "0".repeat(64)),
  codeSignSecret: envStr("CODE_SIGN_SECRET", "dev-code-secret-change-me"),
  adminUsername: envStr("ADMIN_USERNAME", "admin"),
  adminPassword: envStr("ADMIN_PASSWORD", "admin12345"),
} as const;

export function assertProductionSafety(): string[] {
  const warnings: string[] = [];
  if (config.jwtSecret.includes("change-me") || config.jwtSecret.includes("insecure")) {
    warnings.push("JWT_SECRET is still a default/insecure value.");
  }
  if (config.embyEncKey === "0".repeat(64)) {
    warnings.push("EMBY_ENC_KEY is the all-zero default — set a real key (openssl rand -hex 32).");
  }
  if (config.codeSignSecret.includes("change-me")) {
    warnings.push("CODE_SIGN_SECRET is still a default value.");
  }
  return warnings;
}
