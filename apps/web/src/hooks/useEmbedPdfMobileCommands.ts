import { useEffect } from "react";
import { MOBILE_PDF_GROUPS } from "../lib/mobilePdfTools";

type NativeCommand = { id: string; active: boolean; disabled: boolean; visible: boolean };
type CommandApi = {
  getAllCommands: (documentId?: string) => NativeCommand[];
  resolve: (id: string, documentId?: string) => NativeCommand;
  execute: (id: string, documentId?: string, source?: "ui" | "api") => void;
  onCommandStateChanged?: (fn: (event: { documentId: string; commandId: string }) => void) => () => void;
};
type UiApi = { disableCategory?: (category: string) => void; enableCategory?: (category: string) => void };
type NativeRegistry = {
  getPlugin?: (id: string) => { provides?: () => unknown } | null;
};

const NATIVE_MODE_IDS = MOBILE_PDF_GROUPS.filter(group => group.id !== "measure")
  .map(group => `mode:${group.id}`);
const NATIVE_TOOL_IDS = MOBILE_PDF_GROUPS.flatMap(group =>
  group.tools.flatMap(tool => tool.command ? [tool.command] : [])
);
const KNOWN_COMMANDS = new Set([...NATIVE_MODE_IDS, ...NATIVE_TOOL_IDS]);

/** Drive the installed EmbedPDF 2.15.x CommandsPlugin, not the incompatible v3 handle. */
export function useEmbedPdfMobileCommands(
  registry: NativeRegistry | null,
  documentId: string,
  ready: boolean,
  onError?: (message: string) => void,
) {
  useEffect(() => {
    if (!registry || !ready) return;
    const commands = registry.getPlugin?.("commands")?.provides?.() as CommandApi | undefined;
    if (!commands?.getAllCommands || !commands.resolve || !commands.execute) return;

    const ui = registry.getPlugin?.("ui")?.provides?.() as UiApi | undefined;
    let mobile = false;
    const resize = () => {
      const next = window.innerWidth <= 900;
      if (mobile === next) return;
      mobile = next;
      // In v2 the responsive mode select is a UI category. Disabling only the
      // native UI category hides the duplicate picker, not the commands API.
      if (next) ui?.disableCategory?.("mode");
      else ui?.enableCategory?.("mode");
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    const publish = () => {
      frame = 0;
      let list: NativeCommand[];
      try { list = commands.getAllCommands(documentId); } catch { return; }
      const state = new Map(list.map(command => [command.id, command]));
      const availability = Object.fromEntries(NATIVE_TOOL_IDS.map(id => [
        id, Boolean(state.get(id)?.visible && !state.get(id)?.disabled),
      ]));
      const activeMode = MOBILE_PDF_GROUPS.find(group =>
        group.id !== "measure" && state.get(`mode:${group.id}`)?.active
      )?.id ?? "view";
      const command = MOBILE_PDF_GROUPS.find(group => group.id === activeMode)?.tools.find(
        tool => Boolean(tool.command && state.get(tool.command)?.active)
      )?.command ?? "";
      window.dispatchEvent(new CustomEvent("tpdf:embedpdf-command-availability", { detail: availability }));
      window.dispatchEvent(new CustomEvent("tpdf:embedpdf-mode-changed", { detail: { mode: activeMode } }));
      window.dispatchEvent(new CustomEvent("tpdf:embedpdf-tool-changed", { detail: { command } }));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(publish);
    };
    const onCommandChange = (event: { commandId: string; documentId: string }) => {
      if (event.documentId === documentId && KNOWN_COMMANDS.has(event.commandId)) schedule();
    };
    const run = (event: Event) => {
      const id = (event as CustomEvent<{ command?: string }>).detail?.command;
      if (!id || !KNOWN_COMMANDS.has(id)) return;
      try {
        const command = commands.resolve(id, documentId);
        if (command.visible === false || command.disabled) return;
        commands.execute(id, documentId, "ui");
        schedule();
      } catch (error) {
        onError?.(error instanceof Error ? error.message : String(error));
      }
    };

    window.addEventListener("tpdf:embedpdf-command", run);
    const off = commands.onCommandStateChanged?.(onCommandChange);
    schedule();
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("tpdf:embedpdf-command", run);
      if (frame) window.cancelAnimationFrame(frame);
      off?.();
      if (mobile) ui?.enableCategory?.("mode");
    };
  }, [registry, documentId, ready, onError]);
}
