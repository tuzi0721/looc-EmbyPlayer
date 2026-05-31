import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: () => "/home",
  },
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { transition: "fade" },
  },
  {
    path: "/home",
    name: "home",
    component: () => import("@/views/HomeView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/favorites",
    name: "favorites",
    component: () => import("@/views/FavoritesView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/history",
    name: "history",
    component: () => import("@/views/HistoryView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/aggregate",
    name: "aggregate",
    component: () => import("@/views/AggregateView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/library/:id",
    name: "library",
    component: () => import("@/views/LibraryView.vue"),
    props: true,
    meta: { transition: "slide-up" },
  },
  {
    path: "/local-folder",
    name: "local-folder",
    component: () => import("@/views/LocalFolderView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/item/:id",
    name: "item-detail",
    component: () => import("@/views/DetailView.vue"),
    props: true,
    meta: { transition: "slide-up" },
  },
  {
    path: "/studio/:id",
    name: "studio-detail",
    component: () => import("@/views/StudioView.vue"),
    props: true,
    meta: { transition: "slide-up" },
  },
  {
    path: "/player/:id",
    name: "player",
    component: () => import("@/views/PlayerView.vue"),
    props: true,
    meta: { transition: "fade", fullscreen: true },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/downloads",
    name: "downloads",
    component: () => import("@/views/DownloadsView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/remote",
    name: "remote",
    component: () => import("@/views/RemoteControlView.vue"),
    meta: { transition: "slide-up" },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/home",
  },
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
});
