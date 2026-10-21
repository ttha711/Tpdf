import type { SVGProps } from "react";
// Lightweight inline approximation of apps/web TpdfIcon Lucide set without
// importing the app's Vite-only modules or adding a React icon dependency.
const path:Record<string,string>={
  view:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  pointer:"M5 2v17l4-5 4 6 3-2-4-6 7-1z",
  pan:"M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 4-3 7-7 7h-2c-3 0-5-2-7-5l-2-3 3-2z",
  "fit-width":"M3 7v10M21 7v10M6 12h12m-9-3-3 3 3 3m6-6 3 3-3 3",
  "fit-page":"M4 4h6M4 4v6m16-6h-6m6 0v6M4 20h6m-6 0v-6m16 6h-6m6 0v-6",
  "zoom-in":"M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 6 6M10 7v6m-3-3h6",
  "zoom-out":"M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 6 6M7 10h6",
  "rotate-left":"M3 9V3h6M3 9a9 9 0 1 1-1 5",
  "rotate-right":"M21 9V3h-6m6 6a9 9 0 1 0 1 5",
  search:"M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 6 6",
  page:"M5 2h10l4 4v16H5zM15 2v5h4M8 11h8M8 15h8",
  note:"M4 4h16v12h-9l-5 4v-4H4zM8 9h8M8 12h5",
  link:"M10 13a5 5 0 0 0 8 0l2-2a5 5 0 0 0-7-7l-2 2m3 5a5 5 0 0 0-8 0l-2 2a5 5 0 0 0 7 7l2-2",
  highlight:"M4 18 16 6l4 4-12 12H4zM3 23h18M14 8l4 4",
  strikethrough:"M4 12h16M9 8h8M9 8c0 3 6 3 6 6s-3 3-6 3m-1 0h8",
  underline:"M8 4v8a4 4 0 0 0 8 0V4M6 20h12",
  squiggly:"M6 4v7a6 6 0 0 0 12 0V4M3 20q2-3 4 0t4 0t4 0t4 0",
  draw:"M4 20l3-1L19 7l-3-3L4 16zM14 6l4 4",
  "text-field":"M4 5h16v14H4zM8 9h8M12 9v7",
  "file-text":"M5 2h10l4 4v16H5zM15 2v5h4M8 11h8M8 15h8",
  edit:"M4 20l4-1L20 7l-3-3L5 16z",
  rectangle:"M4 5h16v14H4z",
  circle:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  line:"M4 20 20 4",
  arrow:"M4 20 20 4M11 4h9v9",
  polygon:"M12 3 21 10 17 21H7L3 10z",
  polyline:"M2 18 9 6l5 10 8-12",
  palette:"M12 2a10 10 0 1 0 0 20c4 0 4-5 7-6a5 5 0 0 0 3-5A10 10 0 0 0 12 2zM7 12h.01M11 7h.01M17 9h.01",
  stamp:"M9 3h6v5l3 4v4H6v-4l3-4zM4 19h16v3H4z",
  insert:"M4 3h11l4 4v14H4zM12 11v7m-4-4h8",
  signature:"M3 19c4-10 5-14 8-14 5 0-2 15 2 14 4-1 5-5 8-4",
  "file-image":"M4 3h16v18H4zM7 16l4-5 3 3 3-4 3 5M8 8h.01",
  checkbox:"M4 4h16v16H4zM8 12l3 3 5-6",
  radio:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  dropdown:"M4 5h16v14H4zM7 9h9m-4 4 3 3 3-3",
  listbox:"M4 3h16v18H4zM7 7h10M7 11h10M7 15h10",
  fill:"M3 5h18v14H3zM7 9h10M7 14l2 2 4-4",
  redact:"M4 4h16v16H4zM4 12h16M8 4v16m8-16v16",
  advanced:"M4 4h16v16H4zM12 4v16",
  measure:"M4 18 18 4l3 3L7 21zM11 11l2 2m2-6 2 2",
  perimeter:"M3 18 8 5 20 8 18 20z",
  area:"M3 20 8 5 21 19z",
  calibrate:"M12 2v20M2 12h20M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
};
export function WebToolIcon({name,size=20}:{
  name:string;size?:number;
}&Pick<SVGProps<SVGSVGElement>,"className">){
  return <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path[name]||path.page}/>
  </svg>;
}
