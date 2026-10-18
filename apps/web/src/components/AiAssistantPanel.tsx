import type { AiAssistantPanelProps } from "./AiAssistantPanel.types";
import { useAiAssistant } from "./AiAssistantPanel.hooks";
import { ChatMessageBubble, ChatInputForm } from "./AiAssistantPanel.parts";
import { AiSparkIcon } from "./AiSparkIcon";

export function AiAssistantPanel({ isOpen, onClose, align = "right", docked = false }: AiAssistantPanelProps) {
  const {
    messages, inputValue, setInputValue, chatEndRef, jobs,
    handleConfirmInline, handleSubmit, stopJob, undoLast,
    machineAgentConnected, machineAgentCount,
    pairingCode, pairingExpiresAt, pairingLoading, pairingError, startMachineAgentPairing,
    showSettings, setShowSettings,
    aiProvider, setAiProvider, availableProviders, agentHistory, refreshAgentHistory,
  } = useAiAssistant();

  if (!isOpen) return null;
  return (
    <div data-tpdf-panel="ai" className={`ai-chat-panel glassmorphism align-${align}${docked ? " docked" : ""}`}>
      <div className="ai-chat-header">
        <div className="ai-header-title">
          <AiSparkIcon size={18} />
          <span>TPDF Agent</span>
          <span className={`ai-status-badge${machineAgentConnected ? " pulse" : ""}`}>
            {machineAgentConnected ? "Connected" : "Offline"}
          </span>
        </div>
        <div className="ai-header-actions">
          <button type="button" className="ai-header-btn" onClick={() => setShowSettings(!showSettings)} title="Agent connection">⚙</button>
          <button type="button" className="ai-header-close" onClick={onClose} title="Close agent">×</button>
        </div>
      </div>
      {showSettings ? (
        <div className="ai-settings-panel">
          <h4>Machine Agent connection</h4>
          <p>{machineAgentConnected
            ? `${machineAgentCount} machine agent(s) available.`
            : "Pair a machine agent to use model-driven PDF tools. No LLM API key is stored in the browser."}</p>
          {pairingCode ? <div className="ai-pairing-code"><span>Pairing code</span><strong>{pairingCode}</strong>
            {pairingExpiresAt ? <small>Expires: {new Date(pairingExpiresAt).toLocaleTimeString()}</small> : null}
          </div> : null}
          {pairingError ? <div className="ai-pairing-error">{pairingError}</div> : null}
          <label htmlFor="tpdf-agent-provider">AI provider</label>
          <select id="tpdf-agent-provider" value={availableProviders.includes(aiProvider) ? aiProvider : "auto"} onChange={(event) => setAiProvider(event.target.value)}>
            <option value="auto">Automatic worker selection</option>
            {availableProviders.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
          </select>
          <p>{availableProviders.length ? "Available: " + availableProviders.join(", ") : "No provider advertised by an online worker."}</p>
          <p>Install and authenticate a CLI on the paired machine. No credentials are stored here.</p>
          <button type="button" className="btn-premium btn-premium-primary" disabled={pairingLoading} onClick={() => { void startMachineAgentPairing(); }}>
            {pairingLoading ? "Pairing..." : "Pair machine agent"}
          </button>
        </div>
      ) : null}
      <div className="ai-messages-container">
        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} onConfirmInline={handleConfirmInline} />
        ))}
        <div ref={chatEndRef} />
      </div>
      <details className="ai-task-history">
        <summary>Model request history ({agentHistory.length})</summary>
        <button type="button" onClick={() => { void refreshAgentHistory(); }}>Refresh history</button>
        <p>History records model decisions, not completed PDF edits.</p>
        {agentHistory.length === 0 ? <p>No recorded tasks.</p> : <ol>
          {agentHistory.slice(0, 30).map((task) => <li key={task.id}>
            <strong>{task.status}</strong> · {task.provider || "auto"} · {task.query?.slice(0, 110) || "Task"}
            {task.error ? <p role="alert">{task.error}</p> : null}
            {task.result ? <details><summary>Result</summary><pre>{JSON.stringify(task.result, null, 2)}</pre></details> : null}
          </li>)}
        </ol>}
      </details>
      <div aria-live="polite" style={{ padding: "4px 12px", fontSize: 12 }}>
        {jobs.filter((job) => job.status === "running").length} running · {jobs.filter((job) => job.status === "queued").length} queued · {jobs.filter((job) => job.status === "approval").length} awaiting approval
        <button type="button" onClick={() => { void undoLast(); }} title="Undo most recent completed AI PDF edit">Undo last AI edit</button>
        {jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "approval").map((job) => (
          <div key={job.id} data-tpdf-job={job.id}>
            <span>{job.status}: {job.goal.slice(0, 80)} </span>
            {job.steps?.length ? <details><summary>{job.steps.length} execution steps</summary><ol>{job.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></details> : null}
            <button type="button" onClick={() => stopJob(job.id)}>{job.status === "running" ? "Stop" : "Cancel"}</button>
          </div>
        ))}
      </div>
      <ChatInputForm inputValue={inputValue} setInputValue={setInputValue} onSubmit={handleSubmit} engineMode="agent" />
    </div>
  );
}
