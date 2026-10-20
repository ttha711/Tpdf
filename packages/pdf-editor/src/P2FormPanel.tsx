import { useEffect, useState, type FormEvent } from "react";
import type { PdfRegion } from "./types.js";
import type { P2Change, P2ExistingField, P2FormCapabilities,
  P2FieldType } from "./p2Types.js";
import { optionsFromText } from "./p2ViewModel.js";

export type P2FormTool = "textField" | "checkbox" | "dropdown" | "listBox" | "fill";
export function P2FormPanel({ tool, region, fields, caps, onRecord, onError }: {
  tool: P2FormTool; region: PdfRegion | null; fields: P2ExistingField[];
  caps: P2FormCapabilities; onRecord: (change: P2Change) => void;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState("");
  const [tooltip, setTooltip] = useState("");
  const [required, setRequired] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const [maxLength, setMaxLength] = useState("");
  const [editable, setEditable] = useState(false);
  const [exportValue, setExportValue] = useState("Yes");
  const [optionsText, setOptionsText] = useState("Option A=A\nOption B=B");
  const [multiSelect, setMultiSelect] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fillText, setFillText] = useState("");
  const [fillChecked, setFillChecked] = useState(false);
  const [fillSelected, setFillSelected] = useState("");
  const field = fields.find(f=>f.name===fieldName) || fields[0];
  const creating = tool !== "fill";
  useEffect(() => {
    if (creating || !field) return;
    setFillText(typeof field.value === "string" ? field.value : "");
    setFillChecked(field.value === true);
    setFillSelected(Array.isArray(field.value) ? field.value[0] || "" :
      typeof field.value === "string" ? field.value : "");
  }, [creating, field?.name, JSON.stringify(field?.value)]);
  const type: P2FieldType = tool === "textField" ? "text" : tool === "fill" ?
    (field?.type || "text") : tool;
  const options = optionsFromText(optionsText);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (creating) {
        if (!region) throw Error("Select a rectangle on the PDF page first");
        const base = { name: name.trim(), region, required, readOnly, tooltip };
        const create = type === "text" ? {
          ...base, type: "text" as const, defaultValue, multiline,
          ...(maxLength ? {maxLength:Number(maxLength)} : {}),
        } : type === "checkbox" ? {
          ...base, type: "checkbox" as const, exportValue, defaultValue:checked,
        } : type === "dropdown" ? {
          ...base, type: "dropdown" as const, options, defaultValue: defaultValue || null, editable,
        } : {
          ...base, type: "listBox" as const, options,
          defaultValues: defaultValue ? [defaultValue] : [], multiSelect,
        };
        onRecord({ kind:"form.create", schemaVersion:1, field:create });
        return;
      }
      if (!field) throw Error("No form field available");
      if (field.readOnly) throw Error("This form field is read-only");
      const value = field.type === "checkbox" ? {
        fieldType:"checkbox" as const, value:fillChecked,
      } : field.type === "listBox" ? {
        fieldType:"listBox" as const, value:fillSelected ? [fillSelected] : [],
      } : field.type === "dropdown" || field.type === "radio" ? {
        fieldType:field.type, value:fillSelected || null,
      } : {fieldType:"text" as const, value:fillText};
      onRecord({ kind:"form.fill", schemaVersion:1, name:field.name, ...value });
    } catch (error) { onError(error); }
  }
  const activeOptions = creating ? options : field?.options || [];
  return <form className="tpdf-p2-panel" data-testid="p2-form-panel" onSubmit={submit}>
    <strong>{tool === "fill" ? "Fill form" : "Create " + type + " field"}</strong>
    {creating ? <>
      <span className="tpdf-p2-hint">{region ? "Page " + region.page + " selected" :
        "Drag to select field placement on the page"}</span>
      <label>Field name <input aria-label="Field name" required value={name}
        onChange={e=>setName(e.target.value)} /></label>
      <label>Tooltip <input aria-label="Tooltip" value={tooltip}
        onChange={e=>setTooltip(e.target.value)} /></label>
      <label><input type="checkbox" checked={required}
        onChange={e=>setRequired(e.target.checked)} /> Required</label>
      <label><input type="checkbox" checked={readOnly}
        onChange={e=>setReadOnly(e.target.checked)} /> Read-only</label>
      {type === "text" && <>
        <label>Default text <input aria-label="Default text" value={defaultValue}
          onChange={e=>setDefaultValue(e.target.value)} /></label>
        <label><input type="checkbox" checked={multiline}
          onChange={e=>setMultiline(e.target.checked)} /> Multiline</label>
        <label>Max length <input aria-label="Max length" type="number" min="1"
          value={maxLength} onChange={e=>setMaxLength(e.target.value)} /></label>
      </>}
      {type === "checkbox" && <>
        <label><input type="checkbox" checked={checked}
          onChange={e=>setChecked(e.target.checked)} /> Checked by default</label>
        <label>Export value <input aria-label="Checkbox export value" value={exportValue}
          disabled={!caps.checkboxExportValue} onChange={e=>setExportValue(e.target.value)} /></label>
      </>}
      {(type === "dropdown" || type === "listBox") && <>
        <label>Options (Label=Value per line)
          <textarea aria-label="Field options" rows={2} value={optionsText}
            onChange={e=>setOptionsText(e.target.value)}/></label>
        <label>Default choice
          {type === "dropdown" && editable ? <input aria-label="Default choice"
            value={defaultValue} onChange={e=>setDefaultValue(e.target.value)}/> :
          <select aria-label="Default choice" value={defaultValue}
            onChange={e=>setDefaultValue(e.target.value)}>
            <option value="">None</option>
            {activeOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>}</label>
        {type === "dropdown" && <label><input type="checkbox" checked={editable}
          onChange={e=>setEditable(e.target.checked)} /> Editable</label>}
        {type === "listBox" && <label><input type="checkbox" checked={multiSelect}
          disabled={!caps.multiSelect} onChange={e=>setMultiSelect(e.target.checked)}/>
          Multiple selection {!caps.multiSelect && "(Coming soon)"}</label>}
      </>}
    </> : <>
      <label>Choose field <select aria-label="Choose field" value={field?.name || ""}
        onChange={e=>{setFieldName(e.target.value);setFillText("");setFillSelected("");setFillChecked(false);}}>
        {fields.map(f=><option key={f.name} value={f.name}>{f.name} ({f.type})</option>)}
      </select></label>
      {field && <>
        <span className="tpdf-p2-hint">{field.widgets.length} widget(s)</span>
        {field.type === "text" && <label>Value <input aria-label="Fill text"
          value={fillText} onChange={e=>setFillText(e.target.value)} /></label>}
        {field.type === "checkbox" && <label><input type="checkbox"
          checked={fillChecked} onChange={e=>setFillChecked(e.target.checked)} /> Checked</label>}
        {(field.type === "dropdown" || field.type === "listBox") && <label>Value
          {field.type === "dropdown" && field.editable ?
            <input aria-label="Fill choice" value={fillSelected}
              onChange={e=>setFillSelected(e.target.value)} /> :
          <select aria-label="Fill choice" value={fillSelected}
            onChange={e=>setFillSelected(e.target.value)}>
            <option value="">None</option>
            {field.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select></label>}
        {field.type === "radio" && <span>Radio: Coming soon</span>}
      </>}
    </>}
    <button type="submit" disabled={creating ? !region : !field || field.readOnly ||
      field.type==="radio"}>{creating ? "Add field" : "Apply fill"}</button>
  </form>;
}
