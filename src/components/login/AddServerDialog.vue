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

function createLineDraft(): LineDraft {
  return {
    id: createId(),
    name: "",
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
  lines: [createLineDraft()],
});

const submitting = ref(false);
const errorText = ref<string | null>(null);
const statusText = ref<string | null>(null);

const hasCredentials = computed(
  () => form.username.trim().length > 0 || form.password.length > 0,
);
const primaryLabel = computed(() => (hasCredentials.value ? "保存并登录" : "保存服务器"));

function addLine() {
  form.lines.push(createLineDraft());
}

function removeLine(index: number) {
  if (form.lines.length === 1) return;
  form.lines.splice(index, 1);
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
    errorText.value = "登录需要同时填写用户名和密码";
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
    statusText.value = "正在识别 Emby / Jellyfin";
    const detected = await serverStore.detectServer({
      lines,
      defaultUserAgent: null,
    });
    const kind: ServerKind = detected.kind;
    const activeLineId = detected.winningLineId;
    const name = detected.serverName?.trim() || fallbackServerName(lines, activeLineId);

    statusText.value = hasCredentials.value ? "正在保存并登录" : "正在保存服务器";
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
      <form class="modal glass glass-strong" @submit.prevent="submit">
        <header class="modal__head">
          <div>
            <h3>添加服务器</h3>
            <p>自动识别 Emby / Jellyfin，保存后追加到现有服务器列表。</p>
          </div>
          <button class="iconbtn" type="button" @click="emit('close')" aria-label="关闭">
            <Icon icon="lucide:x" width="18" />
          </button>
        </header>

        <div class="modal__body">
          <section class="section">
            <header class="section-head">
              <h4>账号</h4>
              <span>可留空，只保存服务器</span>
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

          <section class="section">
            <header class="section-head">
              <h4>线路</h4>
              <button class="text-action" type="button" @click="addLine">
                <Icon icon="lucide:plus" width="14" />
                新增线路
              </button>
            </header>

            <div class="lines">
              <div v-for="(line, index) in form.lines" :key="line.id" class="line-entry">
                <div class="line-entry__index">{{ index + 1 }}</div>
                <div class="line-entry__main">
                  <div class="line-url">
                    <GlassInput
                      v-model="line.baseUrl"
                      placeholder="https://example.com 或 192.168.1.2"
                      icon="lucide:globe-2"
                    />
                    <GlassInput v-model="line.port" placeholder="端口：443 / 8096 / 任意" />
                  </div>

                  <details class="line-advanced">
                    <summary>
                      <Icon icon="lucide:sliders-horizontal" width="14" />
                      高级设置
                    </summary>
                    <div class="advanced-grid">
                      <GlassInput v-model="line.name" placeholder="线路名（可选）" />
                      <GlassInput v-model="line.userAgent" placeholder="User-Agent（可选）" />
                    </div>
                    <label class="field">
                      <span>Headers</span>
                      <textarea v-model="line.headersText" placeholder="X-Header: value"></textarea>
                    </label>
                  </details>
                </div>

                <button
                  class="iconbtn danger"
                  type="button"
                  title="删除线路"
                  aria-label="删除线路"
                  :disabled="form.lines.length === 1"
                  @click="removeLine(index)"
                >
                  <Icon icon="lucide:trash-2" width="16" />
                </button>
              </div>
            </div>
          </section>

          <p v-if="statusText" class="status">{{ statusText }}</p>
          <p v-if="errorText" class="err">{{ errorText }}</p>
        </div>

        <footer class="modal__foot">
          <GlassButton type="button" variant="ghost" @click="emit('close')">取消</GlassButton>
          <GlassButton type="submit" variant="primary" :loading="submitting">
            {{ primaryLabel }}
          </GlassButton>
        </footer>
      </form>
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
  width: min(680px, calc(100vw - 48px));
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}

.modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--separator);
}

.modal__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.modal__head p {
  margin: 6px 0 0;
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.5;
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

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-head h4 {
  margin: 0;
  font-size: 13px;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.section-head span {
  color: var(--fg-tertiary);
  font-size: 12px;
}

.account-grid,
.advanced-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.lines {
  display: flex;
  flex-direction: column;
}

.line-entry {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 14px 0;
  border-top: 1px solid var(--separator);
}

.line-entry:first-child {
  border-top: none;
  padding-top: 0;
}

.line-entry:last-child {
  padding-bottom: 0;
}

.line-entry__index {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--fg-secondary);
  font-size: 12px;
  font-weight: 700;
}

.line-entry__main {
  min-width: 0;
}

.line-url {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 190px);
  gap: 8px;
}

.line-advanced {
  margin-top: 8px;
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

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.field > span {
  font-size: 12px;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
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

.text-action {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
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

@media (max-width: 680px) {
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

  .account-grid,
  .advanced-grid,
  .line-url {
    grid-template-columns: 1fr;
  }

  .line-entry {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .line-entry > .danger {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
