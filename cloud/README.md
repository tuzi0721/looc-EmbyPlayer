# Hills Lite Cloud (emby-player 云端账号系统)

Backend for the desktop player's cloud features:

- **问6 云端同步**：把用户的 Emby 账号（服务器地址 + 凭据）AES-256-GCM 加密后存到云端，换设备/重装可拉回。
- **问7 账号体系**：注册/登录（JWT）；`free` / `pro` 分级；**兑换码**（云端生成 → 本地输入 → 云端校验核销，给 Pro 时长）。未注册/普通仅影响云同步功能，不影响本地播放。
- **问8 管理后台 API**：批量发码、按批次/归属查码、吊销码、收回 Pro、禁用账号；所有管理动作写 `audit_log`。
- **问11 VPS 部署**：`docker compose` 一键起 Postgres + API。

> 技术栈：Node + TypeScript（用 `tsx` 直跑）、Fastify、Postgres（`pg`）、JWT、bcryptjs、zod。

## 目录
```
cloud/
  src/        config / db / crypto(AES-GCM) / auth(JWT) / codes(签名) / server(路由)
  scripts/    migrate.ts(建表) / seed-admin.ts(初始化管理员)
  db/         schema.sql
  Dockerfile  docker-compose.yml  .env.example
```

## 本地运行
```bash
cd cloud
cp .env.example .env            # 填 JWT_SECRET / EMBY_ENC_KEY(openssl rand -hex 32) / CODE_SIGN_SECRET
docker compose up -d db         # 起 Postgres
npm install
npm run migrate                 # 建表
npm run seed:admin              # 建管理员(ADMIN_USERNAME/ADMIN_PASSWORD)
npm run dev                     # 启动 API (默认 :8080)
```

## 一键容器化（VPS 用）
```bash
cd cloud
cp .env.example .env            # 改掉所有默认密钥！
docker compose up -d --build    # db + app；app 会自动 migrate + seed-admin + 启动
curl http://localhost:8080/health
```

## 接口一览
| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | /health | - | 健康检查 |
| POST | /auth/register | - | 注册，返回 token |
| POST | /auth/login | - | 登录，返回 token |
| GET | /me | user | 当前用户（含 proActive） |
| GET | /sync/emby-accounts | **pro** | 拉回已同步的 emby 账号（服务端解密后返给本人） |
| PUT | /sync/emby-accounts | **pro** | 上传/覆盖 emby 账号（加密存储） |
| POST | /codes/redeem | user | 核销兑换码 → 续 Pro 时长 |
| POST | /admin/codes | admin | 批量发码 `{count, proDays, expiresInDays?, note?}` |
| GET | /admin/codes | admin | 查码 `?batchId=&redeemed=true/false&limit=` |
| POST | /admin/codes/:code/revoke | admin | 吊销未使用的码 |
| GET | /admin/users | admin | 查用户 `?query=` |
| POST | /admin/users/:id/revoke-pro | admin | 收回 Pro |
| POST | /admin/users/:id/disable | admin | 禁用/解禁 `{disabled}` |

鉴权：请求头 `Authorization: Bearer <token>`。

## 安全
- Emby 凭据：`EMBY_ENC_KEY`(32B) 做 AES-256-GCM，密文 = base64(iv|tag|ct)。
- 兑换码：HMAC 校验位（防瞎猜/篡改），真实有效性以 DB 为准（已用/已吊销/已过期）。
- 生产务必：换掉所有默认密钥；TLS（前置 Caddy/Nginx）；改密钥登录、禁 root 密码登录；DB 不对公网暴露（去掉 db 的 ports 映射）。

## 与桌面 App 的对接（下一步）
- App「添加服务器」成功后，若已登录云账号且为 Pro → 调 `PUT /sync/emby-accounts` 上传（凭据本地仍保留，云端仅加密备份）。
- App 登录云账号后 → 调 `GET /sync/emby-accounts` 拉回，合并进本地服务器列表。
- 设置里加「云账号」区：注册/登录、显示 Pro 状态、输入兑换码（`POST /codes/redeem`）。

> 状态：后端骨架 + 核心逻辑已就绪（注册/登录/同步/兑换/管理）。待办：管理后台 Web 面板、App 端「云账号」UI 对接、VPS 实部署联调。
