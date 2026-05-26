<script setup lang="ts">
import { reactive, ref } from "vue";
import { Icon } from "@iconify/vue";

import GlassButton from "@/components/common/GlassButton.vue";
import GlassInput from "@/components/common/GlassInput.vue";
import { useServerStore } from "@/stores/server";
import type { ServerKind } from "@/types/models";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", id: string): void;
}>();

const serverStore = useServerStore();

const form = reactive({
  name: "",
  kind: "emby" as ServerKind,
  lines: [
    { name: "主线路", baseUrl: "" },
  ],
});

const submitting = ref(false);
const errorText = ref<string | null>(null);

function addLine() {
  form.lines.push({ name: `线路 ${form.lines.length + 1}`, baseUrl: "" });
}
function removeLine(idx: number) {
  if (form.lines.length === 1) return;
  form.lines.splice(idx, 1);
}

async function submit() {
  errorText.value = null;
  if (!form.name.trim()) {
    errorText.value = "请填写服务器名称";
    return;
  }
  const lines = form.lines
    .map((l, i) => ({
      name: l.name.trim() || `线路 ${i + 1}`,
      baseUrl: l.baseUrl.trim(),
      userAgent: null,
      headers: [] as [string, string][],
      priority: i,
      enabled: true,
    }))
    .filter((l) => l.baseUrl.length > 0);
  if (lines.length === 0) {
    errorText.value = "至少需要一条可用线路";
    return;
  }
  submitting.value = true;
  try {
    const s = await serverStore.addServer({
      name: form.name.trim(),
      kind: form.kind,
      lines,
      defaultUserAgent: null,
    });
    emit("created", s.id);
    emit("close");
  } catch (e) {
    errorText.value = String(e);
  } finally {
    submitting.value = false;
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
        <section class="fields">
          <label class="field">
            <span>名称</span>
            <GlassInput v-model="form.name" placeholder="例如：家庭影院" />
          </label>
          <label class="field">
            <span>类型</span>
            <div class="seg">
              <button
                type="button"
                :class="{ active: form.kind === 'emby' }"
                @click="form.kind = 'emby'"
              >Emby</button>
              <button
                type="button"
                :class="{ active: form.kind === 'jellyfin' }"
                @click="form.kind = 'jellyfin'"
              >Jellyfin</button>
            </div>
          </label>
        </section>

        <section>
          <header class="section-head">
            <h4>线路</h4>
            <button class="link" @click="addLine">
              <Icon icon="lucide:plus" width="14" />
              新增线路
            </button>
          </header>
          <div v-for="(line, idx) in form.lines" :key="idx" class="line-card">
            <div class="line-card__top">
              <GlassInput v-model="line.name" placeholder="线路名" />
              <button class="iconbtn danger" @click="removeLine(idx)" :disabled="form.lines.length === 1">
                <Icon icon="lucide:trash-2" width="16" />
              </button>
            </div>
            <GlassInput v-model="line.baseUrl" placeholder="https://emby.example.com" />
          </div>
        </section>

        <p v-if="errorText" class="err">{{ errorText }}</p>
      </div>

      <footer class="modal__foot">
        <GlassButton variant="ghost" @click="emit('close')">取消</GlassButton>
        <GlassButton variant="primary" :loading="submitting" @click="submit">
          保存
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
  width: 560px;
  max-width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 22px;
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
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.modal__foot {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--separator);
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
.row-2 {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 12px;
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
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  margin-bottom: 10px;
}
.line-card__top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}
.seg {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.seg button {
  appearance: none;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
  color: var(--fg-secondary);
  font-size: 13px;
  font-weight: 600;
}
.seg .active {
  background: rgba(255, 255, 255, 0.14);
  color: var(--fg-primary);
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
.err {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
}
</style>
