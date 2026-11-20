import { History, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "./api";
import { apiSend } from "./api";
import { TestAccounts } from "./TestAccounts";
import type { Account, AccountSummary } from "./types";

export function LoginPage({ account, configured, onSignedIn }: { account: Account | null; configured: boolean; onSignedIn: (account: Account) => void }) {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (account) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "create") {
        await apiPost<{ message: string }>("/api/auth/create", { name, email });
        setNotice("A random password was sent to your email address. Use it to sign in.");
        setPassword("");
        setMode("signin");
        return;
      }
      const credentials = { username: email.trim().toLowerCase(), password };
      const result = await apiPost<{ account: Account }>("/api/auth/login", credentials);
      onSignedIn(result.account);
      navigate("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "The account request failed.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader"><div><span>Secure account access</span><h1>{mode === "signin" ? "Sign in" : "Create account"}</h1></div></header>
      {!configured && <p className="errorMessage" role="alert">Account sign-in is unavailable until DATABASE_URL is configured on the backend.</p>}
      {error && <p className="errorMessage" role="alert">{error}</p>}
      {notice && <p className="noticeMessage" role="status">{notice}</p>}
      <div className="authTabs" role="tablist" aria-label="Account action">
        <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button>
        <button type="button" className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); setNotice(""); }}>Create account</button>
      </div>
      <form className="formPanel accountForm" onSubmit={submit}>
        {mode === "create" && (
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} autoComplete="name" disabled={busy} /></label>
        )}
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@gmail.com" autoComplete="email" disabled={busy} /></label>
        {mode === "signin" && (
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" disabled={busy} /></label>
        )}
        <button type="submit" disabled={busy || !configured}>
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

export function ProfilePage({ account, onSignedOut }: { account: Account | null; onSignedOut: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (!account) return <Navigate to="/login" replace />;

  async function changePassword() {
    setError("");
    setStatus("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiSend("PUT", "/api/account/password", { password });
      setPassword("");
      setConfirmPassword("");
      setStatus("Permanent password updated. Sign in again.");
      onSignedOut();
      navigate("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader"><div><span>Login details</span><h1>Profile</h1></div></header>
      {error && <p className="errorMessage" role="alert">{error}</p>}
      {status && <p className="noticeMessage" role="status">{status}</p>}
      <article className="resultCard accountCard">
        <div className="rowBetween">
          <h2><UserRound size={20} /> {account.username}</h2>
          <span className="pill">{account.role === "user" ? "User" : account.role === "admin" ? "Admin" : "Dev"}</span>
        </div>
        <p><b>Session expires:</b> {new Date(account.expiresAt).toLocaleString()}</p>
      </article>
      <article className="resultCard">
        <h2><ShieldCheck size={20} /> Change password</h2>
        <div className="accountForm">
          <label>Permanent password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" disabled={busy} />
          </label>
          <label>Confirm password
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" disabled={busy} />
          </label>
          <button type="button" disabled={busy || password.length < 8} onClick={() => void changePassword()}>
            {busy ? "Updating..." : "Set permanent password"}
          </button>
        </div>
      </article>
    </div>
  );
}

export function AccountPage({ account }: { account: Account | null }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; feature: string; action: string; changes: string; username: string; createdAt: string }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!account) return;
    apiGet<{ account: Account; accounts?: AccountSummary[] }>("/api/account")
      .then((result) => setAccounts(result.accounts ?? []))
      .catch((error) => setError(error instanceof Error ? error.message : "Could not load account details."));
    apiGet<{ history: typeof history }>("/api/account/history")
      .then((result) => setHistory(result.history))
      .catch((error) => setError(error instanceof Error ? error.message : "Could not load account history."));
  }, [account]);

  if (!account) return <Navigate to="/login" replace />;

  return (
    <div className="page">
      <header className="pageHeader"><div><span>Feature credentials</span><h1>Account</h1></div></header>
      {error && <p className="errorMessage" role="alert">{error}</p>}
      <TestAccounts />
      <article className="resultCard">
        <h2><History size={20} /> Account history</h2>
        {history.length === 0 ? <p>No account changes yet.</p> : (
          <div className="tableWrap">
            <table>
              <thead><tr><th>Date</th><th>Feature</th><th>Action</th><th>Changes</th><th>Changed by</th></tr></thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.feature}</td>
                    <td>{entry.action}</td>
                    <td>{entry.changes}</td>
                    <td>{entry.username}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
      {account.role === "admin" && accounts.length > 0 && (
        <article className="resultCard">
          <h2><ShieldCheck size={20} /> Configured accounts</h2>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Username</th><th>Role</th><th>Password last set</th></tr></thead>
              <tbody>
                {accounts.map((item) => (
                  <tr key={item.username}><td>{item.username}</td><td>{item.role}</td><td>{new Date(item.updatedAt).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Accounts are managed through the ADMIN_* and DEV_* backend environment variables.</p>
        </article>
      )}
    </div>
  );
}
