# 2026-06-10 21:50 设置·通用·网络（忽略 SSL / 代理模式 / HTTP 代理地址）

## 背景
按参考截图（`docs/SETTINGS_REFERENCE_HILLSLITE.md`·通用·网络）1:1 复刻：
忽略 SSL 证书校验、网络代理（不使用/跟随系统/自定义）、HTTP 代理地址。

## 变更
- Rust `config/models.rs`：新增 `NetworkProxyMode`（none/system/custom，默认 system）、
  `AppSettings.ignore_ssl_errors / network_proxy_mode / http_proxy_url`。
- Rust `network/http.rs`：`build_client(&AppSettings)` —— `danger_accept_invalid_certs`、
  `no_proxy()`（不使用）、默认环境代理（跟随系统）、`Proxy::all(url)`（自定义）。
- `state.rs` 适配新签名；`commands/settings.rs` patch 三项落盘。
- 前端：TS 类型 + 三处默认值 + Electron store 默认值；`SettingsView` 网络面板顶部新增
  忽略 SSL 开关、代理模式三段选择、自定义时显示 HTTP 代理地址输入（占位 http://127.0.0.1:7897）。

## 生效语义
- HTTP 客户端在应用启动时构建一次 → 三项均**重启后生效**（UI 已标注）。

## 验证
- `npm run build` 绿（6.73s）；`cargo check --features mpv-embedded` 绿（29.8s）；
  `node --check` store.mjs 绿；无 lint。
- 行为待真机：自定义代理指向本地代理 → 重启后 API 流量经代理；忽略 SSL → 自签证书服务器可连。

## 残余
- mpv 拉流代理（`--http-proxy` 透传 standalone/embedded）下一批接（参考的「外部 mpv 使用系统代理」一并做）。
- 下载器/ASSRT 字幕等独立 `Client::new()` 调用点未统一走 `build_client`（后续收敛）。
- socks 代理需 reqwest `socks` feature（当前以 http(s) 代理为主，与参考一致）。
