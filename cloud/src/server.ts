import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";

import { config, assertProductionSafety } from "./config";
import { query, withTransaction } from "./db";
import { hashPassword, verifyPassword, signToken, verifyToken } from "./auth";
import { encryptSecret, decryptSecret } from "./crypto";
import { generateCode, isCodeShapeValid, normalizeCode } from "./codes";

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  role: "user" | "admin";
  tier: "free" | "pro";
  pro_expires_at: string | null;
  disabled: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: UserRow;
  }
}

class HttpError extends Error {
  constructor(public statusCode: number, public override message: string) {
    super(message);
  }
}

function isProActive(user: Pick<UserRow, "tier" | "pro_expires_at">): boolean {
  return user.tier === "pro" && user.pro_expires_at != null && new Date(user.pro_expires_at) > new Date();
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    tier: u.tier,
    proExpiresAt: u.pro_expires_at,
    proActive: isProActive(u),
    disabled: u.disabled,
  };
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

async function loadUser(req: FastifyRequest): Promise<UserRow | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const { rows } = await query<UserRow>(
      "SELECT id, username, email, role, tier, pro_expires_at, disabled FROM users WHERE id=$1",
      [payload.sub],
    );
    const user = rows[0];
    if (!user || user.disabled) return null;
    return user;
  } catch {
    return null;
  }
}

async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await loadUser(req);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  req.user = user;
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireUser(req, reply);
  if (reply.sent) return;
  if (req.user!.role !== "admin") {
    reply.code(403).send({ error: "forbidden" });
  }
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) {
    reply.code(err.statusCode).send({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    reply.code(400).send({ error: "validation_error", details: err.issues });
    return;
  }
  app.log.error(err);
  reply.code(500).send({ error: "internal_error" });
});

// ---- health ----
app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));

// ---- admin web panel (问8) ----
const here = path.dirname(fileURLToPath(import.meta.url));
app.get("/", async (_req, reply) => reply.redirect("/admin/panel"));
app.get("/admin/panel", async (_req, reply) => {
  const html = fs.readFileSync(path.join(here, "..", "public", "admin.html"), "utf8");
  reply.header("content-type", "text/html; charset=utf-8").send(html);
});

// ---- auth (问7) ----
const credsSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(256),
  email: z.string().email().optional(),
});

app.post("/auth/register", async (req, reply) => {
  const body = credsSchema.parse(req.body);
  const exists = await query("SELECT 1 FROM users WHERE username=$1", [body.username]);
  if (exists.rowCount) throw new HttpError(409, "username_taken");
  const hash = await hashPassword(body.password);
  const { rows } = await query<UserRow>(
    `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, username, email, role, tier, pro_expires_at, disabled`,
    [body.username, body.email ?? null, hash],
  );
  const user = rows[0]!;
  const token = signToken({ sub: user.id, role: user.role, username: user.username });
  reply.code(201).send({ token, user: publicUser(user) });
});

app.post("/auth/login", async (req, reply) => {
  const body = z.object({ username: z.string(), password: z.string() }).parse(req.body);
  const { rows } = await query<UserRow & { password_hash: string }>(
    "SELECT id, username, email, role, tier, pro_expires_at, disabled, password_hash FROM users WHERE username=$1",
    [body.username],
  );
  const user = rows[0];
  if (!user || user.disabled || !(await verifyPassword(body.password, user.password_hash))) {
    throw new HttpError(401, "invalid_credentials");
  }
  const token = signToken({ sub: user.id, role: user.role, username: user.username });
  reply.send({ token, user: publicUser(user) });
});

app.get("/me", { preHandler: requireUser }, async (req) => ({ user: publicUser(req.user!) }));

// ---- Emby account cloud sync (问6) — Pro only ----
const embyAccountSchema = z.object({
  serverName: z.string().min(1),
  baseUrl: z.string().url(),
  username: z.string().nullable().optional(),
  secret: z.string().min(1), // emby access token / password (encrypted at rest)
  meta: z.record(z.string(), z.unknown()).optional(),
});

