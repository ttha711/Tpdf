import { useEffect, useState, type RefObject } from "react";
export type ShellLayout = "mobile" | "tablet" | "desktop";
export const layoutForWidth = (width: number): ShellLayout =>
  width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop";
export function useContainerLayout(ref: RefObject<HTMLElement | null>): ShellLayout {
  const [layout, setLayout] = useState<ShellLayout>("mobile");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setLayout(old => {
      const next = layoutForWidth(node.getBoundingClientRect().width);
      return old === next ? old : next;
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return layout;
}
