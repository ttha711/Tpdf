import { useEffect, useRef, useState } from "react";
import type { ActiveTool } from "../lib/app-types";
import { MOBILE_PDF_GROUPS, switchMobilePdfMode, type MobilePdfMode } from "../lib/mobilePdfTools";

type Props = { activeTool: ActiveTool; onActiveToolChange: (tool: ActiveTool) => void };

export function MobilePdfModeStrip({ activeTool, onActiveToolChange }: Props) {
  const [mode, setMode] = useState<MobilePdfMode>("view");
  const buttons = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode: MobilePdfMode }>).detail?.mode;
      if (next && MOBILE_PDF_GROUPS.some(group => group.id === next)) setMode(next);
    };
    window.addEventListener("tpdf:embedpdf-mode-changed", onMode);
    return () => window.removeEventListener("tpdf:embedpdf-mode-changed", onMode);
  }, []);

  useEffect(() => {
    if (activeTool === "measure") setMode("measure");
  }, [activeTool]);

  const chooseMode = (next: MobilePdfMode) => {
    if (next === mode) return;
    setMode(next);
    if (next === "measure") {
      onActiveToolChange("measure");
    } else {
      if (activeTool === "measure" || activeTool === "edit-content") onActiveToolChange("select");
      switchMobilePdfMode(next);
    }
  };

  useEffect(() => {
    buttons.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({
      behavior: "smooth", block: "nearest", inline: "nearest",
    });
  }, [mode]);

  return (
    <div className="tpdf-mobile-mode-strip" data-tpdf-region="mobile-mode-strip">
      <div ref={buttons} className="tpdf-mobile-mode-scroll" role="tablist" aria-label="PDF tool groups">
        {MOBILE_PDF_GROUPS.map(group => (
          <button key={group.id} type="button" role="tab"
            data-tpdf-mode-tab={group.id}
            aria-selected={mode === group.id}
            onClick={() => chooseMode(group.id)}
          >{group.label}</button>
        ))}
      </div>
      <button className="tpdf-mobile-mode-all" type="button" aria-label="All PDF tools"
        onClick={() => window.dispatchEvent(new Event("tpdf:mobile-tools-open"))}>
        All tools
      </button>
    </div>
  );
}
