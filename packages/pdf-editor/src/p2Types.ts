import type { PdfRegion } from "./types.js";
export type P2Option = { label: string; value: string };
export type P2FieldType = "text" | "checkbox" | "radio" | "dropdown" | "listBox";
export type P2FormCapabilities = { radio: boolean; multiSelect: boolean; checkboxExportValue: boolean };
export const DEFAULT_FORM_CAPABILITIES: P2FormCapabilities = {
  radio: false, multiSelect: false, checkboxExportValue: false,
};
type BaseField = { name: string; required?: boolean; readOnly?: boolean; tooltip?: string };
export type P2CreateField =
  | (BaseField & { type: "text"; region: PdfRegion; defaultValue?: string;
    multiline?: boolean; maxLength?: number })
  | (BaseField & { type: "checkbox"; region: PdfRegion; exportValue?: string;
    defaultValue?: boolean })
  | (BaseField & { type: "radio"; choices: Array<{ region: PdfRegion;
    label: string; exportValue: string }>; defaultValue?: string | null })
  | (BaseField & { type: "dropdown"; region: PdfRegion; options: P2Option[];
    defaultValue?: string | null; editable?: boolean })
  | (BaseField & { type: "listBox"; region: PdfRegion; options: P2Option[];
    defaultValues?: string[]; multiSelect?: boolean });
export type P2FillValue =
  | { fieldType: "text"; value: string }
  | { fieldType: "checkbox"; value: boolean }
  | { fieldType: "radio" | "dropdown"; value: string | null }
  | { fieldType: "listBox"; value: string[] };
export type P2Change =
  | { kind: "form.create"; schemaVersion: 1; field: P2CreateField }
  | ({ kind: "form.fill"; schemaVersion: 1; name: string } & P2FillValue)
  | { kind: "link"; schemaVersion: 1; region: PdfRegion;
    target: { kind: "url"; url: string }
      | { kind: "page"; page: number; point?: { x: number; y: number } } }
  | { kind: "attachment"; schemaVersion: 1; region: PdfRegion; assetId: string };
export type P2ExistingField = { name: string; type: P2FieldType;
  widgets: Array<{ region: PdfRegion; exportValue?: string }>;
  value: string | boolean | string[] | null; options?: P2Option[];
  multiSelect?: boolean; editable?: boolean; required?: boolean; readOnly?: boolean };
export type P2FieldInventory = { versionId: string; fields: P2ExistingField[] };
