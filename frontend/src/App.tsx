export function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">WineCellarMulti</p>
        <h1>Multi-user foundation, isolated by household.</h1>
        <p className="lede">
          New repository, new tenancy model, no dependency on the legacy single-tenant runtime.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Backend</h2>
          <p>FastAPI + PostgreSQL + SQLAlchemy + Alembic.</p>
        </article>
        <article className="panel">
          <h2>Scope</h2>
          <p>Users, households, memberships, wines.</p>
        </article>
        <article className="panel">
          <h2>Rule</h2>
          <p>Every business query is scoped by household.</p>
        </article>
      </section>
    </main>
  );
}
