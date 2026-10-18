// tpdf-file-size-allow: Legacy PDF command dispatcher exceeds 300 lines; this follow-up changes execution truthfulness without a risky behavioral rewrite.
import type { ActiveTool, ViewMode } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";
import type { DocumentToolOptions, MarkupOptions, MarkupTool, WatermarkOptions } from "../hooks/useDocumentActions";
import type { AgentActionContext, AgentCommand, AgentCommandResult, AgentToolDefinition } from "./types";
import { getAgentToolDefinition } from "./definitions";

export async function executeAgentCommand(command: AgentCommand, context: AgentActionContext): Promise<AgentCommandResult> {
  const definition = getAgentToolDefinition(command.tool);
  if (!definition) {
    return { status: "unavailable", tool: command.tool, message: `Unknown tool: ${command.tool}` };
  }

  if (definition.requiresDocument && command.expectedRevision !== undefined &&
      command.expectedRevision !== context.state.documentRevision) {
    return { status: "failed", tool: command.tool,
      message: "Document changed since this command was planned or approved. Please request the action again." };
  }

  if (definition.requiresDocument && !context.state.hasDocument) {
    return { status: "input_required", tool: command.tool, message: "A document must be opened first.", missingArgs: ["file"] };
  }

  const args = command.args ?? {};
  const missingArgs = (definition.requiredArgs ?? []).filter((arg) => args[arg] === undefined || args[arg] === null || args[arg] === "");
  if (missingArgs.length > 0) {
    return { status: "input_required", tool: command.tool, message: `Missing required option(s): ${missingArgs.join(", ")}`, missingArgs };
  }

  if (definition.risk === "destructive" && !command.confirmed) {
    return {
      status: "confirmation_required",
      tool: command.tool,
      message: `${definition.title} needs user confirmation before running.`,
      confirmationPrompt: buildConfirmationPrompt(definition, args),
    };
  }

  // A missing UI handler must never be mistaken for a successful PDF mutation.
  const missingCapability = unavailableCapability(definition, context.actions);
  if (missingCapability) {
    return { status: "unavailable", tool: command.tool, message: missingCapability };
  }

  try {
    const outcome = await runAgentAction(definition, args, context, command.confirmed === true);
    if (outcome?.status === "input_required") {
      return {
        status: "input_required",
        tool: command.tool,
        message: outcome.message,
        missingArgs: outcome.missingArgs,
      };
    }
    return {
      status: "completed",
      tool: command.tool,
      message: outcome?.message || `${definition.title} completed.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.actions.setViewerError?.(message);
    return { status: "failed", tool: command.tool, message };
  }
}

const necessaryHandlers: Partial<Record<AgentToolDefinition["id"], keyof AgentActionContext["actions"]>> = {
  "close-document": "closeDocument", "export-pdf": "exportPdf", "save-pdf": "savePdf",
  "compress-pdf": "compressDocument", "run-ocr": "runOcr", "ocr-pdf": "runOcr",
  "analyze-document-health": "analyzeDocumentHealth", "convert-to-images": "convertToImages",
  "go-prev-page": "goPrevPage", "go-next-page": "goNextPage", "go-to-page": "setPage",
  "zoom-in": "zoomIn", "zoom-out": "zoomOut", "reset-zoom": "resetZoom",
  "set-view-mode": "setViewMode", "rotate-view-left": "rotateLeft", "rotate-view-right": "rotateRight",
  "undo-annotations": "undoAnnotations", "redo-annotations": "redoAnnotations",
  "select-tool": "setActiveTool", "highlight-tool": "setActiveTool",
  "note-tool": "setActiveTool", "shape-tool": "setActiveTool",
  "redact-tool": "setActiveTool", "signature-tool": "setActiveTool",
  "ai-content-editor": "setActiveTool", "measure-drawing": "setActiveTool",
  "edit-content": "setActiveTool", "replace-text": "replaceText",
  "open-tools-dashboard": "setShowDashboard", "open-tool-panel": "setActiveDashboardTool",
  "redact-pdf": "runAppTool", "compare-pdf": "runAppTool", "sign-pdf": "runAppTool",
  "advanced-pdf": "runAppTool", "print-pdf": "runAppTool",
};

function unavailableCapability(definition: AgentToolDefinition, actions: AgentActionContext["actions"]): string | null {
  const needed = necessaryHandlers[definition.id];
  if (needed && typeof actions[needed] !== "function") {
    return `${definition.title} is unavailable: missing ${needed} handler.`;
  }
  // The fallback UI document tool opens a form; it has not executed the requested edit.
  if (definition.documentTool && !actions.runConfiguredDocumentTool) {
    return `${definition.title} requires the configured document engine.`;
  }
  if (definition.markupTool && !actions.runConfiguredMarkupTool) {
    return `${definition.title} requires the configured markup engine.`;
  }
  if (definition.panelTool && !actions.runHeadlessConversion && !actions.setActiveDashboardTool) {
    return `${definition.title} needs a converter or an available tool panel.`;
  }
  if (definition.id === "watermark-pdf" && !actions.runConfiguredWatermark) {
    return "Watermark requires the configured watermark engine.";
  }
  return null;
}

function buildConfirmationPrompt(definition: AgentToolDefinition, args: Record<string, unknown>) {
  if (definition.id === "delete-pages") return `Delete page(s) ${String(args.pages)} from the current PDF?`;
  if (definition.id === "close-document") return "Close the current document? Unsaved edits may be lost.";
  if (definition.id === "encrypt") return "Encrypt the current PDF with the provided password?";
  if (definition.id === "decrypt") return "Decrypt the current PDF with the provided password?";
  if (definition.id === "crop-current") return "Crop the current page and rewrite its page box?";
  return `Run ${definition.title}?`;
}

type AgentActionOutcome =
  | { status?: "completed"; message?: string }
  | { status: "input_required"; message: string; missingArgs?: string[] };

async function runAgentAction(
  definition: AgentToolDefinition,
  args: Record<string, unknown>,
  context: AgentActionContext,
  approvedByAgent: boolean,
): Promise<AgentActionOutcome | void> {
  const { actions, state } = context;
  switch (definition.id) {
    case "open-file": {
      const filePath = typeof args.filePath === "string" ? args.filePath : undefined;
      if (filePath && actions.openFileWithPath) {
        return actions.openFileWithPath(filePath);
      }
      if (typeof args.fileUrl === "string" && actions.openFileBytes) {
        const response = await fetch(args.fileUrl);
        if (!response.ok) throw new Error(`Unable to fetch PDF: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return actions.openFileBytes(bytes, typeof args.fileName === "string" ? args.fileName : "document.pdf");
      }
      if (typeof args.base64 === "string" && actions.openFileBytes) {
        const raw = args.base64.includes(",") ? args.base64.slice(args.base64.indexOf(",") + 1) : args.base64;
        const decoded = atob(raw);
        const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
        return actions.openFileBytes(bytes, typeof args.fileName === "string" ? args.fileName : "document.pdf");
      }
      if (actions.openFile) {
        actions.openFile();
        return {
          status: "input_required",
          message: "Choose a local file, or provide filePath, fileUrl, or base64 for headless opening.",
          missingArgs: ["filePath|fileUrl|base64"],
        };
      }
      return {
        status: "input_required",
        message: "Provide filePath, fileUrl, or base64.",
        missingArgs: ["filePath|fileUrl|base64"],
      };
    }
    case "close-document": {
      const closed = await actions.closeDocument?.({ approvedByAgent });
      if (closed !== true) throw new Error("Document close was not completed.");
      return;
    }
    case "export-pdf": return actions.exportPdf?.();
    case "save-pdf": {
      const saved = await actions.savePdf?.();
      if (saved === false) throw new Error("PDF save did not complete.");
      return;
    }
    case "compress-pdf": return actions.compressDocument?.();
    case "run-ocr": return actions.runOcr?.();
    case "analyze-document-health": {
      if (!actions.analyzeDocumentHealth) return { status: "input_required", message: "Document Health requires TPDF Server." };
      return actions.analyzeDocumentHealth();
    }
    case "convert-to-images": return actions.convertToImages?.();
    case "go-prev-page": return actions.goPrevPage?.();
    case "go-next-page": return actions.goNextPage?.();
    case "go-to-page": {
      const page = Number(args.page);
      if (!Number.isSafeInteger(page) || page < 1 || page > state.totalPages) {
        return { status: "input_required", message: `Page must be a whole number between 1 and ${state.totalPages}.`, missingArgs: ["page"] };
      }
      return actions.setPage?.(page);
    }
    case "zoom-in": {
      const zoomVal = args.zoom ?? args.scale;
      let scale: number | undefined;
      if (typeof zoomVal === "number") {
        scale = zoomVal;
      } else if (typeof zoomVal === "string") {
        const parsed = parseFloat(zoomVal);
        if (!isNaN(parsed)) {
          scale = zoomVal.includes("%") ? parsed / 100 : parsed;
        }
      }
      return actions.zoomIn?.(scale);
    }
    case "zoom-out": return actions.zoomOut?.();
    case "reset-zoom": return actions.resetZoom?.();
    case "set-view-mode": {
      if (args.mode !== "page" && args.mode !== "continuous") {
        return { status: "input_required", message: "View mode must be page or continuous.", missingArgs: ["mode"] };
      }
      return actions.setViewMode?.(args.mode);
    }
    case "rotate-view-left": return actions.rotateLeft?.();
    case "rotate-view-right": return actions.rotateRight?.();
    case "undo-annotations": return actions.undoAnnotations?.();
    case "redo-annotations": return actions.redoAnnotations?.();
    case "select-tool": return actions.setActiveTool?.("select");
    case "highlight-tool": return actions.setActiveTool?.("highlight");
    case "note-tool": return actions.setActiveTool?.("note");
    case "shape-tool": return actions.setActiveTool?.("shape");
    case "redact-tool": return actions.setActiveTool?.("redact");
    case "ocr-pdf": return actions.runOcr?.();
    case "signature-tool": return actions.setActiveTool?.("signature");
    case "ai-content-editor": return actions.setActiveTool?.("edit-content");
    case "measure-drawing": return actions.setActiveTool?.("measure");
    case "edit-content": return actions.setActiveTool?.("edit-content");
    case "redact-pdf":
    case "compare-pdf":
    case "sign-pdf":
    case "advanced-pdf":
    case "print-pdf": {
      if (!actions.runAppTool) {
        return { status: "input_required", message: `${definition.title} is unavailable in this app runtime.` };
      }
      await actions.runAppTool(definition.id);
      return { status: "input_required", message: `${definition.title} opened its interactive workflow; the PDF operation is not yet completed.` };
    }
    case "replace-text": {
      if (!actions.replaceText) {
        return { status: "input_required", message: "Native PDF text editing is unavailable in this runtime." };
      }
      return actions.replaceText(args);
    }
    case "open-tools-dashboard":
      actions.setActiveDashboardTool?.(null);
      return actions.setShowDashboard?.(true);
    case "open-tool-panel": return openPanel(String(args.toolId), actions);
    default:
      if (definition.markupTool) {
        return actions.runConfiguredMarkupTool?.(definition.markupTool, normalizeMarkupOptions(args));
      }
      if (definition.documentTool) {
        return actions.runConfiguredDocumentTool!(definition.documentTool, normalizeDocumentToolOptions(args));
      }
      if (definition.id === "watermark-pdf") {
        return actions.runConfiguredWatermark?.(normalizeWatermarkOptions(args));
      }
      if (definition.panelTool) {
        if (actions.runHeadlessConversion) {
          const result = await actions.runHeadlessConversion(definition.id, args);
          if (result) return result;
        }
        openPanel(definition.panelTool, actions);
        return {
          status: "input_required",
          message: `${definition.title} needs additional input in its tool panel.`,
        };
      }
  }
}

