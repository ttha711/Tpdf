import { useEffect, type RefObject } from "react";

/**
 * Observe only actual EmbedPDF overlays. Annotation strokes can update class
 * and style dozens of times per second; observing those across the entire
 * shadow tree and measuring every toolbar button caused forced reflows.
 */
export function useEmbedPdfOverlaySync(viewerRootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = viewerRootRef.current;
    if (!root) return;

    let shadowObserver: MutationObserver | null = null;
    let rootObserver: MutationObserver | null = null;
    let frame: number | null = null;
    let attachedHost: HTMLElement | null = null;
    let lastOverlay: boolean | null = null;

    const syncState = (host: HTMLElement) => {
      const shadow = (host as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (!shadow) return;
      const hasOverlay = Boolean(shadow.querySelector(
        '[data-epdf-sheet], [role="dialog"][aria-modal="true"], .bg-bg-overlay, [data-state="open"][role="dialog"]'
      ));
      if (lastOverlay === hasOverlay) return;
      lastOverlay = hasOverlay;

      if (hasOverlay) {
        document.body.setAttribute("data-embedpdf-overlay", "open");
        root.setAttribute("data-embedpdf-overlay", "open");
      } else {
        document.body.removeAttribute("data-embedpdf-overlay");
        root.removeAttribute("data-embedpdf-overlay");
      }
    };

    const scheduleSync = (host: HTMLElement) => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        syncState(host);
      });
    };

    const attachToHost = (host: HTMLElement) => {
      if (host === attachedHost) return;
      shadowObserver?.disconnect();
      attachedHost = host;
      lastOverlay = null;
      const shadow = (host as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (!shadow) return;
      syncState(host);
      shadowObserver = new MutationObserver(() => scheduleSync(host));
      shadowObserver.observe(shadow, {
        childList: true,
        subtree: true,
        attributes: true,
        // Do not watch class/style: ink and shape tools modify them frequently.
        attributeFilter: ["aria-modal", "data-state", "aria-hidden", "hidden"],
      });
    };

    const initialHost = root.querySelector("embedpdf-container") as HTMLElement | null;
    if (initialHost) attachToHost(initialHost);

    rootObserver = new MutationObserver(() => {
      const current = root.querySelector("embedpdf-container") as HTMLElement | null;
      if (current) attachToHost(current);
    });
    rootObserver.observe(root, { childList: true, subtree: true });

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      shadowObserver?.disconnect();
      rootObserver?.disconnect();
      document.body.removeAttribute("data-embedpdf-overlay");
      root.removeAttribute("data-embedpdf-overlay");
      root.removeAttribute("data-embedpdf-mode");
    };
  }, [viewerRootRef]);
}
