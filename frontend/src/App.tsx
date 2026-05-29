import { FormEvent, useEffect, useState } from "react";

type Session = {
  authenticated: boolean;
  user_display_name: string | null;
  user_email: string | null;
  active_household_name: string | null;
  membership_role: string | null;
};

type Wine = {
  id: string;
  household_id: string;
  name: string;
  producer: string;
  vintage: string;
  quantity: number;
  currency: string;
  price: string;
  status: string;
  expected_delivery: string | null;
  notes: string;
};

type WineDraft = {
  name: string;
  producer: string;
  vintage: string;
  quantity: string;
  currency: string;
  price: string;
  status: string;
  expected_delivery: string;
  notes: string;
};

type HouseholdMembership = {
  membership_id: string;
  household_id: string;
  household_name: string;
  role: string;
};

type Member = {
  membership_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
};

type InviteDraft = {
  email: string;
  role: string;
};

type AuthDraft = {
  email: string;
  display_name: string;
  household_name: string;
  password: string;
};

const emptyDraft: WineDraft = {
  name: "",
  producer: "",
  vintage: "",
  quantity: "1",
  currency: "CHF",
  price: "0",
  status: "Ordered",
  expected_delivery: "",
  notes: "",
};

const emptyAuthDraft: AuthDraft = {
  email: "",
  display_name: "",
  household_name: "Main Cellar",
  password: "",
};

