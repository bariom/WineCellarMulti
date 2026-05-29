import { ChangeEvent, FormEvent, useEffect, useState } from "react";

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
  current_value: string | null;
  status: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  merchant: string;
  order_date: string | null;
  expected_delivery: string | null;
  owner_share_pct: string;
  notes: string;
  ai_notes: string;
  drink_from: number | null;
  drink_peak_from: number | null;
  drink_peak_to: number | null;
  drink_to: number | null;
  drink_window_notes: string;
  ai_value_notes: string;
  ai_value_estimated_at: string | null;
  rating: number;
  owners: Array<{ name: string; share_pct: number }>;
  tags: string[];
  grapes: Array<{ name: string; percentage_from?: number; percentage_to?: number }>;
  scores: Array<{ critic: string; score: string; note: string }>;
};

type WineDraft = {
  name: string;
  producer: string;
  vintage: string;
  quantity: string;
  currency: string;
  price: string;
  current_value: string;
  status: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  merchant: string;
  order_date: string;
  expected_delivery: string;
  owner_share_pct: string;
  notes: string;
};

type WishlistItem = {
  id: string;
  household_id: string;
  name: string;
  producer: string;
  vintage: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
  target_price: string;
  currency: string;
  merchant: string;
  priority: string;
  purpose: string;
  status: string;
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
  current_value: "",
  status: "Ordered",
  format: "",
  type: "",
  region: "",
  appellation: "",
  merchant: "",
  order_date: "",
  expected_delivery: "",
  owner_share_pct: "100",
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
    current_value: wine.current_value ? String(wine.current_value) : "",
    status: wine.status,
    format: wine.format || "",
    type: wine.type || "",
    region: wine.region || "",
    appellation: wine.appellation || "",
    merchant: wine.merchant || "",
    order_date: wine.order_date || "",
    expected_delivery: wine.expected_delivery || "",
    owner_share_pct: String(wine.owner_share_pct || "100"),
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
    current_value: draft.current_value ? Number(draft.current_value) : null,
    status: draft.status,
    format: draft.format.trim(),
    type: draft.type.trim(),
    region: draft.region.trim(),
    appellation: draft.appellation.trim(),
    merchant: draft.merchant.trim(),
    order_date: draft.order_date || null,
    expected_delivery: draft.expected_delivery || null,
    owner_share_pct: Number(draft.owner_share_pct || 100),
    notes: draft.notes.trim(),
  };
}

function tokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite") || params.get("token") || "";
}

function inviteLink(token: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  return url.toString();
}

function formatDisplayDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-CH").format(date);
}

function formatGrape(grape: Wine["grapes"][number]) {
  const from = grape.percentage_from;
  const to = grape.percentage_to;
  if (from && to && from !== to) return `${grape.name} ${from}-${to}%`;
  if (from || to) return `${grape.name} ${from || to}%`;
  return grape.name;
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || "Not specified"}</strong>
    </div>
  );
}

