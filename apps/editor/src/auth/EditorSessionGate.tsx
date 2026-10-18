import { useEffect, useState, type FormEvent, type ReactNode } from "react";

export function EditorSessionGate({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/auth/editor/status", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Editor authentication unavailable");
        return response.json();
      })
      .then((data) => { if (alive) setAuthorized(data.authenticated === true); })
      .catch(() => { if (alive) { setAuthorized(false); setError("Unable to verify editor access."); } });
    return () => { alive = false; };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/editor", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("Invalid editor access token.");
      setToken("");
      setAuthorized(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Editor sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (authorized === null) return <main role="status">Checking editor access…</main>;
  if (authorized) return <>{children}</>;
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <form onSubmit={(event) => { void signIn(event); }} style={{ display: "grid", gap: 12, width: 300 }}>
        <h1>TPDF Editor access</h1>
        <label htmlFor="editor-access-token">Editor access token</label>
        <input id="editor-access-token" type="password" autoComplete="off"
          value={token} onChange={(event) => setToken(event.target.value)} />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy || !token.trim()}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
