<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Icon } from "@iconify/vue";

import GlassButton from "@/components/common/GlassButton.vue";
import GlassInput from "@/components/common/GlassInput.vue";
import { useAuthStore } from "@/stores/auth";
import { useServerStore } from "@/stores/server";
import type { ServerKind } from "@/types/models";
import { normalizeNullableText, parseHeaderText } from "@/utils/headerText";
import { normalizeServerBaseUrl } from "@/utils/serverUrl";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", id: string, loggedIn?: boolean): void;
}>();

const auth = useAuthStore();
const serverStore = useServerStore();

type LineDraft = {
  id: string;
  name: string;
  baseUrl: string;
  port: string;
  userAgent: string;
  headersText: string;
};

type LinePayload = {
  id: string;
  name: string;
  baseUrl: string;
  userAgent: string | null;
  headers: [string, string][];
  priority: number;
  enabled: boolean;
};

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createLineDraft(name: string): LineDraft {
  return {
    id: createId(),
    name,
    baseUrl: "",
    port: "",
    userAgent: "",
    headersText: "",
  };
}

const form = reactive({
  username: "",
  password: "",
  showPassword: false,
  lines: [createLineDraft("主线路")],
});

const submitting = ref(false);
const errorText = ref<string | null>(null);
const statusText = ref<string | null>(null);

const hasCredentials = computed(
  () => form.username.trim().length > 0 || form.password.length > 0,
);
const primaryLabel = computed(() => (hasCredentials.value ? "保存并登录" : "保存"));

function addLine() {
  form.lines.push(createLineDraft(`线路 ${form.lines.length + 1}`));
}
function removeLine(idx: number) {
  if (form.lines.length === 1) return;
  form.lines.splice(idx, 1);
}

function linePayload(line: LineDraft, index: number): LinePayload {
  const baseUrl = normalizeServerBaseUrl(line.baseUrl, line.port);
  if (!baseUrl) throw new Error(`线路 ${index + 1} 需要填写地址`);
  return {
    id: line.id,
    name: line.name.trim() || `线路 ${index + 1}`,
    baseUrl,
    userAgent: normalizeNullableText(line.userAgent),
    headers: parseHeaderText(line.headersText),
    priority: index,
    enabled: true,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError && error.message.includes("Invalid URL")) {
    return "服务器地址格式不正确";
  }
  return error instanceof Error ? error.message : String(error);
}

function serverHostLabel(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^\[|\]$/g, "") || parsed.host || null;
  } catch {
    return null;
  }
}

function fallbackServerName(lines: LinePayload[], activeLineId: string | null): string {
  const activeLine = lines.find((line) => line.id === activeLineId) ?? lines[0];
  return (activeLine ? serverHostLabel(activeLine.baseUrl) : null) ?? "媒体服务器";
}

