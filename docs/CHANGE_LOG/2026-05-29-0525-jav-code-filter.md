# 2026-05-29 05:25 - JAV 番号过滤

## 本段目标
- 增加可开关的番号过滤能力，在媒体浏览、搜索和聚合入口中隐藏标题或元数据疑似包含 JAV 番号的条目。

## 变更
- `AppSettings` 新增 `hideJavCodes`，前端默认设置、Electron store 与 Tauri 配置模型保持一致。
- Tauri `update_settings` 支持写入 `hideJavCodes`。
- 新增 `src/utils/javFilter.ts`，集中维护 FC2、HEYZO、常见字母+数字番号的匹配规则，并提供列表过滤函数。
- 设置页“媒体库”面板新增“JAV 番号过滤”开关。
- 媒体库 store 的继续观看、媒体库列表、加载更多和搜索结果接入过滤；加载更多使用远端 raw offset，避免过滤后分页重复。
- 收藏、历史、聚合视界、工作室详情、详情页附加内容与相似内容列表接入同一过滤规则。

## 验证
- 初轮 `node --check electron\backend\store.mjs` 通过。
- 初轮 `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- 初轮 `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src\utils\javFilter.ts src\stores\library.ts src\views\SettingsView.vue src\views\FavoritesView.vue src\views\HistoryView.vue src\views\AggregateView.vue src\views\StudioView.vue src\views\DetailView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0525-jav-code-filter.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
