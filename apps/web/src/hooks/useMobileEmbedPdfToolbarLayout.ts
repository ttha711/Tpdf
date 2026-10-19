import { useEffect, type RefObject } from "react";

const TOOLBAR_LAYOUT_SELECTOR = ".relative.flex.h-full.w-full.select-none.flex-col";
const STYLE_ID = "tpdf-mobile-toolbar-order";

/** Adds TPDF's mode tabs between EmbedPDF's document controls and active tools. */
export function useMobileEmbedPdfToolbarLayout(
  viewerRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const viewerRoot = viewerRootRef.current;
    if (!viewerRoot) return;

    let hostObserver: MutationObserver | null = null;
    let shadowObserver: MutationObserver | null = null;
    let toolbarObserver: MutationObserver | null = null;
    let attachedHost: HTMLElement | null = null;
    let pendingReadyHost: HTMLElement | null = null;
    let onHostReady: (() => void) | null = null;
    let layout: HTMLElement | null = null;
    let style: HTMLStyleElement | null = null;

    const markToolRow = () => {
      const children = layout ? [...layout.children] : [];
      for (const child of children) child.removeAttribute("data-tpdf-mobile-group-tools-row");
      children[1]?.setAttribute("data-tpdf-mobile-group-tools-row", "true");
    };

    const attach = (host: HTMLElement) => {
      if (attachedHost === host && shadowObserver) return;
      shadowObserver?.disconnect();
      toolbarObserver?.disconnect();
      if (style?.isConnected) style.remove();
      attachedHost = host;
      layout = null;
      const shadow = (host as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (!shadow) {
        if (pendingReadyHost !== host) {
          if (pendingReadyHost && onHostReady) {
            pendingReadyHost.removeEventListener("epdf:ready", onHostReady);
          }
          pendingReadyHost = host;
          const ready = () => {
            pendingReadyHost = null;
            onHostReady = null;
            attach(host);
          };
          onHostReady = ready;
          host.addEventListener("epdf:ready", ready, { once: true });
        }
        return;
      }
      if (pendingReadyHost && onHostReady) pendingReadyHost.removeEventListener("epdf:ready", onHostReady);
      pendingReadyHost = null;
      onHostReady = null;

      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `@media (max-width: 900px) {
        [data-tpdf-mobile-group-tools-row] { margin-top: 51px !important; }
        [data-tpdf-mobile-group-tools-row] button[aria-label^="Undo"],
        [data-tpdf-mobile-group-tools-row] button[aria-label^="Redo"],
        [data-tpdf-mobile-group-tools-row] button[title^="Undo"],
        [data-tpdf-mobile-group-tools-row] button[title^="Redo"] { display: none !important; }
      }`;
      shadow.appendChild(style);

      const syncLayout = () => {
        const nextLayout = shadow.querySelector<HTMLElement>(TOOLBAR_LAYOUT_SELECTOR);
        if (!nextLayout) return;
        if (layout !== nextLayout) {
          toolbarObserver?.disconnect();
          layout = nextLayout;
          toolbarObserver = new MutationObserver(markToolRow);
          toolbarObserver.observe(layout, { childList: true });
        }
        markToolRow();
      };
      syncLayout();
      shadowObserver = new MutationObserver(syncLayout);
      shadowObserver.observe(shadow, { childList: true });
    };

    const attachCurrent = () => {
      const host = viewerRoot.querySelector("embedpdf-container");
      if (host) attach(host as HTMLElement);
    };
    attachCurrent();
    hostObserver = new MutationObserver(attachCurrent);
    hostObserver.observe(viewerRoot, { childList: true, subtree: true });

    return () => {
      hostObserver?.disconnect();
      shadowObserver?.disconnect();
      toolbarObserver?.disconnect();
      if (pendingReadyHost && onHostReady) pendingReadyHost.removeEventListener("epdf:ready", onHostReady);
      style?.remove();
      layout?.querySelectorAll("[data-tpdf-mobile-group-tools-row]").forEach((node) =>
        node.removeAttribute("data-tpdf-mobile-group-tools-row"),
      );
    };
  }, [enabled, viewerRootRef]);
}
