import { validRegion } from "./history.js";
import { validPoint } from "./p1Marks.js";
import { DEFAULT_FORM_CAPABILITIES, type P2Change, type P2CreateField,
  type P2ExistingField, type P2FieldInventory, type P2FormCapabilities } from "./p2Types.js";
import type { PdfChange } from "./history.js";

const nonempty = (x: unknown): x is string =>
  typeof x === "string" && x.trim().length > 0 && x.length <= 256;
const optionsOK = (values: Array<{label:string;value:string}> | undefined) =>
  !!values?.length && values.length <= 200 && values.every(x=>nonempty(x.label)&&nonempty(x.value)) &&
  new Set(values.map(x=>x.value)).size === values.length;
export const formCaps = (caps?: Partial<P2FormCapabilities>): P2FormCapabilities =>
  ({ ...DEFAULT_FORM_CAPABILITIES, ...caps });
export function validateCreate(field: P2CreateField,
  caps: P2FormCapabilities = DEFAULT_FORM_CAPABILITIES): P2CreateField {
  if (!nonempty(field.name) || (field.tooltip !== undefined &&
      (typeof field.tooltip !== "string" || field.tooltip.length > 1000)))
    throw Error("Invalid form name or tooltip");
  if ("region" in field && !validRegion(field.region, Number.MAX_SAFE_INTEGER))
    throw Error("Form region is outside displayed page");
  switch(field.type) {
    case "text":
      if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) ||
        field.maxLength < 1 || field.maxLength > 100000)) throw Error("Invalid maxLength");
      if (field.defaultValue !== undefined && (typeof field.defaultValue !== "string" ||
        (field.maxLength !== undefined && field.defaultValue.length > field.maxLength)))
        throw Error("Invalid default text");
      break;
    case "checkbox":
      if (!nonempty(field.exportValue ?? "Yes")) throw Error("Invalid checkbox export value");
      if (!caps.checkboxExportValue && (field.exportValue ?? "Yes") !== "Yes")
        throw Error("Checkbox exportValue must be Yes");
      if (field.defaultValue !== undefined && typeof field.defaultValue !== "boolean")
        throw Error("Invalid checkbox default");
      break;
    case "radio":
      if (!caps.radio) throw Error("Radio group not supported by host");
      if (!field.choices.length || !optionsOK(field.choices.map(x=>({label:x.label,value:x.exportValue}))) ||
        field.choices.some(x=>!validRegion(x.region, Number.MAX_SAFE_INTEGER)))
        throw Error("Invalid radio choices");
      if (field.defaultValue != null &&
          !field.choices.some(x=>x.exportValue===field.defaultValue))
        throw Error("Unknown radio default");
      break;
    case "dropdown":
      if (!optionsOK(field.options)) throw Error("Invalid dropdown options");
      if (field.defaultValue != null && !field.editable &&
          !field.options.some(x=>x.value===field.defaultValue))
        throw Error("Unknown dropdown default");
      break;
    case "listBox":
      if (!optionsOK(field.options)) throw Error("Invalid listBox options");
      if (field.multiSelect && !caps.multiSelect) throw Error("Multi-select not supported by host");
      if ((field.defaultValues?.length ?? 0) > (field.multiSelect ? 200 : 1) ||
          field.defaultValues?.some(x=>!field.options.some(o=>o.value===x)) ||
          (field.defaultValues && new Set(field.defaultValues).size !== field.defaultValues.length))
        throw Error("Invalid listBox defaults");
      break;
  }
  return field;
}
export function validateP2(change: P2Change, existing: Map<string,P2CreateField|P2ExistingField>,
  caps: P2FormCapabilities = DEFAULT_FORM_CAPABILITIES, pageCount = Number.MAX_SAFE_INTEGER): void {
  if (change.schemaVersion !== 1) throw Error("Unsupported P2 schema version");
  if (change.kind === "form.create") {
    validateCreate(change.field, caps);
    if (existing.has(change.field.name)) throw Error("Duplicate form field name");
    if ("region" in change.field && change.field.region.page > pageCount)
      throw Error("Form page out of range");
    existing.set(change.field.name, change.field);
    return;
  }
  if (change.kind === "form.fill") {
    const field = existing.get(change.name);
    if (!field || field.readOnly || field.type !== change.fieldType)
      throw Error("Unknown, read-only or mismatched form field");
    if (change.fieldType === "radio" && !caps.radio) throw Error("Radio not supported by host");
    if (change.fieldType === "text") {
      if (typeof change.value !== "string" ||
          ("maxLength" in field && field.maxLength !== undefined &&
            change.value.length > field.maxLength)) throw Error("Invalid text fill");
      if (field.required && !change.value.trim()) throw Error("Required text cannot be empty");
    } else if (change.fieldType === "checkbox") {
      if (!caps.checkboxExportValue && "widgets" in field &&
          field.widgets.some(w=>w.exportValue && w.exportValue !== "Yes"))
        throw Error("Checkbox exportValue must be Yes");
      if (typeof change.value !== "boolean" || (field.required && !change.value))
        throw Error("Invalid checkbox fill");
    } else if (change.fieldType === "radio" || change.fieldType === "dropdown") {
      if (change.value !== null && typeof change.value !== "string") throw Error("Invalid choice fill");
      if (field.required && !change.value) throw Error("Required choice cannot be cleared");
      const allowed = field.type === "radio" && "choices" in field ?
        field.choices.map(x=>x.exportValue) : ("options" in field ? field.options?.map(x=>x.value) : undefined);
      if (change.value !== null && allowed?.length && !allowed.includes(change.value) &&
          !("editable" in field && field.editable)) throw Error("Unknown choice value");
    } else {
      const multi = "multiSelect" in field && field.multiSelect === true;
      if (multi && !caps.multiSelect) throw Error("Multi-select not supported by host");
      if (!Array.isArray(change.value) || change.value.some(x=>typeof x!=="string") ||
          change.value.length > (multi ? 200 : 1) ||
          (change.value.length > 1 && !caps.multiSelect))
        throw Error("Only one listBox choice supported");
      if (field.required && change.value.length===0) throw Error("Required listBox cannot be empty");
      const options = "options" in field ? field.options : undefined;
      if (options?.length && change.value.some(x=>!options.some(o=>o.value===x)))
        throw Error("Unknown listBox selection");
    }
    return;
  }
  if (!validRegion(change.region, pageCount) && (change.kind !== "attachment" ||
      !Number.isInteger(change.region.page) || change.region.page < 1 ||
      change.region.page > pageCount || !validPoint(change.region)))
    throw Error("Invalid displayed-page region");
  if (change.kind === "attachment") {
    if (!nonempty(change.assetId)) throw Error("Host attachment assetId required");
  } else if (change.target.kind === "url") {
    let parsed: URL;
    try { parsed = new URL(change.target.url); } catch { throw Error("Invalid URL"); }
    if (!["http:","https:"].includes(parsed.protocol)) throw Error("Only HTTP(S) URLs allowed");
  } else if (!Number.isInteger(change.target.page) || change.target.page < 1 ||
      change.target.page > pageCount ||
      (change.target.point !== undefined && !validPoint(change.target.point)))
    throw Error("Invalid internal link destination");
}
export function validateP2Batch(changes: PdfChange[], inventory?: P2FieldInventory,
  caps: P2FormCapabilities = DEFAULT_FORM_CAPABILITIES, pageCount?: number,
  versionId?: string) {
  if (inventory && versionId && inventory.versionId !== versionId)
    throw Error("Stale form-field inventory version");
  const known = new Map<string,P2CreateField|P2ExistingField>(
    inventory?.fields.map(field=>[field.name, field]) || []);
  for (const edit of changes) if (["form.create","form.fill","link","attachment"].includes(edit.kind))
    validateP2(edit as P2Change, known, caps, pageCount);
}
