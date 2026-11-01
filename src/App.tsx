import {
  Activity,
  Bot,
  Bug,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  FileDown,
  FileSearch,
  Gauge,
  Home,
  LogIn,
  Menu,
  QrCode,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Table2,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "./api";
import { AccountPage, LoginPage } from "./Account";
import { Directory } from "./Directory";
import type { Account, BugDraft, PolicyAnswer, PolicySetupPlan, Priority, RequirementDocument, TestCase } from "./types";

const navItems = [
  { path: "/", label: "Command Center", icon: Home },
  { path: "/test-cases", label: "Test Cases", icon: ClipboardList },
  { path: "/bug-drafter", label: "Bug Drafter", icon: Bug },
  { path: "/directory", label: "Devices", icon: Database },
  { path: "/policy", label: "Policy Setup Assistant", icon: ShieldCheck },
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
  const [account, setAccount] = useState<Account | null>(null);
  const [accountsConfigured, setAccountsConfigured] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const isPrivileged = account?.role === "admin" || account?.role === "dev";
  const visibleNavItems = isPrivileged ? [...navItems, { path: "/account", label: "Account", icon: UserRound }] : navItems;

  useEffect(() => {
    apiGet<{ configured: boolean; account: Account | null }>("/api/auth/session")
      .then((session) => {
        setAccountsConfigured(session.configured);
        setAccount(session.account);
      })
      .catch(() => setAccount(null))
      .finally(() => setSessionChecked(true));
  }, []);

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
          {visibleNavItems.map((item) => (
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
        {sessionChecked && !account && (
          <NavLink to="/login" className="navItem signInLink" onClick={() => setIsNavOpen(false)}>
            <LogIn size={18} />
            <span>Admin / Dev sign in</span>
          </NavLink>
        )}
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
          <Route path="/login" element={<LoginPage account={account} configured={accountsConfigured} onSignedIn={setAccount} />} />
          <Route
            path="/account"
            element={sessionChecked ? <AccountPage account={account} onSignedOut={() => setAccount(null)} /> : null}
          />
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
    requirement: "Microsoft Teams mobile users must be able to sign in with valid credentials and see a helpful error for invalid credentials.",
    feature: "Sign in",
    platform: "Android",
    priority: "High" as Priority,
    count: 2,
    includeScreenshots: false
  });
  const [loading, setLoading] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [document, setDocument] = useState<RequirementDocument | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function importDocument(file: File | undefined) {
    if (!file) return;
    setError("");
    setDocument(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Document must be 5 MB or smaller.");
      return;
    }
    setImporting(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      const result = await apiPost<RequirementDocument>("/api/requirements/extract", { fileName: file.name, content });
      setDocument(result);
      setForm((current) => ({
        ...current,
        requirement: result.text
      }));
      setTestCases([]);
      setNotice("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Document import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setTestCases([]);
    setNotice("");
    try {
      const data = await apiPost<{ testCases: TestCase[]; notice: string }>("/api/test-cases/generate", form);
      setTestCases(data.testCases);
      setNotice(data.notice);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Test case generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Test Case Generator" kicker="Microsoft Teams mobile coverage for Android and iOS only">
      <section className="resultCard">
        <label>Upload requirement document
          <input type="file" accept=".txt,.md,.pdf,.docx" disabled={importing || loading} onChange={(event) => {
            void importDocument(event.target.files?.[0]);
            event.target.value = "";
          }} />
        </label>
        <p>TXT, Markdown, text-based PDF or DOCX, up to 5 MB / 60,000 extracted characters. Text is sent to the configured OpenAI provider for structuring. Remove secrets and personal data first.</p>
        {importing && <p role="status">Extracting and structuring requirements...</p>}
        {document && <div>
          <h2>{document.fileName}</h2>
          <p role="status">{document.notice}</p>
          <ol>{document.requirements.map((requirement, index) => <li key={`${requirement.id}-${index}`}><strong>{requirement.id}: {requirement.title}</strong><p>{requirement.description}</p></li>)}</ol>
          <details><summary>Original extracted text</summary><pre className="documentText">{document.text}</pre></details>
        </div>}
      </section>
      {error && <p className="errorMessage" role="alert">{error}</p>}
      <FormPanel onSubmit={submit} loading={loading || importing} button="Generate Teams cases">
        <TextArea label="Requirement" value={form.requirement} onChange={(value) => setForm({ ...form, requirement: value })} />
        <Input label="Feature" value={form.feature} onChange={(value) => setForm({ ...form, feature: value })} />
        <Select label="Platform" value={form.platform} options={["iOS", "Android"]} onChange={(value) => setForm({ ...form, platform: value })} />
        <Select label="Priority" value={form.priority} options={priorities} onChange={(value) => setForm({ ...form, priority: value as Priority })} />
        <Input label="Count" type="number" min={1} max={8} value={String(form.count)} onChange={(value) => setForm({ ...form, count: Number(value) })} />
        <label className="checkLabel wide"><input type="checkbox" checked={form.includeScreenshots} onChange={(event) => setForm({ ...form, includeScreenshots: event.target.checked })} />Find Microsoft documentation screenshots when available (references, not test evidence)</label>
      </FormPanel>
      {notice && <p role="status">{notice}</p>}
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
                <td className="attachmentCell">
                  {testCase.attachments?.length ? testCase.attachments.map((attachment) => (
                    <figure className="screenshotReference" key={attachment.url}>
                      <img src={attachment.url} alt={attachment.title} loading="lazy" referrerPolicy="no-referrer" />
                      <a href={attachment.url} target="_blank" rel="noreferrer">Open screenshot reference</a>
                      <figcaption>{attachment.title} <a href={attachment.sourceUrl} target="_blank" rel="noreferrer">Microsoft source</a></figcaption>
                    </figure>
                  )) : "No reference found. Attach real device evidence after execution."}
                </td>
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

function PolicyAssistant() {
  const [question, setQuestion] = useState("How should Teams external access be controlled?");
  const [answer, setAnswer] = useState<PolicyAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PolicySetupPlan | null>(null);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPlan(null);
    try {
      const result = await apiPost<PolicySetupPlan>("/api/policy/setup", {
        question,
        context: history.filter((message) => message.role === "user").slice(-3).map((message) => message.text)
      });
      setPlan(result);
      setHistory((current) => [...current, { role: "user", text: question }, { role: "assistant", text: `${result.portal.name}: ${result.explanation}` }]);
      setQuestion("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Policy recommendation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function getGuidance() {
    setError("");
    setLoading(true);
    try {
      setAnswer(await apiPost<PolicyAnswer>("/api/policy/ask", { question }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Guidance retrieval failed.");
    } finally {
      setLoading(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!plan) return;
    setLoginBusy(true);
    setError("");
    setLoginMessage("");
    const credentials = { portalId: plan.portal.id, username, password };
    setPassword("");
    try {
      const result = await apiPost<{ sessionId: string; message: string }>("/api/policy/login/start", credentials, token);
      setSessionId(result.sessionId);
      setLoginMessage(result.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Browser login failed.");
    } finally {
      credentials.password = "";
      setLoginBusy(false);
    }
  }

  async function closeSession() {
    setLoginBusy(true);
    setError("");
    try {
      const result = await apiPost<{ message: string }>("/api/policy/login/close", { sessionId }, token);
      setSessionId("");
      setLoginMessage(result.message);
      setUsername("");
      setToken("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not close the browser session.");
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <Page title="Policy Setup Assistant" kicker="AI-guided Microsoft portal selection with human-controlled policy changes">
      <p>Describe the policy, not your credentials. AI recommends an approved portal and navigation steps. Credentials belong only in the separate local login form or on Microsoft sign-in.</p>
      <section className="policyChat" aria-label="Policy conversation" role="log" aria-live="polite">
        {history.map((message, index) => <article className={`chatMessage ${message.role}`} key={index}><strong>{message.role === "user" ? "You" : "Policy assistant"}</strong><p>{message.text}</p></article>)}
      </section>
      {error && <p className="errorMessage" role="alert">{error}</p>}
      <FormPanel onSubmit={submit} loading={loading || loginBusy || Boolean(sessionId)} button="Find portal and setup path">
        <TextArea label="Policy request (no passwords)" value={question} onChange={setQuestion} />
        <button type="button" className="secondaryButton" disabled={loading || question.trim().length < 4} onClick={() => void getGuidance()}>Find supporting guidance</button>
      </FormPanel>
      {plan && <article className="resultCard">
        <h2>{plan.portal.name}</h2>
        <p>{plan.explanation}</p>
        <ol>{plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <a className="sourceLink" href={plan.portal.url} target="_blank" rel="noreferrer">Open {plan.portal.name}</a>
        <p>AI navigation is a draft and may vary by tenant, licensing and role. Review changes manually. The dashboard never applies policies.</p>
        <details>
          <summary>Automated login on this computer (private local backend only)</summary>
          <p>A visible isolated Chromium window opens on the backend computer, not on a remote user's device. Credentials are sent only to the local backend and Microsoft, never to OpenAI. They are not saved to disk; JavaScript memory cannot guarantee secure erasure. Complete MFA in that window. Federated/custom identity providers require manual sign-in.</p>
          <form className="credentialForm" onSubmit={login} autoComplete="off">
            <label>Local automation token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} required minLength={32} autoComplete="off" disabled={loginBusy || Boolean(sessionId)} /></label>
            <label>Admin email<input type="email" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="off" disabled={loginBusy || Boolean(sessionId)} /></label>
            <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" disabled={loginBusy || Boolean(sessionId)} /></label>
            <button type="submit" disabled={loginBusy || Boolean(sessionId)}>{loginBusy ? "Working..." : "Open portal and submit sign-in"}</button>
          </form>
        </details>
      </article>}
      {loginMessage && <p role="status">{loginMessage}</p>}
      {sessionId && <button type="button" disabled={loginBusy} onClick={() => void closeSession()}>Close isolated browser session</button>}
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
    attachments: (testCase.attachments ?? []).map((attachment) => `${attachment.title}\nScreenshot: ${attachment.url}\nSource: ${attachment.sourceUrl}`).join("\n\n")
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
