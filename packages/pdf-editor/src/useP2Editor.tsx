import { useEffect, useState } from "react";
import type { TpdfPdfAdapter, PdfRegion, PdfTool } from "./types.js";
import type { PdfChange } from "./history.js";
import type { P2Change, P2FieldInventory } from "./p2Types.js";
import { formCaps, validateP2Batch } from "./p2Validation.js";
import { listedFields } from "./p2ViewModel.js";
import { P2FormPanel, type P2FormTool } from "./P2FormPanel.js";
import { P2ActionPanel } from "./P2ActionPanel.js";

const FORM_TOOLS: string[] = ["textField", "checkbox", "dropdown", "listBox", "fill"];
const P2_TOOLS = [...FORM_TOOLS, "link", "attachment"];
export function useP2Editor(input: {
  tool: PdfTool; adapter: TpdfPdfAdapter; region: PdfRegion | null;
  changes: PdfChange[]; record: (change: PdfChange) => void;
  report: (code:string,error:unknown,retryable?:boolean)=>void;
  versionId?: string; pageCount: number; readOnly: boolean; onPlaced?: () => void;
}) {
  const { tool, adapter, region, changes, record, report, versionId, pageCount } = input;
  const [inventory, setInventory] = useState<P2FieldInventory | null>(null);
  const [fetching, setFetching] = useState(false);
  const caps = formCaps(adapter.formCapabilities);
  // Existing P1 hosts do not advertise P2a; preserve their disabled controls.
  // The P2a host opts in with a formCapabilities object (all flags may be false).
  const enabled = !input.readOnly && !!adapter.applyChanges &&
    adapter.formCapabilities !== undefined;
  useEffect(() => {
    if (!FORM_TOOLS.includes(tool) || !adapter.listFormFields) return;
    let alive = true;
    setFetching(true);
    adapter.listFormFields().then(result => {
      if (!alive) return;
      if (!result || !result.versionId || !Array.isArray(result.fields))
        throw Error("Invalid host form-field inventory");
      if (versionId && versionId !== result.versionId)
        throw Error("Stale form inventory: versionId differs from open PDF");
      setInventory(result);
    }).catch(error => { if (alive) report("form-fields",error,false); })
      .finally(()=>{ if(alive) setFetching(false); });
    return ()=>{ alive = false; };
  }, [tool, adapter, versionId]);
  const fields = listedFields(inventory, changes);
  const onRecord = (change: P2Change) => {
    if (!enabled) { report("p2",Error("Host applyChanges required"),false); return; }
    try {
      if ((change.kind === "form.fill" || change.kind === "form.create") && fetching)
        throw Error("Form inventory still loading");
      validateP2Batch([...changes, change], inventory || undefined, caps, pageCount, versionId);
      record(change);
      if (change.kind !== "form.fill") input.onPlaced?.();
    } catch (error) { report("p2",error,false); }
  };
  const p2Panel = enabled && P2_TOOLS.includes(tool) ? (
    FORM_TOOLS.includes(tool) ?
      <P2FormPanel key={tool} tool={tool as P2FormTool} region={region}
        fields={fields} caps={caps} loading={fetching} onRecord={onRecord}
        onError={error=>report("p2",error,false)}/> :
      <P2ActionPanel key={tool} tool={tool as "link"|"attachment"}
        region={region} totalPages={pageCount} selectAttachment={adapter.selectAttachment}
        onRecord={onRecord} onError={error=>report("p2",error,false)}/>
  ) : null;
  return { p2Panel, caps, fetching, fields,
    canP2: enabled, canFill: enabled && !!adapter.listFormFields,
    canAttachment: enabled && !!adapter.selectAttachment };
}
