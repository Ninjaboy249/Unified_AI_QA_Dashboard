import { useEffect, useState } from "react";
import { apiGet } from "./api";
import type { PolicySources } from "./types";

interface DriveStatus {
  configured: boolean;
  mode: "public-folder";
  folderUrl?: string;
  message: string;
}

interface DocumentList {
  folderTitle: string;
  documents: Array<{ id: string; name: string; sourceUrl: string }>;
}

export function PolicySourceSelector({ value, onChange, disabled }: {
  value: PolicySources;
  onChange: (value: PolicySources) => void;
  disabled: boolean;
}) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [files, setFiles] = useState<DocumentList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const useDrive = value.source !== "learn";

  useEffect(() => {
    if (!useDrive) return;
    let active = true;
    setBusy(true);
    setError("");
    setFiles(null);
    apiGet<DriveStatus>("/api/policy/drive/status").then(async (result) => {
      if (!active) return;
      setStatus(result);
      if (result.configured) {
        const documents = await apiGet<DocumentList>("/api/policy/drive/documents");
        if (active) setFiles(documents);
      }
    }).catch((error: unknown) => {
      if (active) setError(error instanceof Error ? error.message : "Public Drive folder discovery failed.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [useDrive]);

  async function refresh() {
    setBusy(true);
    setError("");
    setFiles(null);
    onChange({ ...value, allowDocumentAI: false });
    try {
      const result = await apiGet<DriveStatus>("/api/policy/drive/status");
      setStatus(result);
      if (result.configured) setFiles(await apiGet<DocumentList>("/api/policy/drive/documents"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Public Drive folder discovery failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="resultCard policySources" aria-label="Policy retrieval sources">
    <h2>Policy evidence sources</h2>
    <label>Retrieve from
      <select value={value.source} disabled={disabled} onChange={(event) => {
        const source = event.target.value;
        if (source === "learn" || source === "drive" || source === "both") onChange({ source, allowDocumentAI: false });
      }}>
        <option value="learn">Microsoft Learn</option>
        <option value="drive">Public Google Drive folder</option>
        <option value="both">Microsoft Learn + public Drive folder</option>
      </select>
    </label>
    <p>RAG extracts source text, finds relevant excerpts with embeddings and returns a source-cited policy draft. AI does not apply policies.</p>
    {useDrive && <>
      <p>{status?.message ?? "Checking public Drive folder configuration..."}</p>
      <p>No Google sign-in or individual download links are required. The backend automatically discovers and reads DOCX and Google Docs directly inside the configured public folder. Subfolders, shortcuts and legacy .doc files are not included.</p>
      {status?.folderUrl && <a href={status.folderUrl} target="_blank" rel="noreferrer">View configured public folder</a>}
      <button type="button" className="secondaryButton" disabled={disabled || busy} onClick={() => void refresh()}>
        {busy ? "Discovering documents..." : "Refresh public folder"}
      </button>
      {files && <div>
        <strong>{files.folderTitle}: {files.documents.length} supported document(s)</strong>
        <ul>{files.documents.map((document) => <li key={document.id}>
          <a href={document.sourceUrl} target="_blank" rel="noreferrer">{document.name}</a>
        </li>)}</ul>
        {!files.documents.length && <p>No supported documents found. Put DOCX or Google Docs files directly inside this public folder.</p>}
      </div>}
      <label className="checkLabel">
        <input type="checkbox" checked={value.allowDocumentAI}
          disabled={disabled || busy || !files?.documents.length || Boolean(error)}
          onChange={(event) => onChange({ ...value, allowDocumentAI: event.target.checked })} />
        <span>I authorize AI processing of all supported documents in the configured public policy folder. Do not place secrets or personal data in this folder.</span>
      </label>
      <p>The folder is discovered again on each question. The existing three-document processing limit applies to the whole folder: larger folders fail explicitly rather than omit files. Each document may contain up to 60,000 extracted characters and be at most 5 MB. Text and embeddings are processed in memory, not persisted by the dashboard.</p>
      <p>Public documents can be read by anyone with access to their share links, and resulting policy answers are available to dashboard users. AI provider retention follows your provider agreement.</p>
    </>}
    {error && <p className="errorMessage" role="alert">{error}</p>}
  </section>;
}