function WineDetail({ wine }: { wine: Wine }) {
  const drinkStart = wine.drink_from || Number(wine.vintage) || new Date().getFullYear();
  const drinkEnd = wine.drink_to || drinkStart;
  const peakStart = wine.drink_peak_from || drinkStart;
  const peakEnd = wine.drink_peak_to || drinkEnd;
  const span = Math.max(drinkEnd - drinkStart, 1);
  const peakLeft = Math.min(Math.max(((peakStart - drinkStart) / span) * 100, 0), 96);
  const peakWidth = Math.max(((peakEnd - peakStart) / span) * 100, 4);
  const peakRightBound = Math.max(100 - peakLeft, 4);

  return (
    <section className="wine-detail">
      <div className="detail-title">
        <div>
          <p className="eyebrow">Wine detail</p>
          <h2>{wine.name}</h2>
          <span>{[wine.producer, wine.vintage, wine.region, wine.appellation].filter(Boolean).join(" - ")}</span>
        </div>
        <strong>{wine.currency} {Number(wine.current_value || wine.price).toFixed(0)}</strong>
      </div>

      <div className="detail-grid">
        <DetailField label="Format" value={wine.format} />
        <DetailField label="Type" value={wine.type} />
        <DetailField label="Status" value={wine.status} />
        <DetailField label="Quantity" value={`${wine.quantity} bottles`} />
        <DetailField label="Purchase price" value={`${wine.currency} ${Number(wine.price).toFixed(0)}`} />
        <DetailField label="Current value" value={wine.current_value ? `${wine.currency} ${Number(wine.current_value).toFixed(0)}` : ""} />
        <DetailField label="Merchant" value={wine.merchant} />
        <DetailField label="Delivery" value={formatDisplayDate(wine.expected_delivery)} />
      </div>

      {(wine.drink_from || wine.drink_to) ? (
        <div className="drink-window">
          <div className="section-heading">
            <h3>Drinking window</h3>
            <span>{drinkStart}-{drinkEnd}</span>
          </div>
          <div className="window-track">
            <span className="window-peak" style={{ left: `${peakLeft}%`, width: `${Math.min(peakWidth, peakRightBound)}%` }} />
          </div>
          <div className="window-labels">
            <span>{drinkStart}</span>
            <span>Peak {peakStart}-{peakEnd}</span>
            <span>{drinkEnd}</span>
          </div>
          {wine.drink_window_notes ? <p>{wine.drink_window_notes}</p> : null}
        </div>
      ) : null}

      {wine.scores.length ? (
        <div className="detail-section">
          <h3>Scores</h3>
          <ul>
            {wine.scores.map((score, index) => (
              <li key={`${score.critic}-${index}`}>
                <strong>{score.critic} {score.score}</strong>
                {score.note ? <span>{score.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {wine.grapes.length ? (
        <div className="detail-section">
          <h3>Grapes</h3>
          <div className="chip-list">
            {wine.grapes.map((grape, index) => <span key={`${grape.name}-${index}`}>{formatGrape(grape)}</span>)}
          </div>
        </div>
      ) : null}

      {wine.tags.length ? (
        <div className="detail-section">
          <h3>Tags</h3>
          <div className="chip-list">
            {wine.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
      ) : null}

      {wine.ai_notes || wine.ai_value_notes || wine.notes ? (
        <div className="detail-section notes-section">
          {wine.notes ? <p><strong>Notes</strong>{wine.notes}</p> : null}
          {wine.ai_notes ? <p><strong>AI notes</strong>{wine.ai_notes}</p> : null}
          {wine.ai_value_notes ? <p><strong>Value notes</strong>{wine.ai_value_notes}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function WishlistDetail({ item }: { item: WishlistItem }) {
  return (
    <section className="wine-detail">
      <div className="detail-title">
        <div>
          <p className="eyebrow">Wishlist detail</p>
          <h2>{item.name}</h2>
          <span>{[item.producer, item.vintage, item.region, item.appellation].filter(Boolean).join(" - ")}</span>
        </div>
        <strong>{item.currency} {Number(item.target_price).toFixed(0)}</strong>
      </div>
      <div className="detail-grid">
        <DetailField label="Format" value={item.format} />
        <DetailField label="Type" value={item.type} />
        <DetailField label="Priority" value={item.priority} />
        <DetailField label="Purpose" value={item.purpose} />
        <DetailField label="Status" value={item.status} />
        <DetailField label="Merchant" value={item.merchant} />
      </div>
      {item.notes ? (
        <div className="detail-section notes-section">
          <p><strong>Notes</strong>{item.notes}</p>
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [householdMemberships, setHouseholdMemberships] = useState<HouseholdMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [authDraft, setAuthDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(emptyInviteDraft);
  const [acceptToken, setAcceptToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [activeView, setActiveView] = useState<"cellar" | "wishlist">("cellar");
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wineFormOpen, setWineFormOpen] = useState(false);
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
    setSelectedWineId((currentId) => (currentId && nextWines.some((wine) => wine.id === currentId) ? currentId : nextWines[0]?.id || null));
  }

  async function loadWishlist() {
    const nextWishlist = await api<WishlistItem[]>("/api/v1/wishlist");
    setWishlist(nextWishlist);
    setSelectedWishlistId((currentId) => (currentId && nextWishlist.some((item) => item.id === currentId) ? currentId : nextWishlist[0]?.id || null));
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
      await Promise.all([loadWines(), loadWishlist(), loadHouseholdData()]);
    } else {
      setWines([]);
      setWishlist([]);
      setHouseholdMemberships([]);
      setMembers([]);
    }
  }

  useEffect(() => {
    const urlToken = tokenFromUrl();
    if (urlToken) {
      setAcceptToken(urlToken);
    }
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
      await Promise.all([loadWines(), loadWishlist(), loadHouseholdData()]);
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
    setWishlist([]);
    setHouseholdMemberships([]);
    setMembers([]);
    setDraft(emptyDraft);
    setEditingId(null);
    setSelectedWineId(null);
    setSelectedWishlistId(null);
    setWineFormOpen(false);
  }

  async function switchHousehold(householdId: string) {
    setError("");
    await api<Session>("/api/v1/household/switch", { method: "POST", body: JSON.stringify({ household_id: householdId }) });
    setDraft(emptyDraft);
    setEditingId(null);
    setSelectedWineId(null);
    setSelectedWishlistId(null);
    setWineFormOpen(false);
    await loadData();
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setInviteToken("");
    setGeneratedInviteLink("");
    try {
      const invite = await api<{ invite_token: string }>("/api/v1/household/invites", {
        method: "POST",
        body: JSON.stringify(inviteDraft),
      });
      setInviteDraft(emptyInviteDraft);
      setInviteToken(invite.invite_token);
      setGeneratedInviteLink(inviteLink(invite.invite_token));
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
      window.history.replaceState(null, "", window.location.pathname);
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
    if (!window.confirm(`Remove ${member.display_name || member.email} from this household?`)) return;
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
      setSelectedWineId(null);
      setWineFormOpen(false);
      await loadWines();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save wine");
    } finally {
      setSaving(false);
    }
  }

  async function importLegacyFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const payload = JSON.parse(await file.text());
      await api<{ wines_imported: number; wishlist_imported: number }>("/api/v1/imports/legacy-json", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await Promise.all([loadWines(), loadWishlist()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import legacy export");
    } finally {
      setSaving(false);
      event.target.value = "";
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
  const selectedWine = wines.find((wine) => wine.id === selectedWineId) || null;
  const selectedWishlistItem = wishlist.find((item) => item.id === selectedWishlistId) || null;

  function startAddWine() {
    setDraft(emptyDraft);
    setEditingId(null);
    setWineFormOpen(true);
  }

  function startEditWine(wine: Wine) {
    setSelectedWineId(wine.id);
    setEditingId(wine.id);
    setDraft(wineToDraft(wine));
    setWineFormOpen(true);
  }

  function closeWineForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setWineFormOpen(false);
  }

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
          {acceptToken ? (
            <div className="invite-notice">
              <strong>Invite link detected</strong>
              <span>Login or create an account with the invited email, then accept the invite.</span>
            </div>
          ) : null}
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
          <div className="view-tabs">
            <button type="button" className={activeView === "cellar" ? "" : "secondary"} onClick={() => setActiveView("cellar")}>
              Cellar ({wines.length})
            </button>
            <button type="button" className={activeView === "wishlist" ? "" : "secondary"} onClick={() => { setActiveView("wishlist"); setWineFormOpen(false); }}>
              Wishlist ({wishlist.length})
            </button>
          </div>
          <aside className="wine-side-panel">
            {activeView === "cellar" ? (
              <div className="side-panel-actions">
                <button type="button" onClick={startAddWine} disabled={!canWriteWine}>
                  Add wine
                </button>
                {selectedWine && !wineFormOpen ? (
                  <button type="button" className="secondary" onClick={() => startEditWine(selectedWine)} disabled={!canWriteWine}>
                    Edit selected
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeView === "cellar" && wineFormOpen ? (
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
                    <span>Format</span>
                    <input value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>Type</span>
                    <input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>Region</span>
                    <input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>Appellation</span>
                    <input value={draft.appellation} onChange={(event) => setDraft({ ...draft, appellation: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
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
                    <span>Current value</span>
                    <input type="number" min="0" step="0.01" value={draft.current_value} onChange={(event) => setDraft({ ...draft, current_value: event.target.value })} disabled={!canWriteWine} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>Currency</span>
                    <input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} disabled={!canWriteWine} />
                  </label>
                  <label>
                    <span>Merchant</span>
                    <input value={draft.merchant} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} disabled={!canWriteWine} />
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
                    <span>Order date</span>
                    <input type="date" value={draft.order_date} onChange={(event) => setDraft({ ...draft, order_date: event.target.value })} disabled={!canWriteWine} />
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
                  <button type="button" className="secondary" onClick={closeWineForm}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : activeView === "cellar" && selectedWine ? (
              <WineDetail wine={selectedWine} />
            ) : activeView === "wishlist" && selectedWishlistItem ? (
              <WishlistDetail item={selectedWishlistItem} />
            ) : (
              <div className="wine-detail empty-detail">
                <h2>No item selected</h2>
                <p>Select an item from the list to see the complete detail.</p>
              </div>
            )}
          </aside>

          <section className="wine-list" aria-busy={loading}>
            <div className="list-header">
              <h2>{activeView === "cellar" ? "Wines" : "Wishlist"}</h2>
              <span>{activeView === "cellar" ? wines.length : wishlist.length} records</span>
            </div>
            {loading ? <p className="empty-state">Loading data</p> : null}
            {!loading && activeView === "cellar" && wines.length === 0 ? <p className="empty-state">No wines yet</p> : null}
            {!loading && activeView === "wishlist" && wishlist.length === 0 ? <p className="empty-state">No wishlist items yet</p> : null}
            {activeView === "cellar" ? wines.map((wine) => (
              <article className={selectedWineId === wine.id ? "wine-row selected" : "wine-row"} key={wine.id} onClick={() => setSelectedWineId(wine.id)}>
                <div>
                  <h3>{wine.name} <small>{wine.vintage}</small></h3>
                  <p>{wine.producer || "No producer"} - {wine.quantity}x - {wine.status}</p>
                  <p>{[wine.format, wine.type, wine.region, wine.appellation].filter(Boolean).join(" - ")}</p>
                  {wine.tags.length ? <p>Tags: {wine.tags.join(", ")}</p> : null}
                  {wine.scores.length ? <p>Scores: {wine.scores.map((score) => `${score.critic} ${score.score}`).join(", ")}</p> : null}
                  {wine.drink_from && wine.drink_to ? <p>Drink window: {wine.drink_from}-{wine.drink_to}</p> : null}
                </div>
                <strong>{wine.currency} {Number(wine.current_value || wine.price).toFixed(0)}</strong>
                <div className="row-actions">
                  <button type="button" className="secondary" disabled={!canWriteWine} onClick={(event) => { event.stopPropagation(); startEditWine(wine); }}>
                    Edit
                  </button>
                  <button type="button" className="danger" disabled={!canAdmin} onClick={(event) => { event.stopPropagation(); deleteWine(wine).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wine")); }}>
                    Delete
                  </button>
                </div>
              </article>
            )) : wishlist.map((item) => (
              <article className={selectedWishlistId === item.id ? "wine-row selected" : "wine-row"} key={item.id} onClick={() => setSelectedWishlistId(item.id)}>
                <div>
                  <h3>{item.name} <small>{item.vintage}</small></h3>
                  <p>{item.producer || "No producer"} - {item.purpose} - {item.status}</p>
                  <p>{[item.format, item.type, item.region, item.appellation].filter(Boolean).join(" - ")}</p>
                  {item.notes ? <p>{item.notes}</p> : null}
                </div>
                <strong>{item.currency} {Number(item.target_price).toFixed(0)}</strong>
                <div className="row-actions">
                  <span className="priority-chip">{item.priority}</span>
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
              <>
                <div className="inline-form">
                  <h3>Import legacy export</h3>
                  <label>
                    <span>WineCellar JSON</span>
                    <input type="file" accept="application/json,.json" onChange={importLegacyFile} disabled={saving} />
                  </label>
                </div>
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
                  {inviteToken ? (
                    <div className="token-box">
                      <span>Invite token</span>
                      <code>{inviteToken}</code>
                      <span>Invite link</span>
                      <a href={generatedInviteLink}>{generatedInviteLink}</a>
                    </div>
                  ) : null}
                </form>
              </>
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
