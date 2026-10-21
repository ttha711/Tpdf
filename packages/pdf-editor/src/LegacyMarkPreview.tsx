import type { LegacyMark } from "./history.js";

/** Marks of the first release: a box, except the pen, which follows the points that were drawn. */
export function LegacyMarkPreview({ mark }: { mark: LegacyMark }) {
  const { region, type, points } = mark;
  if (type === "draw" && points && points.length > 1) {
    return <svg aria-label="draw annotation" className="tpdf-mark-stroke" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      <polyline points={points.map(([x, y]) => x + "," + y).join(" ")} fill="none" stroke="#3563e9" strokeWidth={2}
        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>;
  }
  return <div className={"tpdf-mark tpdf-mark-" + type}
    style={{ left: region.x + "%", top: region.y + "%", width: region.width + "%", height: region.height + "%" }}>
    {(type === "note" || type === "signature") && <span>{mark.value || region.note}</span>}
  </div>;
}
