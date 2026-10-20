import type { P1Style } from "./p1Types.js";
export function P1StyleBar({ style, onChange }: {
  style: P1Style; onChange: (value: P1Style) => void;
}) {
  const patch = (value: Partial<P1Style>) => onChange({ ...style, ...value });
  return <div className="tpdf-p1-stylebar" data-testid="p1-stylebar">
    <label>Stroke <input aria-label="Stroke color" type="color"
      value={style.strokeColor} onChange={(e) => patch({ strokeColor: e.target.value })}/></label>
    <label>Fill <input aria-label="Fill color" type="color"
      value={style.fillColor} onChange={(e) => patch({ fillColor: e.target.value })}/></label>
    <label>Thickness <input aria-label="Thickness pt" type="number" min="0.25" max="72"
      step="0.25" value={style.strokeWidthPt} onChange={(e) =>
        patch({ strokeWidthPt: Math.max(.25, Math.min(72, Number(e.target.value) || .25)) })} /></label>
    <label>Opacity <input aria-label="Opacity" type="range" min="0" max="1" step="0.05"
      value={style.opacity} onChange={(e) => patch({ opacity: Number(e.target.value) })}/></label>
    <label>Font <input aria-label="Font size pt" type="number" min="1" max="200"
      value={style.fontSizePt} onChange={(e) =>
        patch({ fontSizePt: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} /></label>
  </div>;
}
