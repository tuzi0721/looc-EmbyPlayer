#!/usr/bin/env bash
# Remove smoke-test data created during deploy verification.
cd "$(dirname "$0")/.."
docker compose exec -T db psql -U emby -d emby_cloud <<'SQL'
DELETE FROM users WHERE username='smoke_u';
DELETE FROM redemption_codes WHERE redeemed_at IS NOT NULL;
SELECT username, role, tier FROM users;
SQL
echo "CLEANED"
