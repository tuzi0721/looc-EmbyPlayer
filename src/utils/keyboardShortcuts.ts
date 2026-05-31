export interface KeyboardBinding {
  /** Combination like `Space`, `ArrowLeft`, `Shift+ArrowRight`, `Ctrl+Alt+M`. */
  combo: string;
  description?: string;
  /** When true (default) the matching event is prevented + stopped. */
  preventDefault?: boolean;
  /** Skip when the active element is an editable form control (default true). */
  skipInInput?: boolean;
  handler: (event: KeyboardEvent) => void | Promise<void>;
}

export interface KeyboardActionBinding<TAction extends string = string> {
  action: TAction;
  combo: string;
  description?: string;
  preventDefault?: boolean;
  skipInInput?: boolean;
}

export interface ShortcutSummary {
  combo: string;
  description: string;
}

export type PlayerShortcutAction =
  | "toggle-play"
  | "seek-back-small"
  | "seek-forward-small"
  | "seek-back-large"
  | "seek-forward-large"
  | "volume-up"
  | "volume-down"
  | "toggle-mute"
  | "toggle-fullscreen"
  | "retry-playback"
  | "toggle-subtitle-panel"
  | "cycle-subtitle"
  | "toggle-danmaku"
  | "speed-up"
  | "speed-down"
  | "subtitle-delay-down"
  | "subtitle-delay-up"
  | "seek-percent-0"
  | "seek-percent-10"
  | "seek-percent-20"
  | "seek-percent-30"
  | "seek-percent-40"
  | "seek-percent-50"
  | "seek-percent-60"
  | "seek-percent-70"
  | "seek-percent-80"
  | "seek-percent-90"
  | "escape";

const MOD_KEYS = new Set(["ctrl", "control", "alt", "shift", "meta", "cmd", "command"]);

export const PLAYER_SHORTCUT_SUMMARY: ShortcutSummary[] = [
  { combo: "Space / K", description: "播放 / 暂停" },
  { combo: "← / J", description: "后退 10 秒" },
  { combo: "→ / L", description: "前进 10 秒" },
  { combo: "Shift + ← / →", description: "后退 / 前进 60 秒" },
  { combo: "↑ / ↓", description: "音量 ±5" },
  { combo: "M", description: "静音 / 取消静音" },
  { combo: "F", description: "切换全屏" },
  { combo: "R", description: "错误后重试播放" },
  { combo: "S", description: "字幕面板" },
  { combo: "C", description: "切换字幕轨道" },
  { combo: "D", description: "切换弹幕" },
  { combo: "+ / -", description: "速度 ±0.1" },
  { combo: "[ / ]", description: "字幕延迟 ±100ms" },
  { combo: "0 ~ 9", description: "跳到 0% ~ 90%" },
  { combo: "Esc", description: "关闭面板 / 退出全屏" },
];

export const PLAYER_SHORTCUTS: KeyboardActionBinding<PlayerShortcutAction>[] = [
  { action: "toggle-play", combo: "Space", description: "播放 / 暂停" },
  { action: "toggle-play", combo: "k", description: "播放 / 暂停" },
  { action: "seek-back-small", combo: "ArrowLeft", description: "后退 10 秒" },
  { action: "seek-forward-small", combo: "ArrowRight", description: "前进 10 秒" },
  { action: "seek-back-large", combo: "Shift+ArrowLeft", description: "后退 60 秒" },
  { action: "seek-forward-large", combo: "Shift+ArrowRight", description: "前进 60 秒" },
  { action: "seek-back-small", combo: "j", description: "后退 10 秒" },
  { action: "seek-forward-small", combo: "l", description: "前进 10 秒" },
  { action: "volume-up", combo: "ArrowUp", description: "音量 +5" },
  { action: "volume-down", combo: "ArrowDown", description: "音量 -5" },
  { action: "toggle-mute", combo: "m", description: "静音 / 取消静音" },
  { action: "toggle-fullscreen", combo: "f", description: "切换全屏" },
  { action: "retry-playback", combo: "r", description: "错误后重试播放" },
  { action: "toggle-subtitle-panel", combo: "s", description: "字幕面板" },
  { action: "cycle-subtitle", combo: "c", description: "循环字幕轨道" },
  { action: "toggle-danmaku", combo: "d", description: "弹幕开关" },
  { action: "speed-up", combo: "=", description: "速度 +0.1" },
  { action: "speed-up", combo: "+", description: "速度 +0.1" },
  { action: "speed-down", combo: "-", description: "速度 -0.1" },
  { action: "subtitle-delay-down", combo: "[", description: "字幕延迟 -100ms" },
  { action: "subtitle-delay-up", combo: "]", description: "字幕延迟 +100ms" },
  { action: "seek-percent-0", combo: "0" },
  { action: "seek-percent-10", combo: "1" },
  { action: "seek-percent-20", combo: "2" },
  { action: "seek-percent-30", combo: "3" },
  { action: "seek-percent-40", combo: "4" },
  { action: "seek-percent-50", combo: "5" },
  { action: "seek-percent-60", combo: "6" },
  { action: "seek-percent-70", combo: "7" },
  { action: "seek-percent-80", combo: "8" },
  { action: "seek-percent-90", combo: "9" },
  { action: "escape", combo: "Escape", description: "关闭面板" },
];

export function aliasShortcutKey(key: string): string {
  switch (key) {
    case " ":
    case "space":
      return "space";
    case "esc":
      return "escape";
    case "left":
      return "arrowleft";
    case "right":
      return "arrowright";
    case "up":
      return "arrowup";
    case "down":
      return "arrowdown";
    case "cmd":
    case "command":
    case "win":
      return "meta";
    case "+":
      return "plus";
    default:
      return key;
  }
}

export function normalizeShortcutCombo(combo: string): string {
  const trimmed = combo.trim();
  const rawParts = trimmed === "+"
    ? ["+"]
    : trimmed
      .toLowerCase()
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);

  const mods = new Set<string>();
  let main = "";
  for (const part of rawParts) {
    if (MOD_KEYS.has(part)) {
      mods.add(part === "control" ? "ctrl" : aliasShortcutKey(part));
    } else {
      main = part;
    }
  }
  const ordered = ["ctrl", "alt", "shift", "meta"].filter((mod) => mods.has(mod));
  ordered.push(aliasShortcutKey(main));
  return ordered.join("+");
}

export function shortcutComboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  parts.push(aliasShortcutKey(event.key.toLowerCase()));
  return parts.join("+");
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function keyboardBindingsForActions<TAction extends string>(
  bindings: KeyboardActionBinding<TAction>[],
  handlers: Record<TAction, KeyboardBinding["handler"]>,
): KeyboardBinding[] {
  return bindings.map((binding) => ({
    combo: binding.combo,
    description: binding.description,
    preventDefault: binding.preventDefault,
    skipInInput: binding.skipInInput,
    handler: handlers[binding.action],
  }));
}