async function submit() {
  errorText.value = null;
  statusText.value = null;
  if (hasCredentials.value && (!form.username.trim() || !form.password)) {
    errorText.value = "登录需要同时填写账号和密码";
    return;
  }

  let lines: LinePayload[];
  try {
    lines = form.lines.map(linePayload);
  } catch (error) {
    errorText.value = errorMessage(error);
    return;
  }

  submitting.value = true;
  try {
    statusText.value = "正在识别 Emby/Jellyfin…";
    const detected = await serverStore.detectServer({
      lines,
      defaultUserAgent: null,
    });
    const kind: ServerKind = detected.kind;
    const activeLineId = detected.winningLineId;
    const name = detected.serverName?.trim() || fallbackServerName(lines, activeLineId);

    statusText.value = hasCredentials.value ? "正在保存并登录…" : "正在保存服务器…";
    const server = await serverStore.addServer({
      name,
      kind,
      activeLineId,
      lines,
      defaultUserAgent: null,
    });

    let loggedIn = false;
    if (hasCredentials.value) {
      await auth.login({
        serverId: server.id,
        username: form.username.trim(),
        password: form.password,
      });
      loggedIn = true;
    }

    emit("created", server.id, loggedIn);
    emit("close");
  } catch (error) {
    errorText.value = errorMessage(error);
  } finally {
    submitting.value = false;
    statusText.value = null;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" @click.self="emit('close')">
      <div class="modal glass glass-strong">
        <header class="modal__head">
          <h3>添加服务器</h3>
          <button class="iconbtn" @click="emit('close')" aria-label="Close">
            <Icon icon="lucide:x" width="18" />
          </button>
        </header>

        <div class="modal__body">
          <section>
            <header class="section-head">
              <h4>账号</h4>
            </header>
            <div class="account-grid">
              <GlassInput
                v-model="form.username"
                placeholder="用户名"
                autocomplete="username"
                icon="lucide:user"
              />
              <GlassInput
                v-model="form.password"
                :type="form.showPassword ? 'text' : 'password'"
                placeholder="密码"
                autocomplete="current-password"
                icon="lucide:lock"
                :right-icon="form.showPassword ? 'lucide:eye-off' : 'lucide:eye'"
                @rightIconClick="form.showPassword = !form.showPassword"
              />
            </div>
          </section>

          <section>
            <header class="section-head">
              <h4>线路</h4>
              <button class="link" @click="addLine">
                <Icon icon="lucide:plus" width="14" />
                新增线路
              </button>
            </header>
            <div v-for="(line, idx) in form.lines" :key="line.id" class="line-card">
              <div class="line-card__top">
                <GlassInput v-model="line.name" placeholder="线路名（可选）" />
                <button class="iconbtn danger" @click="removeLine(idx)" :disabled="form.lines.length === 1">
                  <Icon icon="lucide:trash-2" width="16" />
                </button>
              </div>
              <div class="line-url">
                <GlassInput v-model="line.baseUrl" placeholder="https://example.com:443 或 192.168.1.2:8096" />
                <GlassInput v-model="line.port" placeholder="可选端口" />
              </div>
              <details class="line-advanced">
                <summary>
                  <Icon icon="lucide:sliders-horizontal" width="14" />
                  高级
                </summary>
                <label class="field">
                  <span>User-Agent</span>
                  <GlassInput v-model="line.userAgent" placeholder="留空使用默认 UA" />
                </label>
                <label class="field">
                  <span>Headers</span>
                  <textarea v-model="line.headersText" placeholder="X-Header: value"></textarea>
                </label>
              </details>
            </div>
          </section>

          <p v-if="statusText" class="status">{{ statusText }}</p>
          <p v-if="errorText" class="err">{{ errorText }}</p>
        </div>

        <footer class="modal__foot">
          <GlassButton variant="ghost" @click="emit('close')">取消</GlassButton>
          <GlassButton variant="primary" :loading="submitting" @click="submit">
            {{ primaryLabel }}
          </GlassButton>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  padding: 24px;
}
.modal {
  box-sizing: border-box;
  width: min(600px, calc(100vw - 48px));
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--separator);
}
.modal__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.modal__foot {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--separator);
  background: rgba(20, 20, 24, 0.72);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field > span {
  font-size: 12px;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.section-head h4 {
  margin: 0;
  font-size: 13px;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.line-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0 14px;
  border-top: 1px solid var(--separator);
}
.line-card:first-of-type {
  border-top: none;
  padding-top: 0;
}
.line-card__top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}
.line-url {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: 8px;
}
.account-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.line-advanced {
  margin-top: 2px;
  border-top: 1px solid var(--separator);
  padding-top: 10px;
}
.line-advanced summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--fg-secondary);
  font-size: 12px;
}
.line-advanced[open] summary {
  margin-bottom: 10px;
  color: var(--accent);
}
textarea {
  min-height: 78px;
  resize: vertical;
  outline: none;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-primary);
  font: inherit;
  padding: 11px 13px;
}
textarea:focus {
  border-color: rgba(10, 132, 255, 0.6);
  box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.18);
}
textarea::placeholder {
  color: var(--fg-tertiary);
}
.iconbtn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-primary);
  height: 32px;
  width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
}
.iconbtn:hover {
  background: rgba(255, 255, 255, 0.08);
}
.iconbtn.danger {
  color: var(--danger);
}
.iconbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.link {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.status,
.err {
  font-size: 13px;
  margin: 0;
}
.status {
  color: var(--fg-secondary);
}
.err {
  color: var(--danger);
}
@media (max-width: 620px) {
  .modal-mask {
    padding: 12px;
  }
  .modal {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }
  .modal__foot {
    justify-content: stretch;
  }
  .line-url,
  .account-grid {
    grid-template-columns: 1fr;
  }
}
</style>