const emptyInviteDraft: InviteDraft = {
  email: "",
  role: "viewer",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function wineToDraft(wine: Wine): WineDraft {
  return {
    name: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    quantity: String(wine.quantity),
    currency: wine.currency,
    price: String(wine.price),
    status: wine.status,
    expected_delivery: wine.expected_delivery || "",
    notes: wine.notes,
  };
}

function draftPayload(draft: WineDraft) {
  return {
    name: draft.name.trim(),
    producer: draft.producer.trim(),
    vintage: draft.vintage.trim(),
    quantity: Number(draft.quantity || 0),
    currency: draft.currency.trim().toUpperCase() || "CHF",
    price: Number(draft.price || 0),
    status: draft.status,
    expected_delivery: draft.expected_delivery || null,
    notes: draft.notes.trim(),
  };
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [householdMemberships, setHouseholdMemberships] = useState<HouseholdMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [authDraft, setAuthDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(emptyInviteDraft);
  const [acceptToken, setAcceptToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSession() {
    const nextSession = await api<Session>("/api/v1/session");
    setSession(nextSession);
    return nextSession;
  }

  async function loadWines() {
    const nextWines = await api<Wine[]>("/api/v1/wines");
    setWines(nextWines);
  }

  async function loadHouseholdData() {
    const [nextMemberships, nextMembers] = await Promise.all([
      api<HouseholdMembership[]>("/api/v1/household/memberships"),
      api<Member[]>("/api/v1/household/members"),
    ]);
    setHouseholdMemberships(nextMemberships);
    setMembers(nextMembers);
  }

  async function loadData() {
    setError("");
    const nextSession = await loadSession();
    if (nextSession.authenticated) {
      await Promise.all([loadWines(), loadHouseholdData()]);
    } else {
      setWines([]);
      setHouseholdMemberships([]);
      setMembers([]);
    }
  }

  useEffect(() => {
    loadData()
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load data"))
      .finally(() => setLoading(false));
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const path = authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const payload =
        authMode === "register"
          ? authDraft
          : { email: authDraft.email, password: authDraft.password };
      const nextSession = await api<Session>(path, { method: "POST", body: JSON.stringify(payload) });
      setSession(nextSession);
      setAuthDraft(emptyAuthDraft);
      await Promise.all([loadWines(), loadHouseholdData()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to authenticate");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setError("");
    await api<void>("/api/v1/auth/logout", { method: "POST" });
    setSession({ authenticated: false, user_display_name: null, user_email: null, active_household_name: null, membership_role: null });
    setWines([]);
    setHouseholdMemberships([]);
    setMembers([]);
    setDraft(emptyDraft);
    setEditingId(null);
  }

  async function switchHousehold(householdId: string) {
    setError("");
    await api<Session>("/api/v1/household/switch", { method: "POST", body: JSON.stringify({ household_id: householdId }) });
    setDraft(emptyDraft);
    setEditingId(null);
    await loadData();
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setInviteToken("");
    try {
      const invite = await api<{ invite_token: string }>("/api/v1/household/invites", {
        method: "POST",
        body: JSON.stringify(inviteDraft),
      });
      setInviteDraft(emptyInviteDraft);
      setInviteToken(invite.invite_token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create invite");
    } finally {
      setSaving(false);
    }
  }

  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptToken.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api<void>("/api/v1/household/invites/accept", { method: "POST", body: JSON.stringify({ token: acceptToken.trim() }) });
      setAcceptToken("");
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to accept invite");
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberRole(member: Member, role: string) {
    setSaving(true);
    setError("");
    try {
      await api<Member>(`/api/v1/household/members/${member.membership_id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await loadData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update member");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: Member) {
    setSaving(true);
    setError("");
    try {
      await api<void>(`/api/v1/household/members/${member.membership_id}`, { method: "DELETE" });
      await loadHouseholdData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to remove member");
    } finally {
      setSaving(false);
    }
  }

  async function submitWine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = draftPayload(draft);
      if (editingId) {
        await api<Wine>(`/api/v1/wines/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api<Wine>("/api/v1/wines", { method: "POST", body: JSON.stringify(payload) });
      }
      setDraft(emptyDraft);
      setEditingId(null);
      await loadWines();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save wine");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWine(wine: Wine) {
    setError("");
    await api<void>(`/api/v1/wines/${wine.id}`, { method: "DELETE" });
    if (editingId === wine.id) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
    await loadWines();
  }

  const authenticated = Boolean(session?.authenticated);
  const activeMembership = householdMemberships.find((membership) => membership.household_name === session?.active_household_name);
  const canAdmin = session?.membership_role === "owner" || session?.membership_role === "admin";
  const canWriteWine = canAdmin || session?.membership_role === "member";
  const currentUserEmail = session?.user_email?.toLowerCase();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WineCellarMulti</p>
          <h1>{session?.active_household_name || "Wine Cellar"}</h1>
        </div>
        {authenticated ? (
          <div className="session-pill">
            <strong>{session?.user_display_name || session?.user_email}</strong>
            {householdMemberships.length > 1 ? (
              <select
                value={activeMembership?.household_id || ""}
                onChange={(event) => switchHousehold(event.target.value).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to switch household"))}
              >
                {householdMemberships.map((membership) => (
                  <option key={membership.membership_id} value={membership.household_id}>
                    {membership.household_name}
                  </option>
                ))}
              </select>
            ) : null}
            <span>{session?.membership_role}</span>
            <button type="button" className="secondary compact" onClick={() => logout().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to logout"))}>
              Logout
            </button>
          </div>
        ) : null}
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {!authenticated ? (
        <section className="auth-panel">
          <div className="auth-tabs">
            <button type="button" className={authMode === "login" ? "" : "secondary"} onClick={() => setAuthMode("login")}>Login</button>
            <button type="button" className={authMode === "register" ? "" : "secondary"} onClick={() => setAuthMode("register")}>Register</button>
          </div>
          <form className="wine-form" onSubmit={submitAuth}>
            <h2>{authMode === "register" ? "Create account" : "Login"}</h2>
            <label>
              <span>Email</span>
              <input type="email" value={authDraft.email} onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })} required />
            </label>
            {authMode === "register" ? (
              <>
                <label>
                  <span>Name</span>
                  <input value={authDraft.display_name} onChange={(event) => setAuthDraft({ ...authDraft, display_name: event.target.value })} required />
                </label>
                <label>
                  <span>Household</span>
                  <input value={authDraft.household_name} onChange={(event) => setAuthDraft({ ...authDraft, household_name: event.target.value })} required />
                </label>
              </>
            ) : null}
            <label>
              <span>Password</span>
              <input type="password" value={authDraft.password} onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })} minLength={authMode === "register" ? 8 : 1} required />
            </label>
            <button type="submit" disabled={saving}>{saving ? "Working" : authMode === "register" ? "Create account" : "Login"}</button>
          </form>
        </section>
      ) : (
        <section className="workspace">
          <form className="wine-form" onSubmit={submitWine}>
            <h2>{editingId ? "Edit wine" : "Add wine"}</h2>
            {!canWriteWine ? <p className="empty-state">Viewer access: you can read this cellar, but cannot change wines.</p> : null}
            <label>
              <span>Name</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required disabled={!canWriteWine} />
            </label>
            <label>
              <span>Producer</span>
              <input value={draft.producer} onChange={(event) => setDraft({ ...draft, producer: event.target.value })} disabled={!canWriteWine} />
            </label>
            <div className="form-row">
              <label>
                <span>Vintage</span>
                <input value={draft.vintage} onChange={(event) => setDraft({ ...draft, vintage: event.target.value })} disabled={!canWriteWine} />
              </label>
              <label>
                <span>Quantity</span>
                <input type="number" min="0" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} disabled={!canWriteWine} />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Price</span>
                <input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} disabled={!canWriteWine} />
              </label>
              <label>
                <span>Currency</span>
                <input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} disabled={!canWriteWine} />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Status</span>
                <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} disabled={!canWriteWine}>
                  <option>Ordered</option>
                  <option>Shipped</option>
                  <option>Delivered</option>
                  <option>Consumed</option>
                </select>
              </label>
              <label>
                <span>Delivery</span>
                <input type="date" value={draft.expected_delivery} onChange={(event) => setDraft({ ...draft, expected_delivery: event.target.value })} disabled={!canWriteWine} />
              </label>
            </div>
            <label>
              <span>Notes</span>
              <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} disabled={!canWriteWine} />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={saving || !canWriteWine}>{saving ? "Saving" : editingId ? "Save changes" : "Create wine"}</button>
              {editingId ? (
                <button type="button" className="secondary" onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <section className="wine-list" aria-busy={loading}>
            <div className="list-header">
              <h2>Wines</h2>
              <span>{wines.length} records</span>
            </div>
            {loading ? <p className="empty-state">Loading wines</p> : null}
            {!loading && wines.length === 0 ? <p className="empty-state">No wines yet</p> : null}
            {wines.map((wine) => (
              <article className="wine-row" key={wine.id}>
                <div>
                  <h3>{wine.name} <small>{wine.vintage}</small></h3>
                  <p>{wine.producer || "No producer"} - {wine.quantity}x - {wine.status}</p>
                </div>
                <strong>{wine.currency} {Number(wine.price).toFixed(0)}</strong>
                <div className="row-actions">
                  <button type="button" className="secondary" disabled={!canWriteWine} onClick={() => { setEditingId(wine.id); setDraft(wineToDraft(wine)); }}>
                    Edit
                  </button>
                  <button type="button" className="danger" disabled={!canAdmin} onClick={() => deleteWine(wine).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wine"))}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>

          <aside className="team-panel">
            <h2>Household</h2>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.membership_id}>
                  <div>
                    <strong>{member.display_name || member.email}</strong>
                    <span>{member.email}</span>
                  </div>
                  {canAdmin && member.role !== "owner" ? (
                    <div className="member-actions">
                      <select
                        value={member.role}
                        disabled={saving}
                        onChange={(event) => updateMemberRole(member, event.target.value)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="danger compact"
                        disabled={saving || member.email.toLowerCase() === currentUserEmail}
                        onClick={() => removeMember(member)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <small>{member.role}</small>
                  )}
                </div>
              ))}
            </div>

            {canAdmin ? (
              <form className="inline-form" onSubmit={createInvite}>
                <h3>Invite member</h3>
                <label>
                  <span>Email</span>
                  <input type="email" value={inviteDraft.email} onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} required />
                </label>
                <label>
                  <span>Role</span>
                  <select value={inviteDraft.role} onChange={(event) => setInviteDraft({ ...inviteDraft, role: event.target.value })}>
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button type="submit" disabled={saving}>{saving ? "Creating" : "Create invite"}</button>
                {inviteToken ? <p className="token-box">{inviteToken}</p> : null}
              </form>
            ) : null}

            <form className="inline-form" onSubmit={acceptInvite}>
              <h3>Accept invite</h3>
              <label>
                <span>Invite token</span>
                <input value={acceptToken} onChange={(event) => setAcceptToken(event.target.value)} />
              </label>
              <button type="submit" className="secondary" disabled={saving || !acceptToken.trim()}>
                Accept
              </button>
            </form>
          </aside>
        </section>
      )}
    </main>
  );
}
