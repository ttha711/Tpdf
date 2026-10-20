import { useEffect, useState } from "react";
import { TileScheduler } from "./tileScheduler.js";
import type { Tile } from "./tiles.js";

// One scheduler belongs to exactly one committed effect lifetime.
// React StrictMode replays setup -> cleanup -> setup in development;
// the second setup must never inherit the disposed first instance.
export function useTileScheduler(identity: object | string, wanted: Tile[]) {
  const [scheduler, setScheduler] = useState<TileScheduler | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const instance = new TileScheduler();
    const unsubscribe = instance.subscribe(() => setRevision((value) => value + 1));
    setScheduler(instance);
    return () => {
      unsubscribe();
      instance.dispose();
    };
  }, [identity]);

  useEffect(() => {
    scheduler?.setWanted(wanted);
  }, [scheduler, wanted]);

  return { scheduler, revision };
}
