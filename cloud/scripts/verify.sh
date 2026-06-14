#!/usr/bin/env bash
# End-to-end smoke of the deployed cloud: health, register, admin code gen, redeem.
cd "$(dirname "$0")/.."
B=http://localhost:8090
echo "=== ps ==="; docker compose ps --format "{{.Name}} {{.Status}}"
echo "=== app logs ==="; docker compose logs app --tail 10 2>&1 | tail -n 10
echo "=== health ==="; curl -s "$B/health"; echo ""
echo "=== register ==="; curl -s -X POST "$B/auth/register" -H "Content-Type: application/json" -d '{"username":"smoke_u","password":"smoke12345"}' | head -c 160; echo ""
ADMIN_PW=$(grep ADMIN_PASSWORD .env | cut -d= -f2)
echo "=== admin user: admin / $ADMIN_PW ==="
TOKEN=$(curl -s -X POST "$B/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "admin_token_len=${#TOKEN}"
CODE=$(curl -s -X POST "$B/admin/codes" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"count":1,"proDays":30}' | grep -oE '[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}' | head -n1)
echo "generated_code=$CODE"
UTOKEN=$(curl -s -X POST "$B/auth/login" -H "Content-Type: application/json" -d '{"username":"smoke_u","password":"smoke12345"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "=== redeem ==="; curl -s -X POST "$B/codes/redeem" -H "Authorization: Bearer $UTOKEN" -H "Content-Type: application/json" -d "{\"code\":\"$CODE\"}"; echo ""
echo "=== me (should be pro) ==="; curl -s "$B/me" -H "Authorization: Bearer $UTOKEN"; echo ""
echo "=== external reachability (panel title) ==="; curl -s "$B/admin/panel" | grep -o "管理后台" | head -n1
