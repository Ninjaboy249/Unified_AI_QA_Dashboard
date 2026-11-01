import { ArrowUpDown, FileDown, Filter, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { apiGet, apiPost } from "./api";
import type { DeviceFields, DirectoryChange, DirectoryProposal, DirectoryRecord, DirectorySnapshot } from "./types";

const platforms: DirectoryRecord["platform"][] = ["Android", "iOS", "iPadOS", "Unknown"];
const statuses: DirectoryRecord["status"][] = ["Active", "Obsolete"];
const textFields = [
  ["owner", "Name", 200], ["device", "Device", 200], ["os", "OS", 100],
  ["completeOsVersion", "Complete OS version", 200], ["serialNo", "Serial No.", 200],
  ["accessories", "Accessories", 2000], ["notes", "Notes", 4000]
] as const;
const columns: Array<{ key: keyof DirectoryRecord; label: string }> = [
  { key: "serialGroup", label: "S.No" }, { key: "owner", label: "Name" },
  { key: "device", label: "Device" }, { key: "platform", label: "Platform" },
  { key: "os", label: "OS" }, { key: "completeOsVersion", label: "Complete OS version" },
  { key: "serialNo", label: "Serial No." }, { key: "accessories", label: "Accessories" },
  { key: "status", label: "Status" }, { key: "notes", label: "Notes" }
];

export function Directory() {
  const [snapshot, setSnapshot] = useState<DirectorySnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("All");
  const [platform, setPlatform] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState<{ key: keyof DirectoryRecord; direction: "asc" | "desc" }>({ key: "owner", direction: "asc" });
  const [editor, setEditor] = useState<{ id?: string; revision: number; fields: DeviceFields } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<DirectoryProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const result = await apiGet<DirectorySnapshot>("/api/directory/search");
        if (active) {
          setSnapshot((current) => !current || result.revision >= current.revision ? result : current);
          setLoadError("");
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load the shared inventory.");
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const records = snapshot?.records ?? [];
  const owners = useMemo(() => Array.from(new Set(records.map((record) => record.owner))).sort(), [records]);
  const visible = useMemo(() => records
    .filter((record) => !query.trim() || Object.values(record).join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .filter((record) => owner === "All" || record.owner === owner)
    .filter((record) => platform === "All" || record.platform === platform)
    .filter((record) => status === "All" || record.status === status)
    .sort((first, second) => {
      const a = first[sort.key];
      const b = second[sort.key];
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
      return comparison * (sort.direction === "asc" ? 1 : -1);
    }), [records, query, owner, platform, status, sort]);
  const writable = snapshot?.persistence === "postgres";
  const locked = busy || Boolean(editor) || Boolean(proposal);

  function resetFilters() {
    setQuery("");
    setOwner("All");
    setPlatform("All");
    setStatus("All");
    setSort({ key: "owner", direction: "asc" });
  }

  function openEditor(record?: DirectoryRecord, forOwner?: DirectoryRecord) {
    if (!snapshot) return;
    setError("");
    setMessage("");
    const fields: DeviceFields = record ? fieldsOf(record) : {
      serialGroup: forOwner?.serialGroup ?? Math.max(0, ...records.map((item) => item.serialGroup)) + 1,
      owner: forOwner?.owner ?? "", device: "", os: "", completeOsVersion: "", serialNo: "",
      accessories: "", platform: "Unknown", status: "Active", notes: ""
    };
    setEditor({ id: record?.id, revision: snapshot.revision, fields });
  }

  async function save(changes: DirectoryChange[], revision: number) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiPost<DirectorySnapshot>("/api/directory/changes", { changes, revision });
      setSnapshot((current) => !current || result.revision >= current.revision ? result : current);
      setEditor(null);
      setProposal(null);
      resetFilters();
      setLoadError("");
      setMessage(`Saved ${changes.length} change(s) to the shared database. Other open dashboards refresh within 10 seconds.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Save failed. Refresh to check the latest inventory before retrying.");
    } finally {
      setBusy(false);
    }
  }

  function saveEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const change: DirectoryChange = editor.id
      ? { type: "update", id: editor.id, fields: editor.fields }
      : { type: "add", record: editor.fields };
    void save([change], editor.revision);
  }

  async function plan(event: FormEvent) {
    event.preventDefault();
    if (!snapshot) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      setProposal(await apiPost<DirectoryProposal>("/api/directory/plan", { prompt, revision: snapshot.revision }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "AI could not prepare a preview. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  function remove(record: DirectoryRecord) {
    if (!snapshot) return;
    setError("");
    setMessage("");
    setProposal({
      revision: snapshot.revision,
      summary: `Remove ${record.device} from ${record.owner}'s inventory? This deletes only this device row.`,
      changes: [{ type: "delete", id: record.id }],
      preview: [{ type: "delete", before: record, after: null }]
    });
  }

  return (
    <div className="page">
      <header className="pageHeader"><div><span>Shared device inventory with manual and AI-assisted editing</span><h1>Devices</h1></div></header>
      {snapshot && <p role="status">{snapshot.message} {writable && "Refreshes every 10 seconds and when this window gains focus."}</p>}
      {!snapshot && !loadError && <p role="status">Loading device inventory...</p>}
      {loadError && <p className="errorMessage" role="alert">{loadError} {snapshot && "Showing the last loaded data."}</p>}
      {error && <p className="errorMessage" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section className="inventorySummary">
        <article><span>Total devices</span><strong>{records.length}</strong></article>
        <article><span>Active</span><strong>{records.filter((record) => record.status === "Active").length}</strong></article>
        <article><span>Obsolete</span><strong>{records.filter((record) => record.status === "Obsolete").length}</strong></article>
        <article><span>Visible rows</span><strong>{visible.length}</strong></article>
      </section>

      <form className="resultCard" onSubmit={plan}>
        <h2>Update devices with one prompt</h2>
        <p>For example: "Add an iPhone 16 for Anjna, serial ABC123, iOS 18" or "Change DEV-001 OS to 18 and mark it obsolete." Include a device ID or serial number when an owner has multiple devices.</p>
        <p>The prompt and inventory are sent to the configured OpenAI provider. Remove secrets from device notes. AI proposals never save until you confirm.</p>
        <label>Device change prompt<textarea value={prompt} maxLength={4000} minLength={4} required onChange={(event) => setPrompt(event.target.value)} disabled={!writable || locked} /></label>
        <div className="toolbar">
          <button type="submit" disabled={!writable || locked || prompt.trim().length < 4}>{busy ? "Working..." : "Preview AI changes"}</button>
          <button type="button" className="secondaryButton" disabled={!writable || locked} onClick={() => openEditor()}><Plus size={16} />Add device manually</button>
        </div>
      </form>

      {editor && <form className="resultCard" onSubmit={saveEditor} aria-label="Device editor">
        <h2>{editor.id ? `Edit device ${editor.id}` : "Add device"}</h2>
        {editor.revision !== snapshot?.revision && <p role="alert" className="errorMessage">The shared inventory changed while this editor was open. Your draft is preserved, but cancel and reopen the editor against the latest records before saving.</p>}
        <div className="deviceEditorGrid">
          <label>S.No<input type="number" min={0} max={1_000_000} required value={editor.fields.serialGroup} disabled={busy} onChange={(event) => setEditor({ ...editor, fields: { ...editor.fields, serialGroup: Number(event.target.value) } })} /></label>
          {textFields.map(([key, label, maxLength]) => <label key={key}>{label}{key === "notes" || key === "accessories" ? <textarea
            aria-label={label} value={editor.fields[key]} maxLength={maxLength} disabled={busy}
            onChange={(event) => setEditor({ ...editor, fields: { ...editor.fields, [key]: event.target.value } })}
          /> : <input
            aria-label={label} value={editor.fields[key]} maxLength={maxLength} required={key === "owner" || key === "device"} disabled={busy}
            list={key === "owner" ? "inventory-owners" : undefined}
            onChange={(event) => {
              const value = event.target.value;
              const existingOwner = key === "owner" && !editor.id
                ? records.find((record) => record.owner.toLowerCase() === value.trim().toLowerCase()) : undefined;
              setEditor({ ...editor, fields: { ...editor.fields, [key]: value, ...(existingOwner ? { serialGroup: existingOwner.serialGroup } : {}) } });
            }}
          />}</label>)}
          <label>Platform<select aria-label="Platform" value={editor.fields.platform} disabled={busy} onChange={(event) => {
            const value = platforms.find((item) => item === event.target.value);
            if (value) setEditor({ ...editor, fields: { ...editor.fields, platform: value } });
          }}>{platforms.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Status<select aria-label="Status" value={editor.fields.status} disabled={busy} onChange={(event) => {
            const value = statuses.find((item) => item === event.target.value);
            if (value) setEditor({ ...editor, fields: { ...editor.fields, status: value } });
          }}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <datalist id="inventory-owners">{owners.map((value) => <option key={value} value={value} />)}</datalist>
        <div className="toolbar">
          <button type="submit" disabled={busy || editor.revision !== snapshot?.revision}>{busy ? "Saving..." : "Save device"}</button>
          <button type="button" className="secondaryButton" disabled={busy} onClick={() => setEditor(null)}>Cancel editing</button>
        </div>
      </form>}

      {proposal && <section className="resultCard" aria-label="Device change preview">
        <h2>Review changes before saving</h2><p>{proposal.summary}</p>
        {proposal.revision !== snapshot?.revision && <p className="errorMessage" role="alert">This preview is out of date. Cancel and generate a new preview; no changes have been saved.</p>}
        {proposal.preview.map((change, index) => <article className="deviceChangePreview" key={index}>
          <h3>{change.type.toUpperCase()}: {(change.after ?? change.before)?.owner} - {(change.after ?? change.before)?.device}</h3>
          {change.before && <p>Device ID: {change.before.id}</p>}
          <dl>{columns.filter(({ key }) => !change.before || !change.after || change.before[key] !== change.after[key]).map(({ key, label }) => <div key={key}>
            <dt>{label}</dt><dd>{change.before ? String(change.before[key]) || "(empty)" : "(new row)"} <span aria-label="changes to">{" -> "}</span>{change.after ? String(change.after[key]) || "(empty)" : "(deleted)"}</dd>
          </div>)}</dl>
        </article>)}
        <div className="toolbar">
          <button type="button" disabled={busy || proposal.revision !== snapshot?.revision} onClick={() => void save(proposal.changes, proposal.revision)}>{busy ? "Saving..." : "Confirm and save changes"}</button>
          <button type="button" className="secondaryButton" disabled={busy} onClick={() => setProposal(null)}>Cancel preview</button>
        </div>
      </section>}

      <section className="inventoryControls">
        <label className="searchBox"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, device, ID, OS, serial, accessories or notes" /></label>
        <div className="filterGrid">
          <FilterSelect label="Owner" value={owner} options={["All", ...owners, ...(owner !== "All" && !owners.includes(owner) ? [owner] : [])]} onChange={setOwner} />
          <FilterSelect label="Platform" value={platform} options={["All", ...platforms]} onChange={setPlatform} />
          <FilterSelect label="Status" value={status} options={["All", ...statuses]} onChange={setStatus} />
          <button className="secondaryButton" onClick={resetFilters} type="button"><Filter size={16} />Reset</button>
          <button className="secondaryButton" onClick={() => exportCsv(visible)} type="button" disabled={!snapshot}><FileDown size={16} />Export CSV</button>
        </div>
      </section>

      <section className="tableWrap inventoryTableWrap">
        <table className="inventoryTable">
          <thead><tr>{columns.map(({ key, label }) => <th key={key} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
            <button type="button" className="sortButton" onClick={() => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))}>
              {label}<ArrowUpDown size={14} />
            </button>
          </th>)}<th>Actions</th></tr></thead>
          <tbody>{visible.map((record) => <tr key={record.id}>
            <td>{record.serialGroup || "-"}</td><td className="ownerCell">{record.owner}</td>
            <td>{record.device}<small className="deviceRecordId">{record.id}</small></td>
            <td><span className={`platformBadge ${record.platform.toLowerCase()}`}>{record.platform}</span></td>
            <td>{record.os}</td><td>{record.completeOsVersion}</td><td className="serialCell">{record.serialNo}</td>
            <td className="accessoryCell">{record.accessories}</td>
            <td><span className={`statusBadge ${record.status.toLowerCase()}`}>{record.status}</span></td>
            <td>{record.notes}</td><td><div className="deviceRowActions">
              <button type="button" className="secondaryButton" disabled={!writable || locked} onClick={() => openEditor(record)}>Edit</button>
              <button type="button" className="secondaryButton" disabled={!writable || locked} onClick={() => openEditor(undefined, record)}>Add for user</button>
              <button type="button" className="secondaryButton" disabled={!writable || locked} onClick={() => remove(record)}>Remove</button>
            </div></td>
          </tr>)}</tbody>
        </table>
        {snapshot && visible.length === 0 && <p className="emptyInventory">No devices match the current filters.</p>}
      </section>
    </div>
  );
}

function fieldsOf(record: DirectoryRecord): DeviceFields {
  const { id: _id, ...fields } = record;
  return fields;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label>{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function exportCsv(records: DirectoryRecord[]) {
  const cells = [["ID", ...columns.map((column) => column.label)], ...records.map((record) => [record.id, ...columns.map(({ key }) => String(record[key]))])];
  const text = cells.map((row) => row.map((cell) => {
    const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "device-inventory.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
