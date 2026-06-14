import { pool } from "../src/db";
import { hashPassword } from "../src/auth";
import { config } from "../src/config";

async function main() {
  const hash = await hashPassword(config.adminPassword);
  await pool.query(
    `INSERT INTO users (username, password_hash, role, tier)
       VALUES ($1, $2, 'admin', 'pro')
     ON CONFLICT (username)
       DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin'`,
    [config.adminUsername, hash],
  );
  console.log(`seed-admin: ensured admin user "${config.adminUsername}"`);
  await pool.end();
}

main().catch((err) => {
  console.error("seed-admin failed:", err);
  process.exit(1);
});
