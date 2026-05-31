<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import GlassButton from "@/components/common/GlassButton.vue";
import GlassInput from "@/components/common/GlassInput.vue";
import ServerPicker from "@/components/login/ServerPicker.vue";
import AddServerDialog from "@/components/login/AddServerDialog.vue";
import LineStatusDot from "@/components/common/LineStatusDot.vue";

import { useServerStore } from "@/stores/server";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const route = useRoute();
const serverStore = useServerStore();
const auth = useAuthStore();

const initialServer = (route.query.server as string | undefined) ?? null;
const selectedServerId = ref<string | null>(initialServer);
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const remember = ref(true);

const showAddDialog = ref(false);
const submitting = ref(false);
const errorText = ref<string | null>(null);
const probing = ref(false);

const selectedServer = computed(() =>
  selectedServerId.value ? serverStore.byId(selectedServerId.value) ?? null : null,
);

watch(
  () => serverStore.servers,
  (list) => {
    if (!selectedServerId.value && list.length > 0) {
      selectedServerId.value = list[0]?.id ?? null;
    }
  },
  { immediate: true, deep: false },
);

async function probeLines() {
  if (!selectedServerId.value) return;
  probing.value = true;
  try {
    await serverStore.testLines(selectedServerId.value);
  } finally {
    probing.value = false;
  }
}

async function onLogin() {
  errorText.value = null;
  if (!selectedServerId.value) {
    errorText.value = "请先选择服务器";
    return;
  }
  if (!username.value.trim() || !password.value) {
    errorText.value = "请输入账号和密码";
    return;
  }
  submitting.value = true;
  try {
    await auth.login({
      serverId: selectedServerId.value,
      username: username.value.trim(),
      password: password.value,
    });
    router.replace("/home");
  } catch (e) {
    errorText.value = stringifyError(e);
  } finally {
    submitting.value = false;
  }
}

function stringifyError(e: unknown): string {
  const msg = String(e);
  if (msg.includes("authentication failed")) return "账号或密码错误";
  if (msg.includes("no available line")) return "所有线路均不可用，请检查网络或重新测活";
  if (msg.includes("race: overall timeout")) return "所有线路均超时，请稍后再试";
  return msg;
}
</script>

<template>
  <main class="login">
    <header class="login__topbar">
      <button class="iconbtn" @click="router.push('/home')" aria-label="Back">
        <Icon icon="lucide:chevron-left" width="18" />
        <span>返回</span>
      </button>
    </header>

    <section class="login__hero">
      <div class="login__avatar glass glass-strong">
        <Icon icon="lucide:user" width="40" />
      </div>
      <h1>登录到媒体库</h1>
      <p>使用 Emby 或 Jellyfin 服务器账号登录</p>
    </section>

    <section class="login__card glass glass-strong">
      <ServerPicker
        v-model="selectedServerId"
        @add="showAddDialog = true"
        @manage="router.push('/settings')"
      />

      <div v-if="selectedServer" class="login__lines">
        <div class="lines-head">
          <span>当前服务器线路</span>
          <button class="link" :disabled="probing" @click="probeLines">
            <Icon icon="lucide:activity" width="13" />
            {{ probing ? "测活中…" : "测活" }}
          </button>
        </div>
        <div class="lines-grid">
          <div v-for="l in selectedServer.lines" :key="l.id" class="line-chip glass-thin">
            <div class="line-chip__title">{{ l.name }}</div>
            <LineStatusDot :status="l.lastStatus" :latency-ms="l.lastLatencyMs" />
          </div>
        </div>
      </div>

      <div class="login__form">
        <GlassInput
          v-model="username"
          placeholder="账号"
          autocomplete="username"
          icon="lucide:user"
        />
        <GlassInput
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="密码"
          autocomplete="current-password"
          icon="lucide:lock"
          :right-icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'"
          @rightIconClick="showPassword = !showPassword"
        />

        <label class="remember">
          <input type="checkbox" v-model="remember" />
          <span>记住此账号</span>
        </label>

        <p v-if="errorText" class="err">{{ errorText }}</p>

        <GlassButton
          variant="primary"
          size="lg"
          block
          :loading="submitting"
          :disabled="!selectedServer"
          @click="onLogin"
        >
          继续
          <Icon icon="lucide:arrow-right" width="16" />
        </GlassButton>
      </div>

      <footer class="login__foot">
        <span class="dim">还没有服务器？</span>
        <button class="link" @click="showAddDialog = true">添加服务器</button>
      </footer>
    </section>

    <AddServerDialog
      v-if="showAddDialog"
      @close="showAddDialog = false"
      @created="
        (id, loggedIn) => {
          selectedServerId = id;
          if (loggedIn) router.replace('/home');
        }
      "
    />
  </main>
</template>

<style scoped>
.login {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 24px 40px;
  overflow-y: auto;
}

.login__topbar {
  width: 100%;
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 4px;
}
.iconbtn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  height: 32px;
  padding: 0 12px 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  transition: background 180ms var(--easing-glide);
}
.iconbtn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}

.login__hero {
  margin: 12px 0 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.login__avatar {
  width: 78px;
  height: 78px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--fg-primary);
  margin-bottom: 6px;
}
.login__hero h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.login__hero p {
  margin: 0;
  font-size: 13px;
  color: var(--fg-secondary);
}

.login__card {
  width: 100%;
  max-width: 460px;
  padding: 22px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.login__lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lines-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.lines-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
.line-chip {
  padding: 10px 12px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line-chip__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-primary);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.remember {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-secondary);
  cursor: pointer;
  user-select: none;
}
.remember input {
  accent-color: var(--accent);
}

.err {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
}

.login__foot {
  display: flex;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
}
.dim {
  color: var(--fg-tertiary);
}
.link {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 13px;
}
.link:hover {
  text-decoration: underline;
}
.link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