app.get("/sync/emby-accounts", { preHandler: requireUser }, async (req) => {
  if (!isProActive(req.user!)) throw new HttpError(402, "pro_required");
  const { rows } = await query<{
    id: string;
    server_name: string;
    base_url: string;
    username: string | null;
    cipher: string;
    meta: Record<string, unknown>;
    updated_at: string;
  }>(
    "SELECT id, server_name, base_url, username, cipher, meta, updated_at FROM emby_accounts WHERE user_id=$1 ORDER BY updated_at DESC",
    [req.user!.id],
  );
  return {
    accounts: rows.map((r) => ({
      id: r.id,
      serverName: r.server_name,
      baseUrl: r.base_url,
      username: r.username,
      secret: decryptSecret(r.cipher),
      meta: r.meta,
      updatedAt: r.updated_at,
    })),
  };
});

app.put("/sync/emby-accounts", { preHandler: requireUser }, async (req) => {
  if (!isProActive(req.user!)) throw new HttpError(402, "pro_required");
  const body = z.object({ accounts: z.array(embyAccountSchema) }).parse(req.body);
  const userId = req.user!.id;
  await withTransaction(async (client) => {
    for (const a of body.accounts) {
      await client.query(
        `INSERT INTO emby_accounts (user_id, server_name, base_url, username, cipher, meta, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6, now())
         ON CONFLICT (user_id, base_url, username)
           DO UPDATE SET server_name=EXCLUDED.server_name, cipher=EXCLUDED.cipher,
                         meta=EXCLUDED.meta, updated_at=now()`,
        [userId, a.serverName, a.baseUrl, a.username ?? null, encryptSecret(a.secret), JSON.stringify(a.meta ?? {})],
      );
    }
  });
  return { ok: true, count: body.accounts.length };
});

// ---- Redemption (问7) ----
app.post("/codes/redeem", { preHandler: requireUser }, async (req) => {
  const body = z.object({ code: z.string() }).parse(req.body);
  const code = normalizeCode(body.code);
  if (!isCodeShapeValid(code)) throw new HttpError(400, "invalid_code");
  const userId = req.user!.id;
  const proExpiresAt = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      pro_days: number;
      expires_at: string | null;
      redeemed_by: string | null;
      revoked: boolean;
    }>("SELECT pro_days, expires_at, redeemed_by, revoked FROM redemption_codes WHERE code=$1 FOR UPDATE", [code]);
    const rec = rows[0];
    if (!rec) throw new HttpError(404, "code_not_found");
    if (rec.revoked) throw new HttpError(409, "code_revoked");
    if (rec.redeemed_by) throw new HttpError(409, "code_already_used");
    if (rec.expires_at && new Date(rec.expires_at) < new Date()) throw new HttpError(409, "code_expired");
    const upd = await client.query<{ pro_expires_at: string }>(
      `UPDATE users
          SET tier='pro',
              pro_expires_at = GREATEST(COALESCE(pro_expires_at, now()), now()) + make_interval(days => $2),
              updated_at = now()
        WHERE id=$1
        RETURNING pro_expires_at`,
      [userId, rec.pro_days],
    );
    await client.query("UPDATE redemption_codes SET redeemed_by=$1, redeemed_at=now() WHERE code=$2", [userId, code]);
    await client.query(
      "INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1,'redeem',$2,$3)",
      [userId, code, JSON.stringify({ pro_days: rec.pro_days })],
    );
    return upd.rows[0]!.pro_expires_at;
  });
  return { ok: true, tier: "pro", proExpiresAt };
});

