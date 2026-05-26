<script setup lang="ts">
withDefaults(
  defineProps<{ rows?: number; aspect?: "portrait" | "backdrop" | "square" }>(),
  { rows: 6, aspect: "portrait" },
);
</script>

<template>
  <div class="sk-grid" :class="`sk-grid--${aspect}`">
    <div v-for="i in rows" :key="i" class="sk">
      <div class="sk__art" />
      <div class="sk__line" />
      <div class="sk__line short" />
    </div>
  </div>
</template>

<style scoped>
.sk-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
.sk-grid--backdrop {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.sk {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk__art {
  aspect-ratio: 2 / 3;
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04),
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.04)
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s linear infinite;
  border: 1px solid var(--glass-border);
}
.sk-grid--backdrop .sk__art {
  aspect-ratio: 16 / 9;
}
.sk-grid--square .sk__art {
  aspect-ratio: 1 / 1;
}
.sk__line {
  height: 12px;
  width: 80%;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  animation: shimmer 1.6s linear infinite;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04),
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.04)
  );
  background-size: 200% 100%;
}
.sk__line.short {
  width: 50%;
  height: 10px;
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
</style>
