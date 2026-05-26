<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";

import LineStatusDot from "@/components/common/LineStatusDot.vue";
import { useServerStore } from "@/stores/server";

const props = defineProps<{ modelValue: string | null }>();
const emit = defineEmits<{
  (e: "update:modelValue", id: string | null): void;
  (e: "add"): void;
  (e: "manage"): void;
}>();

const serverStore = useServerStore();

const selected = computed(() => {
  const id = props.modelValue;
  if (!id) return null;
  return serverStore.byId(id) ?? null;
});

function choose(id: string) {
  emit("update:modelValue", id);
}
</script>

<template>
  <div class="picker">
    <div class="picker__head">
      <h3>选择服务器</h3>
      <div class="picker__head-actions">
        <button class="link" @click="emit('manage')">
          <Icon icon="lucide:settings-2" width="14" />
          管理
        </button>
        <button class="link" @click="emit('add')">
          <Icon icon="lucide:plus" width="14" />
          添加
        </button>
      </div>
    </div>

    <div v-if="serverStore.servers.length === 0" class="empty">
      <Icon icon="lucide:server-off" width="22" />
      <span>还没有服务器，点击右上「添加」</span>
    </div>

    <ul v-else class="list">
      <li
        v-for="s in serverStore.servers"
        :key="s.id"
        class="row"
        :class="{ 'row--active': s.id === modelValue }"
        @click="choose(s.id)"
      >
        <div class="row__icon">
          <Icon :icon="s.kind === 'jellyfin' ? 'simple-icons:jellyfin' : 'lucide:server'" width="20" />
        </div>
        <div class="row__main">
          <div class="row__title">{{ s.name }}</div>
          <div class="row__sub">
            <LineStatusDot
              v-for="l in s.lines.slice(0, 4)"
              :key="l.id"
              :status="l.lastStatus"
              :latency-ms="l.lastLatencyMs"
            />
            <span v-if="s.lines.length > 4" class="more">+{{ s.lines.length - 4 }}</span>
          </div>
        </div>
        <Icon
          v-if="s.id === modelValue"
          icon="lucide:check"
          width="16"
          class="check"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}
.picker__head h3 {
  margin: 0;
  font-size: 13px;
  color: var(--fg-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.picker__head-actions {
  display: flex;
  gap: 10px;
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
  padding: 4px 8px;
  border-radius: 8px;
}
.link:hover {
  background: rgba(10, 132, 255, 0.10);
}

.empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-tertiary);
  font-size: 13px;
}

.list {
  list-style: none;
  padding: 4px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 180ms var(--easing-glide);
}
.row:hover {
  background: rgba(255, 255, 255, 0.05);
}
.row--active {
  background: rgba(10, 132, 255, 0.16);
}
.row__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: grid;
  place-items: center;
  color: var(--fg-primary);
}
.row__main {
  flex: 1;
  min-width: 0;
}
.row__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.more {
  font-size: 11px;
  color: var(--fg-tertiary);
}
.check {
  color: var(--accent);
}
</style>
