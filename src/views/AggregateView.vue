<script setup lang="ts">
import { Icon } from "@iconify/vue";
</script>

<template>
  <section class="agg">
    <header class="agg__head">
      <h1>聚合视界</h1>
      <p class="agg__sub">把多台服务器的内容合并到同一个浏览空间</p>
    </header>

    <div class="agg__body">
      <div class="placeholder">
        <div class="placeholder__art">
          <Icon icon="lucide:infinity" width="44" />
        </div>
        <h2>聚合视界即将上线</h2>
        <p>这里会把你所有已登录服务器的媒体库进行去重、合并、统一搜索。</p>
        <ul>
          <li>跨服务器搜索影片与剧集</li>
          <li>跨账号「继续观看」一站直达</li>
          <li>同名作品自动归并、最佳线路播放</li>
          <li>统一的收藏、最近添加与发现页</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agg {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.agg__head {
  padding: 18px var(--content-pad) 6px;
}
.agg__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.agg__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fg-tertiary);
}
.agg__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px var(--content-pad) 40px;
}

.placeholder {
  max-width: 560px;
  margin: 40px auto;
  padding: 28px;
  border-radius: 18px;
  background: var(--surface-1);
  border: 1px solid var(--separator);
  text-align: center;
}
.placeholder__art {
  width: 88px;
  height: 88px;
  border-radius: 24px;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  margin: 0 auto 18px;
}
.placeholder h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
}
.placeholder p {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--fg-secondary);
  line-height: 1.6;
}
.placeholder ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--fg-secondary);
  text-align: left;
}
.placeholder li {
  padding-left: 18px;
  position: relative;
}
.placeholder li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 9px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
</style>
