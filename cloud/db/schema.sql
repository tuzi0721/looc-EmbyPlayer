-- Hills Lite Cloud schema
-- 问6 云端加密同步 emby 账号 / 问7 注册+Pro+兑换码 / 问8 管理后台
-- Idempotent: safe to run repeatedly (migrate.ts runs this).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- Cloud user accounts (问7) ----
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username       TEXT UNIQUE NOT NULL,
  email          TEXT UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  tier           TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro'
  pro_expires_at TIMESTAMPTZ,                     -- NULL = not pro
  disabled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Synced Emby accounts, credentials AES-256-GCM encrypted (问6) ----
CREATE TABLE IF NOT EXISTS emby_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_name TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  username    TEXT,
  cipher      TEXT NOT NULL,                      -- base64(iv | authTag | ciphertext)
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, base_url, username)
);
CREATE INDEX IF NOT EXISTS idx_emby_accounts_user ON emby_accounts (user_id);

-- ---- Redemption codes (问7 兑换码 / 问8 管理) ----
CREATE TABLE IF NOT EXISTS redemption_codes (
  code        TEXT PRIMARY KEY,                   -- formatted + HMAC-signed
  batch_id    UUID,                               -- groups a batch (问8 批量发码)
  pro_days    INTEGER NOT NULL CHECK (pro_days > 0), -- Pro duration granted (问8 时长档位)
  expires_at  TIMESTAMPTZ,                        -- code validity / 存活时长 (问8); NULL = no expiry
  redeemed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codes_batch ON redemption_codes (batch_id);
CREATE INDEX IF NOT EXISTS idx_codes_redeemed_by ON redemption_codes (redeemed_by);

-- ---- Audit log for admin actions (问8) ----
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
