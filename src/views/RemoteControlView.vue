<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";

import GlassNavBar from "@/components/common/GlassNavBar.vue";
import GlassButton from "@/components/common/GlassButton.vue";
import { api } from "@/api";
import type { RemoteSession } from "@/types/models";

const sessions = ref<RemoteSession[]>([]);
const activeId = ref<string | null>(null);
const loading = ref(false);
const errorText = ref("");
const message = ref("");
const messageHeader = ref("来自 Hills Lite");

let timer: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  loading.value = true;
  try {
    sessions.value = await api.listRemoteSessions();
    if (!activeId.value && sessions.value.length > 0) {
      activeId.value = sessions.value[0]!.id;
    }
    errorText.value = "";
  } catch (e) {
    errorText.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const active = computed<RemoteSession | null>(
  () => sessions.value.find((s) => s.id === activeId.value) ?? null,
);

function fmtTicks(ticks?: number | null) {
  if (ticks == null) return "--:--";
  const ms = Math.floor(ticks / 10_000);
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const progress = computed(() => {
  const a = active.value;
  if (!a?.nowPlayingItem?.RunTimeTicks) return null;
  const pos = a.playState?.positionTicks ?? 0;
  return Math.min(100, (pos / a.nowPlayingItem.RunTimeTicks) * 100);
});

async function send(command: string, extra: { seekPositionTicks?: number } = {}) {
  if (!active.value) return;
  try {
    await api.remotePlaystate({
      sessionId: active.value.id,
      command,
      ...extra,
    });
    setTimeout(refresh, 500);
  } catch (e) {
    errorText.value = String(e);
  }
}

async function seek(percent: number) {
  if (!active.value?.nowPlayingItem?.RunTimeTicks) return;
  const ticks = Math.floor((percent / 100) * active.value.nowPlayingItem.RunTimeTicks);
  await send("Seek", { seekPositionTicks: ticks });
}

async function changeVolume(v: number) {
  if (!active.value) return;
  try {
    await api.remoteSetVolume({ sessionId: active.value.id, volume: Math.round(v) });
    setTimeout(refresh, 400);
  } catch (e) {
    errorText.value = String(e);
  }
}

async function sendMessage() {
  if (!active.value || !message.value.trim()) return;
  try {
    await api.remoteDisplayMessage({
      sessionId: active.value.id,
      header: messageHeader.value || "提示",
      text: message.value,
    });
    message.value = "";
  } catch (e) {
    errorText.value = String(e);
  }
}
</script>

<template>
  <main class="remote">
    <GlassNavBar show-back title="遥控" />

    <div class="content">
      <div v-if="sessions.length === 0" class="empty">
        <Icon icon="lucide:cast" width="22" />
        <span>{{ loading ? "正在搜索其他会话…" : "目前没有其他在线会话" }}</span>
        <span v-if="errorText" class="err">{{ errorText }}</span>
      </div>

      <template v-else>
        <aside class="sidebar glass">
          <header class="side-head">
            <span>在线会话</span>
            <GlassButton size="sm" variant="ghost" aria-label="刷新会话" title="刷新会话" @click="refresh">
              <Icon icon="lucide:refresh-cw" width="14" />
            </GlassButton>
          </header>
          <ul>
            <li
              v-for="s in sessions"
              :key="s.id"
              :class="{ active: s.id === activeId }"
              @click="activeId = s.id"
            >
              <div class="li__name">
                <Icon
                  :icon="s.client?.toLowerCase().includes('mobile') ? 'lucide:smartphone' : 'lucide:monitor'"
                  width="14"
                />
                <span>{{ s.deviceName || s.client || "未知设备" }}</span>
              </div>
              <div class="li__sub">
                <span v-if="s.userName">{{ s.userName }}</span>
                <span v-if="s.nowPlayingItem">▶ {{ s.nowPlayingItem.Name }}</span>
                <span v-else class="dim">空闲</span>
              </div>
            </li>
          </ul>
        </aside>

        <section v-if="active" class="panel glass glass-strong">
          <div class="device">
            <h2>{{ active.deviceName || active.client || "未知设备" }}</h2>
            <span class="dim">{{ active.userName }} · {{ active.client }} {{ active.applicationVersion ?? "" }}</span>
          </div>

          <div v-if="active.nowPlayingItem" class="now">
            <div class="now__title">{{ active.nowPlayingItem.Name }}</div>
            <div class="now__meta">
              <span>{{ fmtTicks(active.playState?.positionTicks) }}</span>
              <span class="dim"> / {{ fmtTicks(active.nowPlayingItem.RunTimeTicks) }}</span>
              <span v-if="active.playState?.isPaused" class="badge">已暂停</span>
              <span v-if="active.playState?.isMuted" class="badge">静音</span>
            </div>
            <div v-if="progress != null" class="bar" @click="(e) => {
              const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
              seek(((e.clientX - t.left) / t.width) * 100);
            }">
              <span :style="{ width: `${progress}%` }" />
            </div>
          </div>
          <div v-else class="now dim">空闲</div>

          <div class="controls">
            <GlassButton variant="ghost" aria-label="快退" title="快退" @click="send('Rewind')">
              <Icon icon="lucide:rewind" width="18" />
            </GlassButton>
            <GlassButton variant="primary" size="lg" aria-label="播放/暂停" title="播放/暂停" @click="send('PlayPause')">
              <Icon icon="lucide:play-pause" width="20" />
            </GlassButton>
            <GlassButton variant="ghost" aria-label="快进" title="快进" @click="send('FastForward')">
              <Icon icon="lucide:fast-forward" width="18" />
            </GlassButton>
            <GlassButton variant="ghost" aria-label="停止" title="停止" @click="send('Stop')">
              <Icon icon="lucide:square" width="18" />
            </GlassButton>
          </div>

          <div class="volume">
            <Icon icon="lucide:volume-2" width="16" />
            <input
              type="range"
              min="0"
              max="100"
              :value="active.playState?.volumeLevel ?? 80"
              @change="(e) => changeVolume(Number((e.target as HTMLInputElement).value))"
            />
            <span class="dim">{{ active.playState?.volumeLevel ?? "?" }}</span>
          </div>

          <div class="message">
            <header>
              <Icon icon="lucide:message-square" width="14" />
              <span>发送消息到此设备</span>
            </header>
            <input v-model="messageHeader" placeholder="标题" />
            <textarea v-model="message" placeholder="正文" rows="2" />
            <div class="msg__actions">
              <GlassButton size="sm" variant="primary" :disabled="!message.trim()" @click="sendMessage">
                发送
              </GlassButton>
            </div>
          </div>

          <p v-if="errorText" class="err">{{ errorText }}</p>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.remote {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: minmax(0, 1fr);
  gap: 18px;
  padding: 20px var(--content-pad) 40px;
  overflow: hidden;
}
.empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--fg-tertiary);
  padding: 80px;
}
.sidebar {
  border-radius: 18px;
  padding: 12px;
  min-height: 0;
  overflow-y: auto;
}
.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 6px 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sidebar ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sidebar li {
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 160ms;
}
.sidebar li:hover {
  background: var(--surface-subtle);
}
.sidebar li.active {
  background: var(--accent-soft);
}
.li__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--fg-primary);
}
.li__sub {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-tertiary);
  margin-top: 4px;
}
.panel {
  border-radius: 22px;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;
}
.device h2 {
  margin: 0;
  font-size: 18px;
}
.dim {
  color: var(--fg-tertiary);
}
.now__title {
  font-size: 16px;
  font-weight: 700;
}
.now__meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--fg-secondary);
}
.bar {
  margin-top: 10px;
  height: 6px;
  background: var(--surface-subtle);
  border-radius: 999px;
  overflow: hidden;
  cursor: pointer;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 240ms var(--easing-glide);
}
.controls {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.volume {
  display: flex;
  align-items: center;
  gap: 12px;
}
.volume input[type="range"] {
  flex: 1;
}
.message {
  border-top: 1px solid var(--separator);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.message header {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--fg-secondary);
  font-weight: 600;
}
.message input,
.message textarea {
  background: var(--surface-subtle);
  border: 1px solid var(--glass-border);
  color: var(--fg-primary);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  resize: vertical;
}
.msg__actions {
  display: flex;
  justify-content: flex-end;
}
.badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--fg-secondary);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.err {
  color: var(--danger);
  font-size: 12px;
}
@media (max-width: 900px) {
  .content {
    grid-template-columns: 1fr;
  }
}
</style>
