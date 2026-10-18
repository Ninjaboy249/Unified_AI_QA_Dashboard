import {
  Activity,
  ArrowUpDown,
  Bot,
  Bug,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  FileDown,
  FileSearch,
  Filter,
  Gauge,
  Home,
  Menu,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Table2,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "./api";
import type { BugDraft, DirectoryRecord, PolicyAnswer, Priority, TestCase } from "./types";

const navItems = [
  { path: "/", label: "Command Center", icon: Home },
  { path: "/test-cases", label: "Test Cases", icon: ClipboardList },
  { path: "/bug-drafter", label: "Bug Drafter", icon: Bug },
  { path: "/directory", label: "Device & Account", icon: Database },
  { path: "/policy", label: "Policy", icon: ShieldCheck },
  { path: "/assistant", label: "AI Assistant", icon: Bot },
  { path: "/knowledge", label: "Knowledge", icon: FileSearch },
  { path: "/evidence", label: "Evidence", icon: Gauge },
  { path: "/download", label: "Download", icon: QrCode }
];

const priorities: Priority[] = ["Low", "Medium", "High", "Critical"];

const downloadOptions = [
  { platform: "Android", detail: "Install the Android build", icon: Smartphone, qrSrc: "/android-download-qr.png" },
  { platform: "iOS", detail: "Install the iOS build", icon: Smartphone, qrSrc: "" },
  { platform: "Web", detail: "Open the browser version", icon: QrCode, qrSrc: "/web-app-qr.png" }
];

export function App() {
  const [isNavOpen, setIsNavOpen] = useState(false);

  return (
    <div className={`appShell ${isNavOpen ? "navOpen" : ""}`}>
      <header className="mobileTopbar">
        <Link to="/" className="mobileBrand" onClick={() => setIsNavOpen(false)}>
          <img className="mobileBrandLogo" src="/logo.svg" alt="Unified AI QA Dashboard" />
        </Link>
        <button
          className="menuButton"
          type="button"
          aria-label={isNavOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isNavOpen}
          onClick={() => setIsNavOpen((current) => !current)}
        >
          {isNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      <button
        className="navScrim"
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setIsNavOpen(false)}
      />
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <img className="brandLogo" src="/logo.svg" alt="Unified AI QA Dashboard" />
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className="navItem"
              onClick={() => setIsNavOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/test-cases" element={<TestCaseGenerator />} />
          <Route path="/bug-drafter" element={<BugDrafter />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/policy" element={<PolicyAssistant />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/download" element={<DownloadPage />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard() {
  const [metrics, setMetrics] = useState<Array<{ label: string; value: string; detail: string }>>([]);
  const [activity, setActivity] = useState<string[]>([]);
  const [intent, setIntent] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    apiGet<{ label: string; value: string; detail: string }[]>("/api/metrics").then(setMetrics).catch(() => undefined);
    apiGet<string[]>("/api/activity").then(setActivity).catch(() => undefined);
  }, []);

  async function submitIntent(event: FormEvent) {
    event.preventDefault();
    const result = await apiPost<{ path: string }>("/api/assistant/route", { intent });
    navigate(result.path);
  }

  return (
    <Page title="Command Center" kicker="Grounded, structured and workflow-focused QA operations">
      <section className="brandHero" aria-label="Unified AI QA Dashboard">
        <img src="/logo.svg" alt="Unified AI QA Dashboard" />
      </section>

      <form className="intentBar" onSubmit={submitIntent}>
        <Sparkles size={20} />
        <input value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Describe the QA task" />
        <button type="submit">Route</button>
      </form>

      <section className="metricGrid">
        {metrics.map((metric) => (
          <article className="metricCard" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <section className="split">
        <div>
          <h2>Quick Actions</h2>
          <div className="actionGrid">
            {navItems.slice(1, 5).map((item) => (
              <Link to={item.path} className="actionTile" key={item.path}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2>Recent Activity</h2>
          <ol className="activityList">
            {activity.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>
    </Page>
  );
}

function TestCaseGenerator() {
  const [form, setForm] = useState({
    requirement: "Users must be able to sign in with valid credentials and see a helpful error for invalid credentials.",
    feature: "Sign in",
    platform: "Android",
    priority: "High" as Priority,
    count: 2
  });
  const [loading, setLoading] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await apiPost<{ testCases: TestCase[] }>("/api/test-cases/generate", form);
      setTestCases(data.testCases);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Test Case Generator" kicker="Requirement to structured iOS, Android or Web coverage">
      <FormPanel onSubmit={submit} loading={loading} button="Generate">
        <TextArea label="Requirement" value={form.requirement} onChange={(value) => setForm({ ...form, requirement: value })} />
        <Input label="Feature" value={form.feature} onChange={(value) => setForm({ ...form, feature: value })} />
        <Select label="Platform" value={form.platform} options={["iOS", "Android", "Web"]} onChange={(value) => setForm({ ...form, platform: value })} />
        <Select label="Priority" value={form.priority} options={priorities} onChange={(value) => setForm({ ...form, priority: value as Priority })} />
        <Input label="Count" type="number" min={1} max={8} value={String(form.count)} onChange={(value) => setForm({ ...form, count: Number(value) })} />
      </FormPanel>
      <ResultToolbar data={testCases} fileName="test-cases.json">
        <button onClick={() => downloadTestCasesExcel(testCases)} type="button">
          <Table2 size={16} />Download Excel
        </button>
      </ResultToolbar>
      {testCases.length > 0 && <TestCaseTable testCases={testCases} />}
    </Page>
  );
}

function TestCaseTable({ testCases }: { testCases: TestCase[] }) {
  return (
    <section className="tableWrap testCaseTableWrap" aria-label="Generated test cases">
      <table className="testCaseTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Test Title</th>
            <th>Action Steps</th>
            <th>Expected Steps</th>
            <th>Attachments</th>
          </tr>
        </thead>
        <tbody>
          {testCases.map((testCase) => {
            const row = toTestCaseExportRow(testCase);
            return (
              <tr key={testCase.id}>
                <td className="testIdCell">{row.id}</td>
                <td>
                  <strong>{row.title}</strong>
                  <span className="testMeta">{testCase.type} · {testCase.priority}</span>
                </td>
                <td><pre>{row.actionSteps}</pre></td>
                <td><pre>{row.expectedSteps}</pre></td>
                <td className="attachmentCell">{row.attachments || "Add evidence link or screenshot"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function BugDrafter() {
  const [form, setForm] = useState({
    requirement: "The mobile app must preserve an active session during normal navigation.",
    summary: "App crashes after returning from profile settings.",
    environment: "Android 15 Pixel 8",
    version: "2.4.0-beta",
    occurrence: "3 of 5 attempts",
    severity: "High" as Priority,
    priority: "High" as Priority
  });
  const [loading, setLoading] = useState(false);
  const [bug, setBug] = useState<BugDraft | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await apiPost<{ bug: BugDraft }>("/api/bugs/draft", form);
      setBug(data.bug);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Bug Drafter" kicker="Issue context to triage-ready defect draft">
      <FormPanel onSubmit={submit} loading={loading} button="Draft Bug">
        <TextArea label="Requirement" value={form.requirement} onChange={(value) => setForm({ ...form, requirement: value })} />
        <TextArea label="Summary" value={form.summary} onChange={(value) => setForm({ ...form, summary: value })} />
        <Input label="Environment" value={form.environment} onChange={(value) => setForm({ ...form, environment: value })} />
        <Input label="Version" value={form.version} onChange={(value) => setForm({ ...form, version: value })} />
        <Input label="Occurrence" value={form.occurrence} onChange={(value) => setForm({ ...form, occurrence: value })} />
        <Select label="Severity" value={form.severity} options={priorities} onChange={(value) => setForm({ ...form, severity: value as Priority })} />
        <Select label="Priority" value={form.priority} options={priorities} onChange={(value) => setForm({ ...form, priority: value as Priority })} />
      </FormPanel>
      <ResultToolbar data={bug} fileName="bug-draft.json" />
      {bug && (
        <article className="resultCard">
          <h2>{bug.title}</h2>
          <p>{bug.summary}</p>
          <ol>{bug.stepsToReproduce.map((step) => <li key={step}>{step}</li>)}</ol>
          <p><b>Expected:</b> {bug.expectedBehavior}</p>
          <p><b>Actual:</b> {bug.actualBehavior}</p>
          <div className="tagRow">{bug.tags.map((tag) => <span className="pill" key={tag}>{tag}</span>)}</div>
        </article>
      )}
    </Page>
  );
}

function Directory() {
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("All");
  const [platform, setPlatform] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState<{ key: keyof DirectoryRecord; direction: "asc" | "desc" }>({
    key: "owner",
    direction: "asc"
  });
  const [records, setRecords] = useState<DirectoryRecord[]>([]);

  useEffect(() => {
    apiGet<{ records: DirectoryRecord[] }>(`/api/directory/search?q=${encodeURIComponent(query)}`)
      .then((data) => setRecords(data.records))
      .catch(() => undefined);
  }, [query]);

  const owners = useMemo(() => ["All", ...unique(records.map((record) => record.owner))], [records]);
  const platforms = useMemo(() => ["All", ...unique(records.map((record) => record.platform))], [records]);
  const statuses = useMemo(() => ["All", ...unique(records.map((record) => record.status))], [records]);

  const visibleRecords = useMemo(() => {
    return records
      .filter((record) => owner === "All" || record.owner === owner)
      .filter((record) => platform === "All" || record.platform === platform)
      .filter((record) => status === "All" || record.status === status)
      .sort((first, second) => compareDirectory(first, second, sort.key, sort.direction));
  }, [owner, platform, records, sort, status]);

  const activeCount = records.filter((record) => record.status === "Active").length;
  const obsoleteCount = records.filter((record) => record.status === "Obsolete").length;

  function updateSort(key: keyof DirectoryRecord) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function resetFilters() {
    setQuery("");
    setOwner("All");
    setPlatform("All");
    setStatus("All");
    setSort({ key: "owner", direction: "asc" });
  }

  return (
    <Page title="Device & Account" kicker="Excel-style QA device inventory with filter, sort and export">
      <section className="inventorySummary">
        <article><span>Total devices</span><strong>{records.length}</strong></article>
        <article><span>Active</span><strong>{activeCount}</strong></article>
        <article><span>Obsolete</span><strong>{obsoleteCount}</strong></article>
        <article><span>Visible rows</span><strong>{visibleRecords.length}</strong></article>
      </section>

      <section className="inventoryControls">
        <label className="searchBox">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, device, OS, serial or accessories" />
        </label>
        <div className="filterGrid">
          <Select label="Owner" value={owner} options={owners} onChange={setOwner} />
          <Select label="Platform" value={platform} options={platforms} onChange={setPlatform} />
          <Select label="Status" value={status} options={statuses} onChange={setStatus} />
          <button className="secondaryButton" onClick={resetFilters} type="button"><Filter size={16} />Reset</button>
          <button className="secondaryButton" onClick={() => download("device-inventory.csv", toCsv(visibleRecords))} type="button"><FileDown size={16} />Export CSV</button>
        </div>
      </section>

      <section className="tableWrap inventoryTableWrap">
        <table className="inventoryTable">
          <thead>
            <tr>
              <SortableTh label="S.No" sortKey="serialGroup" active={sort} onSort={updateSort} />
              <SortableTh label="Name" sortKey="owner" active={sort} onSort={updateSort} />
              <SortableTh label="Device" sortKey="device" active={sort} onSort={updateSort} />
              <SortableTh label="Platform" sortKey="platform" active={sort} onSort={updateSort} />
              <SortableTh label="OS" sortKey="os" active={sort} onSort={updateSort} />
              <SortableTh label="Complete OS version" sortKey="completeOsVersion" active={sort} onSort={updateSort} />
              <SortableTh label="Serial No." sortKey="serialNo" active={sort} onSort={updateSort} />
              <SortableTh label="Accessories" sortKey="accessories" active={sort} onSort={updateSort} />
              <SortableTh label="Status" sortKey="status" active={sort} onSort={updateSort} />
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((record) => (
              <tr key={record.id}>
                <td>{record.serialGroup || "-"}</td>
                <td className="ownerCell">{record.owner}</td>
                <td>{record.device}</td>
                <td><span className={`platformBadge ${record.platform.toLowerCase()}`}>{record.platform}</span></td>
                <td>{record.os}</td>
                <td>{record.completeOsVersion}</td>
                <td className="serialCell">{record.serialNo}</td>
                <td className="accessoryCell">{record.accessories}</td>
                <td><span className={`statusBadge ${record.status.toLowerCase()}`}>{record.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Page>
  );
}

function SortableTh({
  label,
  sortKey,
  active,
  onSort
}: {
  label: string;
  sortKey: keyof DirectoryRecord;
  active: { key: keyof DirectoryRecord; direction: "asc" | "desc" };
  onSort: (key: keyof DirectoryRecord) => void;
}) {
  const suffix = active.key === sortKey ? (active.direction === "asc" ? " Asc" : " Desc") : "";
  return (
    <th>
      <button className="sortButton" onClick={() => onSort(sortKey)} type="button">
        <span>{label}{suffix}</span>
        <ArrowUpDown size={14} />
      </button>
    </th>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((first, second) => first.localeCompare(second));
}

function compareDirectory(
  first: DirectoryRecord,
  second: DirectoryRecord,
  key: keyof DirectoryRecord,
  direction: "asc" | "desc"
) {
  const firstValue = first[key];
  const secondValue = second[key];
  const multiplier = direction === "asc" ? 1 : -1;

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * multiplier;
  }

  return String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
}

function toCsv(records: DirectoryRecord[]) {
  const headers = ["S.No", "Name", "Device", "Platform", "OS", "Complete OS version", "Serial No.", "Accessories", "Status"];
  const rows = records.map((record) => [
    record.serialGroup || "",
    record.owner,
    record.device,
    record.platform,
    record.os,
    record.completeOsVersion,
    record.serialNo,
    record.accessories,
    record.status
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function PolicyAssistant() {
  const [question, setQuestion] = useState("How should Teams external access be controlled?");
  const [answer, setAnswer] = useState<PolicyAnswer | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      setAnswer(await apiPost<PolicyAnswer>("/api/policy/ask", { question }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Policy Assistant" kicker="Approved local evidence controls the answer boundary">
      <FormPanel onSubmit={submit} loading={loading} button="Ask">
        <TextArea label="Question" value={question} onChange={setQuestion} />
      </FormPanel>
      {answer && (
        <article className={`resultCard ${answer.found ? "found" : "notFound"}`}>
          <div className="rowBetween">
            <strong>{answer.found ? "Approved guidance found" : "No grounded answer"}</strong>
            <span className="pill">{Math.round(answer.confidence * 100)}%</span>
          </div>
          <p>{answer.answer}</p>
          {answer.sourceTitle && <p><b>Source:</b> {answer.sourceTitle} ({answer.fileName})</p>}
          {answer.sourceUrl && <a className="sourceLink" href={answer.sourceUrl} target="_blank" rel="noreferrer">Open Microsoft Learn source</a>}
        </article>
      )}
    </Page>
  );
}

function Assistant() {
  const [intent, setIntent] = useState("Draft a bug for a crash in the Android sign-in flow");
  const [route, setRoute] = useState<{ path: string; label: string; confidence: number; reason: string } | null>(null);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setRoute(await apiPost("/api/assistant/route", { intent }));
  }

  return (
    <Page title="AI Assistant" kicker="Intent to deterministic workflow route">
      <FormPanel onSubmit={submit} loading={false} button="Classify">
        <TextArea label="Intent" value={intent} onChange={setIntent} />
      </FormPanel>
      {route && (
        <article className="resultCard">
          <h2>{route.label}</h2>
          <p>{route.reason}</p>
          <p><b>Confidence:</b> {Math.round(route.confidence * 100)}%</p>
          <button onClick={() => navigate(route.path)}>Open Workflow</button>
        </article>
      )}
    </Page>
  );
}

function Knowledge() {
  const [sources, setSources] = useState<Array<{ title: string; fileName: string; preview: string }>>([]);
  useEffect(() => {
    apiGet<{ sources: Array<{ title: string; fileName: string; preview: string }> }>("/api/knowledge/sources")
      .then((data) => setSources(data.sources))
      .catch(() => undefined);
  }, []);
  return (
    <Page title="Knowledge Sources" kicker="Visibility into approved evidence">
      <section className="resultList">
        {sources.map((source) => (
          <article className="resultCard" key={source.fileName}>
            <div className="rowBetween"><strong>{source.title}</strong><span className="pill">{source.fileName}</span></div>
            <p>{source.preview}</p>
          </article>
        ))}
      </section>
    </Page>
  );
}

function Evidence() {
  const [health, setHealth] = useState<{ mode: string; model: string; baseUrl: string; ok: boolean; message: string } | null>(null);
  useEffect(() => {
    apiGet<typeof health>("/api/health").then(setHealth).catch(() => undefined);
  }, []);
  return (
    <Page title="Health & Evidence" kicker="Implementation proof for the project defense">
      <section className="metricGrid">
        <article className="metricCard"><span>Health mode</span><strong>{health?.mode ?? "checking"}</strong><small>{health?.message ?? "Contacting API"}</small></article>
        <article className="metricCard"><span>Model</span><strong>{health?.model ?? "gpt-5-mini"}</strong><small>{health?.baseUrl ?? "OpenAI endpoint"}</small></article>
        <article className="metricCard"><span>Validation</span><strong>Runtime</strong><small>Required fields and shapes checked</small></article>
        <article className="metricCard"><span>Human review</span><strong>Mandatory</strong><small>Generated items remain drafts</small></article>
      </section>
      <div className="evidenceList">
        {["Backend-only OpenAI access", "Grounded policy retrieval", "No-answer fallback", "Typed editable outputs", "Build and typecheck scripts"].map((item) => (
          <span key={item}><CheckCircle2 size={18} />{item}</span>
        ))}
      </div>
    </Page>
  );
}

function DownloadPage() {
  const webUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:4000";

  return (
    <Page title="Download" kicker="Scan to install the mobile build or open the web app">
      <section className="downloadGrid">
        {downloadOptions.map((option) => (
          <article className="downloadCard" key={option.platform}>
            <div className="downloadCardHeader">
              <span className="downloadIcon"><option.icon size={22} /></span>
              <div>
                <h2>{option.platform}</h2>
                <p>{option.detail}</p>
              </div>
            </div>
            <div className="qrFrame" aria-label={`${option.platform} QR code`}>
              {option.qrSrc ? <img src={option.qrSrc} alt={`${option.platform} QR code`} /> : <span>QR pending</span>}
            </div>
            {option.platform === "Web" ? (
              <a className="downloadLink" href={webUrl} target="_blank" rel="noreferrer">
                Open Web
              </a>
            ) : option.qrSrc ? (
              <span className="downloadStatus">Scan QR to Install</span>
            ) : (
              <button className="secondaryButton" type="button" disabled>
                QR Coming Soon
              </button>
            )}
          </article>
        ))}
      </section>
    </Page>
  );
}

function Page({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <header className="pageHeader">
        <div><span>{kicker}</span><h1>{title}</h1></div>
        <div className="statusChip"><Activity size={16} />MVP</div>
      </header>
      {children}
    </div>
  );
}

function FormPanel({ children, onSubmit, loading, button }: { children: React.ReactNode; onSubmit: (event: FormEvent) => void; loading: boolean; button: string }) {
  return (
    <form className="formPanel" onSubmit={onSubmit}>
      <div className="formGrid">{children}</div>
      <button type="submit" disabled={loading}>{loading ? "Working..." : button}</button>
    </form>
  );
}

function Input({ label, value, onChange, type = "text", min, max }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: number; max?: number }) {
  return <label>{label}<input type={type} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="wide">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function ResultToolbar({ data, fileName, children }: { data: unknown; fileName: string; children?: React.ReactNode }) {
  const json = useMemo(() => JSON.stringify(data ?? {}, null, 2), [data]);
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <div className="toolbar">
      <button onClick={() => navigator.clipboard.writeText(json)}><Copy size={16} />Copy JSON</button>
      <button onClick={() => download(fileName, json)}><FileDown size={16} />Export</button>
      {children}
    </div>
  );
}

function download(fileName: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadTestCasesExcel(testCases: TestCase[]) {
  const headers = ["ID", "Test Title", "Action Steps", "Expected Steps", "Attachments"];
  const rows = testCases.map((testCase) => {
    const row = toTestCaseExportRow(testCase);
    return [row.id, row.title, row.actionSteps, row.expectedSteps, row.attachments];
  });
  const tableRows = [headers, ...rows]
    .map((row, index) => {
      const cells = row
        .map((cell) => {
          const tag = index === 0 ? "th" : "td";
          return `<${tag}>${escapeHtml(cell)}</${tag}>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const workbook = `<!doctype html><html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif}th{background:#1f4e78;color:#fff}th,td{border:1px solid #9aa7b5;padding:8px;vertical-align:top;white-space:pre-wrap}</style></head><body><table>${tableRows}</table></body></html>`;
  downloadBlob("test-cases.xls", workbook, "application/vnd.ms-excel");
}

function downloadBlob(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toTestCaseExportRow(testCase: TestCase) {
  return {
    id: testCase.id,
    title: testCase.title,
    actionSteps: numberedLines(testCase.steps),
    expectedSteps: numberedLines(createExpectedSteps(testCase)),
    attachments: ""
  };
}

function createExpectedSteps(testCase: TestCase) {
  const expected = testCase.expectedResult.trim();
  if (testCase.steps.length <= 1) return [expected];

  return testCase.steps.map((step, index) => {
    if (index === testCase.steps.length - 1) return expected;
    return `Complete "${step}" successfully.`;
  });
}

function numberedLines(values: string[]) {
  return values.map((value, index) => `${index + 1}. ${value}`).join("\n");
}
