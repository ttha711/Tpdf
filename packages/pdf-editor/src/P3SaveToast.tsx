import { useEffect, useState } from "react";
export function P3SaveToast({ notes }: { notes: string[] }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(notes.length > 0);
    if (!notes.length) return;
    const timeout = window.setTimeout(() => setVisible(false), 10000);
    return () => window.clearTimeout(timeout);
  }, [notes]);
  if (!visible || !notes.length) return null;
  return <aside className="tpdf-p3-save-toast" data-testid="p3-save-notes"
    role="status" aria-live="polite" aria-atomic="true">
    <div><strong>Save notes</strong>
      <button type="button" aria-label="Dismiss save notes"
        onClick={() => setVisible(false)}>×</button></div>
    <ul>{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
  </aside>;
}