function normalizeDocumentToolOptions(args: Record<string, unknown>): DocumentToolOptions {
  return {
    pages: Array.isArray(args.pages) ? args.pages.map(Number).filter(Number.isFinite) : typeof args.pages === "string" ? args.pages : undefined,
    marginPercent: numberOption(args.marginPercent),
    password: typeof args.password === "string" ? args.password : undefined,
    targetPage: numberOption(args.targetPage),
    position: args.position === "after" ? "after" : args.position === "before" ? "before" : undefined,
  };
}

function normalizeWatermarkOptions(args: Record<string, unknown>): WatermarkOptions {
  return {
    text: String(args.text ?? ""),
    fontSize: numberOption(args.fontSize),
    color: typeof args.color === "string" ? args.color : typeof args.fontColor === "string" ? args.fontColor : undefined,
    opacity: numberOption(args.opacity),
    rotation: numberOption(args.rotation),
  };
}

function openPanel(toolId: string, actions: AgentActionContext["actions"]) {
  actions.setShowDashboard?.(false);
  actions.setActiveDashboardTool?.(toolId);
  actions.openRightSidebar?.();
}

function clampPage(rawPage: number, totalPages: number) {
  if (!Number.isFinite(rawPage)) return 1;
  return Math.max(1, Math.min(Math.trunc(rawPage), Math.max(1, totalPages)));
}

function normalizeViewMode(mode: unknown): ViewMode {
  return mode === "page" ? "page" : "continuous";
}

function normalizeMarkupOptions(args: Record<string, unknown>): MarkupOptions {
  return {
    text: typeof args.text === "string" ? args.text : undefined,
    prefix: typeof args.prefix === "string" ? args.prefix : undefined,
    suffix: typeof args.suffix === "string" ? args.suffix : undefined,
    align: args.align === "left" || args.align === "right" || args.align === "center" ? args.align : undefined,
    position: normalizePosition(args.position),
    startNumber: numberOption(args.startNumber),
    digits: numberOption(args.digits),
    fontSize: numberOption(args.fontSize),
    fontColor: typeof args.fontColor === "string" ? args.fontColor : typeof args.color === "string" ? args.color : undefined,
    pageStart: numberOption(args.pageStart),
    pageEnd: numberOption(args.pageEnd),
  };
}

function normalizePosition(value: unknown): MarkupOptions["position"] | undefined {
  const allowed = new Set(["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]);
  return typeof value === "string" && allowed.has(value) ? value as MarkupOptions["position"] : undefined;
}

function numberOption(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}
