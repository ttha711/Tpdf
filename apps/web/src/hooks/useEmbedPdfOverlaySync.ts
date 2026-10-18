import { useEffect, type RefObject } from "react";

/**
 * Synchronizes EmbedPDF Shadow-DOM overlay and sheet states to the host document
 * so mobile floating UI (AI FAB, bottom edit toolbar, upload banner) automatically
 * hides to prevent touch collisions and obscured tool options.
 */
export function useEmbedPdfOverlaySync(viewerRootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = viewerRootRef.current;
    if (!root) return;

    let shadowObserver: MutationObserver | null = null;
    let rootObserver: MutationObserver | null = null;

    const syncState = (host: HTMLElement) => {
      const shadow = (host as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (!shadow) return;

      const hasOverlay = Boolean(
        shadow.querySelector(
          ".bg-bg-overlay, [role='dialog'], [data-state='open'], .bg-bg-surface.rounded-t-2xl"
        )
      );

      if (hasOverlay) {
        document.body.setAttribute("data-embedpdf-overlay", "open");
        root.setAttribute("data-embedpdf-overlay", "open");
      } else {
        document.body.removeAttribute("data-embedpdf-overlay");
        root.removeAttribute("data-embedpdf-overlay");
      }

      // Sync active mode attribute if available
      const buttons = shadow.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        if (["View", "Annotate", "Shapes", "Insert", "Form"].includes(text)) {
          const rect = btn.getBoundingClientRect();
          if (rect.y < 140 && rect.height > 0) {
            root.setAttribute("data-embedpdf-mode", text.toLowerCase());
            break;
          }
        }
      }
    };

    const attachToHost = (host: HTMLElement) => {
      shadowObserver?.disconnect();
      const shadow = (host as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (!shadow) return;

      syncState(host);

      shadowObserver = new MutationObserver(() => {
        syncState(host);
      });

      shadowObserver.observe(shadow, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "class", "style", "aria-hidden"],
      });
    };

    const initialHost = root.querySelector("embedpdf-container") as HTMLElement | null;
    if (initialHost) {
      attachToHost(initialHost);
    }

    rootObserver = new MutationObserver(() => {
      const currentHost = root.querySelector("embedpdf-container") as HTMLElement | null;
      if (currentHost) {
        attachToHost(currentHost);
      }
    });

    rootObserver.observe(root, { childList: true, subtree: true });

    return () => {
      shadowObserver?.disconnect();
      rootObserver?.disconnect();
      document.body.removeAttribute("data-embedpdf-overlay");
      root.removeAttribute("data-embedpdf-overlay");
      root.removeAttribute("data-embedpdf-mode");
    };
  }, [viewerRootRef]);
}
