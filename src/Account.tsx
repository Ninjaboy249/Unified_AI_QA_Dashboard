import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "./api";
import { TestAccounts } from "./TestAccounts";
import type { Account, AccountSummary } from "./types";

export function LoginPage({ account, configured, onSignedIn }: { account: Account | null; configured: boolean; onSignedIn: (account: Account) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (account) return <Navigate to="/account" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const credentials = { username, password };
    setPassword("");
    try {
      const result = await apiPost<{ account: Account }>("/api/auth/login", credentials);
      onSignedIn(result.account);
      navigate("/account");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      credentials.password = "";
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader"><div><span>Admin and dev access</span><h1>Sign in</h1></div></header>
      {!configured && <p className="errorMessage" role="alert">Account sign-in is unavailable until DATABASE_URL is configured on the backend.</p>}
      {error && <p className="errorMessage" role="alert">{error}</p>}
      <form className="formPanel accountForm" onSubmit={submit}>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" disabled={busy} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" disabled={busy} /></label>
        <button type="submit" disabled={busy || !configured}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  );
}

export function AccountPage({ account, onSignedOut }: { account: Account | null; onSignedOut: () => void }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!account) return;
    apiGet<{ account: Account; accounts?: AccountSummary[] }>("/api/account")
      .then((result) => setAccounts(result.accounts ?? []))
      .catch((error) => setError(error instanceof Error ? error.message : "Could not load account details."));
  }, [account]);

  if (!account) return <Navigate to="/login" replace />;

  async function signOut() {
    setBusy(true);
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      // The local session is cleared regardless; the server cookie expires on its own.
    } finally {
      onSignedOut();
      navigate("/");
    }
  }

  return (
    <div className="page">
      <header className="pageHeader"><div><span>Signed-in account</span><h1>Account</h1></div></header>
      {error && <p className="errorMessage" role="alert">{error}</p>}
      <article className="resultCard accountCard">
        <div className="rowBetween">
          <h2><UserRound size={20} /> {account.username}</h2>
          <span className="pill">{account.role === "admin" ? "Admin" : "Dev"}</span>
        </div>
        <p><b>Session expires:</b> {new Date(account.expiresAt).toLocaleString()}</p>
        <button type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={16} />Sign out</button>
      </article>
      <TestAccounts />
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
