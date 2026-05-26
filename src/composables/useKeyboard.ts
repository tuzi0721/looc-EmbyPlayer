import { onBeforeUnmount, onMounted } from "vue";

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

const MOD_KEYS = new Set(["ctrl", "alt", "shift", "meta"]);

function normalize(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  const mods = new Set<string>();
  let main = "";
  for (const p of parts) {
    if (MOD_KEYS.has(p)) {
      mods.add(p === "control" ? "ctrl" : p);
    } else {
      main = p;
    }
  }
  const ordered = ["ctrl", "alt", "shift", "meta"].filter((m) => mods.has(m));
  ordered.push(aliasKey(main));
  return ordered.join("+");
}

function aliasKey(k: string): string {
  switch (k) {
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
    default:
      return k;
  }
}

function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("meta");
  parts.push(aliasKey(e.key.toLowerCase()));
  return parts.join("+");
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Binds an array of keyboard shortcuts while the component is mounted.
 * Listeners are attached on `window` with `capture: true` so they win over
 * native widgets unless the user is currently typing.
 */
export function useKeyboard(bindings: KeyboardBinding[]) {
  const map = new Map<string, KeyboardBinding>();
  for (const b of bindings) {
    map.set(normalize(b.combo), b);
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const combo = comboFromEvent(e);
    const binding = map.get(combo);
    if (!binding) return;
    if ((binding.skipInInput ?? true) && isEditable(e.target)) return;
    if (binding.preventDefault ?? true) {
      e.preventDefault();
      e.stopPropagation();
    }
    void binding.handler(e);
  }

  onMounted(() => {
    window.addEventListener("keydown", onKey, true);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKey, true);
  });

  return { bindings };
}
