import type { P1Mark, P1Point } from "./p1Types.js";
export function P1MarkPreview({ mark, assetUrl }: {
  mark: P1Mark; assetUrl?: (id: string) => string;
}) {
  const { region: r, style: s } = mark;
  const points = (values: P1Point[]) => values.map((p) => p.x + "," + p.y).join(" ");
  const common = { stroke: s.strokeColor, strokeWidth: s.strokeWidthPt / 2,
    opacity: s.opacity, fill: "none" };
  const isAsset = mark.type === "image" || mark.type === "stamp" || mark.type === "signature";
  return <svg className={"tpdf-p1-mark tpdf-p1-" + mark.type}
    aria-label={mark.type + " annotation"} viewBox="0 0 100 100"
    preserveAspectRatio="none" style={{ position: "absolute", inset: 0,
      width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
    {(mark.type === "rectangle") && <rect x={r.x} y={r.y} width={r.width} height={r.height}
      {...common} fill={s.fillColor} fillOpacity={0.16} />}
    {mark.type === "circle" && <ellipse cx={r.x + r.width / 2} cy={r.y + r.height / 2}
      rx={r.width / 2} ry={r.height / 2} {...common} fill={s.fillColor} fillOpacity={0.16} />}
    {(mark.type === "line" || mark.type === "arrow" || mark.type === "polygon" || mark.type === "polyline") &&
      <polyline points={points(mark.type === "polygon" ?
        [...mark.points, mark.points[0]] : mark.points)} {...common}
        fill={mark.type === "polygon" ? s.fillColor : "none"}
        fillOpacity={mark.type === "polygon" ? 0.14 : 0}
        strokeLinejoin="round"/>}
    {mark.type === "arrow" && mark.points.length >= 2 && (() => {
      const a = mark.points[mark.points.length - 2], b = mark.points.at(-1)!;
      const angle = Math.atan2(b.y - a.y, b.x - a.x), length = 2;
      return <polyline {...common} points={points([
        { x: b.x - length * Math.cos(angle - .6), y: b.y - length * Math.sin(angle - .6) },
        b, { x: b.x - length * Math.cos(angle + .6), y: b.y - length * Math.sin(angle + .6) },
      ])}/>;
    })()}
    {mark.type === "inkHighlight" && mark.paths.map((path, i) =>
      <polyline key={i} points={points(path)} {...common} stroke={s.fillColor} strokeWidth="1.3" />)}
    {(mark.type === "highlight" || mark.type === "underline" || mark.type === "strikeout" || mark.type === "squiggly") &&
      mark.quads.map((quad, i) => {
        const [tl, tr, br, bl] = quad;
        const frac = mark.type === "strikeout" ? 0.52 : 0.93;
        const start = { x: tl.x + (bl.x - tl.x) * frac, y: tl.y + (bl.y - tl.y) * frac };
        const end = { x: tr.x + (br.x - tr.x) * frac, y: tr.y + (br.y - tr.y) * frac };
        return mark.type === "highlight" ?
          <polygon key={i} points={points(quad)} stroke="none" fill={s.fillColor} opacity={s.opacity}/> :
          mark.type === "squiggly" ?
          <polyline key={i} {...common} points={points(Array.from({ length: 17 }, (_, n) => {
            const t = n / 16; return { x: start.x + (end.x - start.x) * t,
              y: start.y + (end.y - start.y) * t + (n % 2 ? .22 : -.22) };
          }))}/> :
          <line key={i} {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y}/>;
      })}
    {(mark.type === "addText" || mark.type === "insertText" || mark.type === "callout") &&
      <text x={r.x} y={r.y + 1.5} fontSize="2.5" fill={s.strokeColor}>
        {mark.text.slice(0, 60)}</text>}
    {isAsset && assetUrl && <image x={r.x} y={r.y} width={r.width} height={r.height}
      href={assetUrl(mark.assetId)} preserveAspectRatio="xMidYMid meet" opacity={s.opacity}/>}
    {isAsset && <><rect x={r.x} y={r.y} width={r.width} height={r.height}
      {...common} strokeDasharray="1 .5"/>
      <text x={r.x + 1} y={r.y + 3} fontSize="2.3" fill={s.strokeColor}>
        {mark.type + ": " + mark.assetId.slice(0, 12)}</text></>}
  </svg>;
}
