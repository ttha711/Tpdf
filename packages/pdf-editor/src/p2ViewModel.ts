import type { PdfChange } from "./history.js";
import type { P2CreateField, P2ExistingField, P2FieldInventory,
  P2Option } from "./p2Types.js";
export function optionsFromText(value: string): P2Option[] {
  return value.split(/\r?\n/).map(row=>row.trim()).filter(Boolean).map(row=>{
    const index = row.indexOf("=");
    return index < 0 ? { label: row, value: row } :
      { label: row.slice(0,index).trim(), value: row.slice(index+1).trim() };
  });
}
export function listedFields(inventory: P2FieldInventory | null,
  history: PdfChange[]): P2ExistingField[] {
  const fields = new Map((inventory?.fields || []).map(f=>[f.name, {...f}]));
  for (const change of history) {
    if (change.kind === "form.create") {
      const f: P2CreateField = change.field;
      fields.set(f.name, { name: f.name, type: f.type,
        widgets: "region" in f ? [{region: f.region,
          ...(f.type === "checkbox" ? {exportValue:f.exportValue ?? "Yes"} : {})}] :
          f.choices.map(x=>({region:x.region,exportValue:x.exportValue})),
        value: f.type === "text" ? (f.defaultValue ?? "") :
          f.type === "checkbox" ? !!f.defaultValue :
          f.type === "listBox" ? (f.defaultValues || []) :
          ("defaultValue" in f ? (f.defaultValue ?? null) : null),
        options: "options" in f ? f.options : undefined,
        multiSelect: f.type === "listBox" && f.multiSelect,
        required: f.required, readOnly: f.readOnly,
      });
    } else if (change.kind === "form.fill") {
      const field = fields.get(change.name);
      if (field) fields.set(change.name, { ...field, value: change.value });
    }
  }
  return Array.from(fields.values());
}
