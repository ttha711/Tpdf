"""Isolated PageIndex SDK worker. One JSON request on stdin, one JSON result on stdout."""
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

def main(payload):
    action = payload["action"]
    if action not in ("index", "ask", "search", "summarize", "outline"):
        raise ValueError("Unsupported PageIndex action")
    storage = Path(payload["storagePath"]).resolve()
    storage.mkdir(parents=True, exist_ok=True)
    from pageindex import PageIndexClient
    client = PageIndexClient(
        mode="local",
        index_model=payload["indexModel"],
        chat_model=payload["chatModel"],
        storage_path=str(storage),
    )
    if action == "index":
        path = Path(payload["pdfPath"]).resolve(strict=True)
        if path.suffix.lower() != ".pdf":
            raise ValueError("PDF input required")
        result = client.submit_document(str(path), mode="flash")
        return {"ok": True, "docId": result["doc_id"]}
    doc_id = payload["docId"]
    if action == "outline":
        return {"ok": True, "nodes": client.get_document_structure(doc_id)}
    query = payload["query"]
    if action == "summarize":
        query = "Summarize this document faithfully, giving page references where possible. " + query
    elif action == "search":
        query = "Find the relevant passages and report their page numbers. " + query
    answer = client.chat(query, doc_id=doc_id, citations=True)
    # The SDK may return a rich object (with citations), a dict, or plain text.
    # Do not invent sources when the provider does not supply structured citations.
    raw = answer if isinstance(answer, dict) else vars(answer) if hasattr(answer, "__dict__") else {}
    text = raw.get("answer") or raw.get("response") or raw.get("text")
    if not isinstance(text, str):
        text = str(answer)
    citations = []
    for item in (raw.get("citations") or [])[:50] if isinstance(raw.get("citations"), list) else []:
        data = item if isinstance(item, dict) else vars(item) if hasattr(item, "__dict__") else {}
        page = data.get("page") or data.get("page_number")
        try:
            page = int(page)
        except (TypeError, ValueError):
            continue
        if page < 1:
            continue
        quote = data.get("text") or data.get("quote") or data.get("snippet") or ""
        citations.append({"page": page, "text": str(quote)[:500]})
    return {"ok": True, "answer": text, "citations": citations}

if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        with redirect_stdout(sys.stderr):
            result = main(request)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:400]}))
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False))
