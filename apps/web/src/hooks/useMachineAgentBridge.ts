import { useCallback, useEffect, useState } from "react";

type AgentSummary = {
  id: string;
  name: string;
  machineId: string;
  version: string;
  pairedAt: number;
  lastSeenAt: number;
  online: boolean;
  providers?: string[];
};

type Pairing = {
  pairingId: string;
  code: string;
  expiresAt: number;
};

type TaskState = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string | null;
  query?: string;
  provider?: string | null;
  createdAt?: number;
  completedAt?: number | null;
};

const isServerRuntime = () =>
  typeof window !== "undefined" && window.__TPDF_RUNTIME__ === "server";

export function useMachineAgentBridge() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<TaskState[]>([]);
  const [provider, setProvider] = useState(() => typeof window === "undefined" ? "auto" : (localStorage.getItem("tpdf_agent_provider") || "auto"));
  const availableProviders = [...new Set(agents.filter((agent) => agent.online).flatMap((agent) => agent.providers || ["dify"]))];
  const chooseProvider = useCallback((next: string) => { setProvider(next); if (typeof window !== "undefined") localStorage.setItem("tpdf_agent_provider", next); }, []);

  const refresh = useCallback(async () => {
    if (!isServerRuntime()) return;
    try {
      const response = await fetch("/api/tpdf/agent/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Agent status failed: HTTP ${response.status}`);
      const payload = await response.json() as { agents?: AgentSummary[] };
      setAgents(Array.isArray(payload.agents) ? payload.agents : []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load machine agent status.");
    }
  }, []);

  useEffect(() => {
    if (!isServerRuntime()) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const refreshHistory = useCallback(async () => {
    if (!isServerRuntime()) return;
    try {
      const result = await fetch("/api/tpdf/agent/history", { credentials: "same-origin", cache: "no-store" });
      if (result.ok) {
        const value = await result.json() as { tasks?: TaskState[] };
        setHistory(Array.isArray(value.tasks) ? value.tasks : []);
      }
    } catch { /* Keep previous history on temporary network failure. */ }
  }, []);

  useEffect(() => { if (isServerRuntime()) void refreshHistory(); }, [refreshHistory]);

  const startPairing = useCallback(async () => {
    if (!isServerRuntime()) return null;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tpdf/agent/pairing/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Unable to start pairing: HTTP ${response.status}`);
      const payload = await response.json() as Pairing;
      setPairing(payload);
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start pairing.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendQuery = useCallback(async (query: string, context: Record<string, unknown>, signal?: AbortSignal) => {
    if (!isServerRuntime()) throw new Error("Machine Agent Bridge is available on TPDF Server.");
    const response = await fetch("/api/tpdf/agent/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context, ...(provider !== "auto" ? { provider } : {}) }),
    });
    if (response.status === 409) {
      throw new Error("No paired machine agent is online. Open AI settings and pair your machine first.");
    }
    if (!response.ok) throw new Error(`Machine Agent request failed: HTTP ${response.status}`);
    const task = await response.json() as { id: string };

    const cancelRemote = () => fetch(`/api/tpdf/agent/tasks/${task.id}/cancel`, {
      method: "POST", credentials: "same-origin",
    }).catch(() => undefined);
    if (signal?.aborted) { await cancelRemote(); throw new DOMException("Cancelled", "AbortError"); }
    const onAbort = () => { void cancelRemote(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const deadline = Date.now() + 6 * 60_000;
    try {
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      const poll = await fetch(`/api/tpdf/agent/tasks/${task.id}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!poll.ok) throw new Error(`Machine Agent task failed: HTTP ${poll.status}`);
      const state = await poll.json() as TaskState;
      if (state.status === "completed") {
        void refresh();
        void refreshHistory();
        return state.result;
      }
      if (state.status === "cancelled") throw new DOMException("Cancelled", "AbortError");
      if (state.status === "failed") {
        void refreshHistory();
        throw new Error(state.error || "Machine Agent task failed.");
      }
    }
    void cancelRemote();
    throw new Error("Machine Agent did not respond within six minutes.");
    } finally { signal?.removeEventListener("abort", onAbort); }
  }, [refresh, refreshHistory, provider]);

  return {
    isServerRuntime: isServerRuntime(),
    agents,
    provider,
    chooseProvider,
    availableProviders,
    history,
    refreshHistory,
    connected: agents.some((agent) => agent.online),
    pairing,
    loading,
    error,
    refresh,
    startPairing,
    sendQuery,
  };
}
