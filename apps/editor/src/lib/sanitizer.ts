import DOMPurify from "dompurify";

/** Sanitize all untrusted PDF and model HTML before inserting it into the DOM. */
export function sanitizeHtml(value: string): string {
  if (!value) return "";
  try {
    const safe = DOMPurify.sanitize(value, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["srcdoc"],
    });
    const doc = new DOMParser().parseFromString(safe, "text/html");
    // Preserve only necessary editable image-placeholder metadata.
    for (const el of doc.querySelectorAll(".crop-image-placeholder")) {
      const allowed = ["data-x", "data-y", "data-w", "data-h", "data-crop-x",
        "data-crop-y", "data-crop-w", "data-crop-h", "aria-label"];
      const saved = new Map(allowed.map((key) => [key, el.getAttribute(key)]));
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
      el.className = "crop-image-placeholder";
      el.textContent = "";
      for (const [key, attr] of saved) if (attr !== null) el.setAttribute(key, attr);
    }
    return doc.body.innerHTML;
  } catch (error) {
    console.error("Failed to sanitize editor HTML:", error);
    return "";
  }
}
