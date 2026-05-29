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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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
  const [draft, setDraft] = useState<WineDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setError("");
    const [nextSession, nextWines] = await Promise.all([
      api<Session>("/api/v1/session"),
      api<Wine[]>("/api/v1/wines"),
    ]);
    setSession(nextSession);
    setWines(nextWines);
  }

  useEffect(() => {
    loadData()
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load data"))
      .finally(() => setLoading(false));
  }, []);

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
      await loadData();
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
    await loadData();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WineCellarMulti</p>
          <h1>{session?.active_household_name || "Main Cellar"}</h1>
        </div>
        <div className="session-pill">
          <strong>{session?.user_display_name || "Loading"}</strong>
          <span>{session?.membership_role || "owner"}</span>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="workspace">
        <form className="wine-form" onSubmit={submitWine}>
          <h2>{editingId ? "Edit wine" : "Add wine"}</h2>
          <label>
            <span>Name</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </label>
          <label>
            <span>Producer</span>
            <input value={draft.producer} onChange={(event) => setDraft({ ...draft, producer: event.target.value })} />
          </label>
          <div className="form-row">
            <label>
              <span>Vintage</span>
              <input value={draft.vintage} onChange={(event) => setDraft({ ...draft, vintage: event.target.value })} />
            </label>
            <label>
              <span>Quantity</span>
              <input type="number" min="0" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Price</span>
              <input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
            </label>
            <label>
              <span>Currency</span>
              <input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Status</span>
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                <option>Ordered</option>
                <option>Shipped</option>
                <option>Delivered</option>
                <option>Consumed</option>
              </select>
            </label>
            <label>
              <span>Delivery</span>
              <input type="date" value={draft.expected_delivery} onChange={(event) => setDraft({ ...draft, expected_delivery: event.target.value })} />
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? "Saving" : editingId ? "Save changes" : "Create wine"}</button>
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
                <button type="button" className="secondary" onClick={() => { setEditingId(wine.id); setDraft(wineToDraft(wine)); }}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => deleteWine(wine).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to delete wine"))}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