// ---- Admin (问8) ----
app.post("/admin/codes", { preHandler: requireAdmin }, async (req, reply) => {
  const body = z
    .object({
      count: z.number().int().min(1).max(1000),
      proDays: z.number().int().min(1).max(3650),
      expiresInDays: z.number().int().min(1).max(3650).optional(),
      note: z.string().max(200).optional(),
    })
    .parse(req.body);
  const batchId = crypto.randomUUID();
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400_000).toISOString()
    : null;
  const codes: string[] = [];
  await withTransaction(async (client) => {
    for (let i = 0; i < body.count; i++) {
      let code = generateCode();
      // Extremely unlikely collision guard.
      for (let tries = 0; tries < 5; tries++) {
        const dup = await client.query("SELECT 1 FROM redemption_codes WHERE code=$1", [code]);
        if (!dup.rowCount) break;
        code = generateCode();
      }
      await client.query(
        "INSERT INTO redemption_codes (code, batch_id, pro_days, expires_at, note) VALUES ($1,$2,$3,$4,$5)",
        [code, batchId, body.proDays, expiresAt, body.note ?? null],
      );
      codes.push(code);
    }
    await client.query(
      "INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1,'generate_codes',$2,$3)",
      [req.user!.id, batchId, JSON.stringify({ count: body.count, proDays: body.proDays, expiresAt })],
    );
  });
  reply.code(201).send({ batchId, proDays: body.proDays, expiresAt, codes });
});

app.get("/admin/codes", { preHandler: requireAdmin }, async (req) => {
  const q = z
    .object({
      batchId: z.string().uuid().optional(),
      redeemed: z.enum(["true", "false"]).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    })
    .parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.batchId) {
    params.push(q.batchId);
    where.push(`batch_id=$${params.length}`);
  }
  if (q.redeemed === "true") where.push("redeemed_by IS NOT NULL");
  if (q.redeemed === "false") where.push("redeemed_by IS NULL");
  params.push(q.limit);
  const { rows } = await query(
    `SELECT c.code, c.batch_id, c.pro_days, c.expires_at, c.redeemed_at, c.revoked, c.note,
            u.username AS redeemed_by_username
       FROM redemption_codes c
       LEFT JOIN users u ON u.id = c.redeemed_by
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY c.created_at DESC
       LIMIT $${params.length}`,
    params,
  );
  return { codes: rows };
});

app.post("/admin/codes/:code/revoke", { preHandler: requireAdmin }, async (req) => {
  const { code } = z.object({ code: z.string() }).parse(req.params);
  const norm = normalizeCode(code);
  const { rowCount } = await query("UPDATE redemption_codes SET revoked=TRUE WHERE code=$1 AND redeemed_by IS NULL", [norm]);
  await query("INSERT INTO audit_log (actor_id, action, target) VALUES ($1,'revoke_code',$2)", [req.user!.id, norm]);
  if (!rowCount) throw new HttpError(409, "not_revocable"); // already used or missing
  return { ok: true };
});

app.get("/admin/users", { preHandler: requireAdmin }, async (req) => {
  const q = z.object({ query: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  const params: unknown[] = [];
  let where = "";
  if (q.query) {
    params.push(`%${q.query}%`);
    where = `WHERE username ILIKE $1 OR email ILIKE $1`;
  }
  params.push(q.limit);
  const { rows } = await query<UserRow>(
    `SELECT id, username, email, role, tier, pro_expires_at, disabled FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return { users: rows.map(publicUser) };
});

app.post("/admin/users/:id/revoke-pro", { preHandler: requireAdmin }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  await query("UPDATE users SET tier='free', pro_expires_at=NULL, updated_at=now() WHERE id=$1", [id]);
  await query("INSERT INTO audit_log (actor_id, action, target) VALUES ($1,'revoke_pro',$2)", [req.user!.id, id]);
  return { ok: true };
});

app.post("/admin/users/:id/disable", { preHandler: requireAdmin }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({ disabled: z.boolean() }).parse(req.body);
  await query("UPDATE users SET disabled=$2, updated_at=now() WHERE id=$1", [id, body.disabled]);
  await query("INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1,'set_disabled',$2,$3)", [
    req.user!.id,
    id,
    JSON.stringify({ disabled: body.disabled }),
  ]);
  return { ok: true };
});

for (const w of assertProductionSafety()) app.log.warn(`[security] ${w}`);

app
  .listen({ port: config.port, host: config.host })
  .then((addr) => app.log.info(`Hills Lite Cloud listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
