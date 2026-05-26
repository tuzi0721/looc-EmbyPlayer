import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/**
 * Returns a reactive `visible` flag that flips to `true` the first time the
 * target element intersects the viewport (with the given root margin).
 *
 * Once visible, the observer is disconnected so the result is sticky.
 */
export function useLazyVisible(
  target: Ref<HTMLElement | null>,
  options: IntersectionObserverInit = { rootMargin: "200px 0px" },
) {
  const visible = ref(false);
  let observer: IntersectionObserver | null = null;

  const stop = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  watch(
    target,
    (el) => {
      stop();
      if (!el) return;
      if (typeof IntersectionObserver === "undefined") {
        visible.value = true;
        return;
      }
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.value = true;
            stop();
            break;
          }
        }
      }, options);
      observer.observe(el);
    },
    { immediate: true },
  );

  onBeforeUnmount(stop);

  return { visible };
}
