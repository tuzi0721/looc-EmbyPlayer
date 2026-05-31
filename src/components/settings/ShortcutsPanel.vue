<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";

import GlassButton from "@/components/common/GlassButton.vue";
import { api } from "@/api";
import { PLAYER_SHORTCUT_SUMMARY } from "@/utils/keyboardShortcuts";

interface GlobalShortcut {
  action: string;
  accelerator: string;
}

const ACTION_LABELS: Record<string, string> = {
  play_pause: "播放 / 暂停",
  stop: "停止",
  next_track: "下一首",
  prev_track: "上一首",
  toggle_window: "显示 / 隐藏窗口",
};

const KNOWN_ACTIONS = Object.keys(ACTION_LABELS);

const globalShortcuts = ref<GlobalShortcut[]>([]);
const recording = ref<string | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

const byAction = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const s of globalShortcuts.value) m[s.action] = s.accelerator;
  return m;
});

async function refresh() {
  loading.value = true;
  try {
    globalShortcuts.value = await api.listGlobalShortcuts();
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function comboFromEvent(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = e.key;
  // Modifier-only presses don't bind.
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(k)) return null;
  let key = k;
  if (k === " ") key = "Space";
  else if (k.length === 1) key = k.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

function startRecord(action: string) {
  recording.value = action;
  error.value = null;
  window.addEventListener("keydown", capture, true);
}

function stopRecord() {
  recording.value = null;
  window.removeEventListener("keydown", capture, true);
}

async function capture(e: KeyboardEvent) {
  if (!recording.value) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") {
    stopRecord();
    return;
  }
  const combo = comboFromEvent(e);
  if (!combo) return;
  const action = recording.value;
  stopRecord();
  try {
    globalShortcuts.value = await api.setGlobalShortcut({ action, accelerator: combo });
  } catch (err) {
    error.value = `无法绑定 ${combo}: ${err}`;
  }
}

async function clearOne(action: string) {
  try {
    globalShortcuts.value = await api.clearGlobalShortcut({ action });
  } catch (e) {
    error.value = String(e);
  }
}

async function resetAll() {
  try {
    globalShortcuts.value = await api.resetGlobalShortcuts();
  } catch (e) {
    error.value = String(e);
  }
}

onBeforeUnmount(stopRecord);
</script>

<template>
  <section class="card glass glass-strong">
    <h3>快捷键</h3>

    <h4>播放页内</h4>
    <div class="local">
      <div v-for="row in PLAYER_SHORTCUT_SUMMARY" :key="row.combo" class="local__row">
        <kbd>{{ row.combo }}</kbd>
        <span>{{ row.description }}</span>
      </div>
    </div>

    <header class="g-head">
      <h4>全局热键</h4>
      <GlassButton size="sm" variant="ghost" :loading="loading" @click="resetAll">
        <Icon icon="lucide:rotate-ccw" width="14" />
        重置默认
      </GlassButton>
    </header>

    <div class="global">
      <div v-for="action in KNOWN_ACTIONS" :key="action" class="global__row">
        <div class="global__label">{{ ACTION_LABELS[action] }}</div>
        <div class="global__accel">
          <kbd v-if="byAction[action]">{{ byAction[action] }}</kbd>
          <span v-else class="dim">未绑定</span>
        </div>
        <div class="global__actions">
          <GlassButton
            size="sm"
            :variant="recording === action ? 'primary' : 'ghost'"
            @click="recording === action ? stopRecord() : startRecord(action)"
          >
            <Icon icon="lucide:keyboard" width="14" />
            {{ recording === action ? "按下组合键…" : "录制" }}
          </GlassButton>
          <GlassButton
            v-if="byAction[action]"
            size="sm"
            variant="danger"
            title="解绑快捷键"
            :aria-label="`解绑 ${ACTION_LABELS[action]} 快捷键`"
            @click="clearOne(action)"
          >
            <Icon icon="lucide:x" width="14" />
          </GlassButton>
        </div>
      </div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
  </section>
</template>

<style scoped>
h3 {
  margin: 0 0 14px;
  font-size: 18px;
}
h4 {
  margin: 14px 0 8px;
  font-size: 13px;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.local {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 24px;
}
.local__row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--fg-secondary);
}
.local__row span {
  color: var(--fg-secondary);
}
kbd {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--fg-primary);
  min-width: 64px;
  text-align: center;
}
.g-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.global {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.global__row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}
.global__label {
  font-weight: 600;
  color: var(--fg-primary);
}
.dim {
  color: var(--fg-tertiary);
  font-size: 12px;
}
.global__actions {
  display: flex;
  gap: 6px;
}
.err {
  color: var(--danger);
  margin-top: 10px;
  font-size: 12px;
}
@media (max-width: 700px) {
  .local {
    grid-template-columns: 1fr;
  }
  .global__row {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }
}
</style>
