import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, apiSend } from "./api";
import type { Ring, TestAccount } from "./types";

const emptyForm = { ring: "R0" as Ring, username: "", password: "", notes: "" };

export function TestAccounts() {
  const [rings, setRings] = useState<Ring[]>(["R0", "R1", "R2", "R3", "R4"]);
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const result = await apiGet<{ rings: Ring[]; accounts: TestAccount[] }>("/api/test-accounts");
      setRings(result.rings);
      setAccounts(result.accounts);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load test accounts.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(account: TestAccount) {
    setEditingId(account.id);
    setForm({ ring: account.ring, username: account.username, password: "", notes: account.notes });
    setStatus("");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const payload = { ...form };
    setForm((current) => ({ ...current, password: "" }));
    try {
      if (editingId) {
        await apiSend("PUT", `/api/test-accounts/${editingId}`, payload);
        setRevealed(({ [editingId]: _removed, ...rest }) => rest);
        setStatus(`Updated ${payload.username}.`);
      } else {
        await apiPost("/api/test-accounts", payload);
        setStatus(`Added ${payload.username} to ${payload.ring}.`);
      }
      resetForm();
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the test account.");
    } finally {
      payload.password = "";
      setBusy(false);
    }
  }

  async function remove(account: TestAccount) {
    if (!window.confirm(`Remove ${account.username} from ${account.ring}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await apiSend("DELETE", `/api/test-accounts/${account.id}`);
      if (editingId === account.id) resetForm();
      setStatus(`Removed ${account.username}.`);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not remove the test account.");
    } finally {
      setBusy(false);
    }
  }

  async function fetchPassword(id: string) {
    const result = await apiPost<{ password: string }>(`/api/test-accounts/${id}/reveal`, {});
    return result.password;
  }

  async function toggleReveal(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed(({ [id]: _removed, ...rest }) => rest);
      return;
    }
    try {
      const password = await fetchPassword(id);
      setRevealed((current) => ({ ...current, [id]: password }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not reveal the password.");
    }
  }

  async function copyPassword(account: TestAccount) {
    try {
      await navigator.clipboard.writeText(revealed[account.id] ?? await fetchPassword(account.id));
      setStatus(`Copied the password for ${account.username}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not copy the password.");
    }
  }

  const grouped = rings.map((ring) => ({ ring, items: accounts.filter((account) => account.ring === ring) })).filter((group) => group.items.length > 0);

  return (
    <article className="resultCard testAccounts">
      <h2>Test accounts by ring</h2>
      {error && <p className="errorMessage" role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      <form className="testAccountForm" onSubmit={submit} autoComplete="off">
        <label>Ring
          <select value={form.ring} onChange={(event) => setForm({ ...form, ring: event.target.value as Ring })} disabled={busy}>
            {rings.map((ring) => <option key={ring}>{ring}</option>)}
          </select>
        </label>
        <label>Username (email)<input type="email" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required disabled={busy} /></label>
        <label>Password
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}
            required={!editingId} placeholder={editingId ? "Leave blank to keep current" : ""} autoComplete="new-password" disabled={busy} />
        </label>
        <label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} placeholder="e.g. MFA authenticator owner" disabled={busy} /></label>
        <div className="testAccountFormActions">
          <button type="submit" disabled={busy}>{editingId ? <><Pencil size={16} />Update account</> : <><Plus size={16} />Add account</>}</button>
          {editingId && <button type="button" className="secondaryButton" onClick={resetForm} disabled={busy}>Cancel edit</button>}
        </div>
      </form>

      {grouped.length === 0 && <p>No test accounts yet. Add one above.</p>}
      {grouped.map((group) => (
        <section key={group.ring} className="ringGroup">
          <h3>{group.ring} <span className="pill">{group.items.length}</span></h3>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Username</th><th>Password</th><th>Notes</th><th>Last updated</th><th>Actions</th></tr></thead>
              <tbody>
                {group.items.map((account) => (
                  <tr key={account.id} className={editingId === account.id ? "editingRow" : undefined}>
                    <td className="serialCell">{account.username}</td>
                    <td>
                      <span className="passwordValue">{revealed[account.id] ?? "••••••••"}</span>
                      <span className="rowIconActions">
                        <button type="button" className="iconButton" aria-label={revealed[account.id] !== undefined ? "Hide password" : "Show password"} onClick={() => void toggleReveal(account.id)}>
                          {revealed[account.id] !== undefined ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button type="button" className="iconButton" aria-label="Copy password" onClick={() => void copyPassword(account)}><Copy size={15} /></button>
                      </span>
                    </td>
                    <td>{account.notes}</td>
                    <td>{new Date(account.updatedAt).toLocaleString()} by {account.updatedBy}</td>
                    <td>
                      <span className="rowIconActions">
                        <button type="button" className="secondaryButton" onClick={() => startEdit(account)} disabled={busy}><Pencil size={15} />Edit</button>
                        <button type="button" className="secondaryButton dangerButton" onClick={() => void remove(account)} disabled={busy}><Trash2 size={15} />Remove</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  );
}
