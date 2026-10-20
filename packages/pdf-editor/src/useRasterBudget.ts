import { useCallback, useRef, useState } from "react";

/** LRU admission for live raster canvases (including thumbnails). No bitmap copies. */
export function useRasterBudget(requested = 6) {
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(8, Math.floor(requested))) : 6;
  const lru = useRef(new Map<number, true>());
  const [active, setActive] = useState<ReadonlySet<number>>(() => new Set<number>());
  const publish = useCallback(() => {
    const next = new Set(lru.current.keys());
    setActive((before) => before.size === next.size && [...next].every((p) => before.has(p))
      ? before : next);
  }, []);
  const mark = useCallback((page: number, near: boolean) => {
    const map = lru.current;
    if (near) {
      map.delete(page); map.set(page, true);
      while (map.size > limit) map.delete(map.keys().next().value!);
      publish();
    } else if (map.delete(page)) publish();
  }, [limit, publish]);
  const clear = useCallback(() => { lru.current.clear(); publish(); }, [publish]);
  return { active, mark, clear, limit };
}
