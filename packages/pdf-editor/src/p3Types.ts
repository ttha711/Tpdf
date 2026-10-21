import type { PdfRegion } from "./types.js";
export type P3Point = { x: number; y: number };
export type P3LengthUnit = "mm" | "cm" | "m" | "in" | "ft";
export type P3PageCalibration = { id: string; page: number;
  points: [P3Point, P3Point]; realLength: number; unit: P3LengthUnit };
export type P3Scope = { kind:"region"; region:PdfRegion } |
  { kind:"pages"; pages:number[] } | { kind:"document" };
export type P3Change =
  | { kind:"redact"; schemaVersion:1; regions:PdfRegion[];
    terms?:string[]; pages?:number[] }
  | { kind:"measure.calibrate"; schemaVersion:1; calibration:P3PageCalibration }
  | { kind:"measure"; schemaVersion:1; type:"distance"|"perimeter"|"area";
    page:number; points:P3Point[]; calibration:P3PageCalibration }
  | { kind:"text.replace"; schemaVersion:1; search:string; replacement:string;
    scope:P3Scope; caseSensitive?:boolean };
export type P3Capabilities = {
  redact?: {secureErase?:boolean; regions?:boolean; terms?:boolean; purgesHistory?:boolean};
  measure?: {calibrate?:boolean; distance?:boolean; perimeter?:boolean; area?:boolean};
  replaceText?: {region?:boolean; pages?:boolean; document?:boolean; count?:boolean};
};
export type P3CalibrationInventory = { versionId:string; calibrations:P3PageCalibration[] };
export type P3MatchCount = { count:number; pages:number[] };
export type P3Tool = "redact" | "applyRedact" | "calibrate" |
  "distance" | "perimeter" | "area" | "replaceText";
