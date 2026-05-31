import { onBeforeUnmount, onMounted } from "vue";

import {
  isEditableShortcutTarget,
  normalizeShortcutCombo,
  shortcutComboFromEvent,
  type KeyboardBinding,
} from "@/utils/keyboardShortcuts";

export type { KeyboardBinding } from "@/utils/keyboardShortcuts";

/**
 * Binds an array of keyboard shortcuts while the component is mounted.
 * Listeners are attached on `window` with `capture: true` so they win over
 * native widgets unless the user is currently typing.
 */
export function useKeyboard(bindings: KeyboardBinding[]) {
  const map = new Map<string, KeyboardBinding>();
  for (const b of bindings) {
    map.set(normalizeShortcutCombo(b.combo), b);
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const combo = shortcutComboFromEvent(e);
    const binding = map.get(combo);
    if (!binding) return;
    if ((binding.skipInInput ?? true) && isEditableShortcutTarget(e.target)) return;
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
