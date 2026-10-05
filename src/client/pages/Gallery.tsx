// `/`: the public exhibition and starting point (NAV-01, NAV-02, SAVE-07).
// Newest first, name search, no popularity ranking and no invented activity.
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useSession } from "../session.ts";
import { signInLink } from "../router.ts";

export interface ExhibitCard {
  id: string;
  title: string;
  description: string;
  attribution: string[];
  height: number;
  publishedAt: number;
}

export const formatDate = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function Gallery() {
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExhibitCard[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    setItems(null);
    api<{ items: ExhibitCard[]; more: boolean }>("GET", `/api/exhibits?q=${encodeURIComponent(query)}`)
      .then((r) => live && (setItems(r.items), setMore(r.more)))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [query, attempt]);

  const loadMore = async (): Promise<void> => {
    try {
      const r = await api<{ items: ExhibitCard[]; more: boolean }>("GET", `/api/exhibits?q=${encodeURIComponent(query)}&offset=${items?.length ?? 0}`);
      setItems([...(items ?? []), ...r.items]);
      setMore(r.more);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="page">
      <section className="intro">
        <h1>A quiet table and one kind of stick.</h1>
        <p className="lede">
          Build something fragile with a few friends: a bridge, a leaning tower, a low sculpture. Every stick is the same size and
          the same weight; gravity decides the rest.
        </p>
        <p className="actions">
          {user ? (
            <a className="button primary" href="/works/">
              Go to my works
            </a>
          ) : (
            <>
              <a className="button primary" href={signInLink("register", "/works/?new=1")}>
                Start building
              </a>
              <span className="hint">Create an account to save your work and come back to it.</span>
            </>
          )}
        </p>
      </section>

      <section aria-labelledby="exhibits-h">
        <div className="section-head">
          <h2 id="exhibits-h">Exhibition</h2>
          <form
            role="search"
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <label htmlFor="exhibit-search" className="sr-only">
              Search exhibits by name
            </label>
            <input id="exhibit-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" maxLength={80} />
            <button type="submit">Search</button>
          </form>
        </div>
        <p className="muted small">Newest first. Exhibits are frozen versions; the works behind them may keep changing.</p>
        {error && (
          <div className="notice error" role="alert">
            <p>Couldn't load the exhibition: {error}</p>
            <button type="button" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        )}
        {!error && items === null && <p className="muted">Loading…</p>}
        {items && items.length === 0 && (
          <div className="empty">
            {query ? (
              <p>No exhibits are named like “{query}”.</p>
            ) : (
              <>
                <p>Nothing has been exhibited yet.</p>
                <p className="muted">When someone publishes a settled version of their work, it appears here.</p>
              </>
            )}
            <p>
              <a href={user ? "/works/" : signInLink("register", "/works/?new=1")}>Start a work</a>
            </p>
          </div>
        )}
        {items && items.length > 0 && (
          <ul className="cards">
            {items.map((e) => (
              <li key={e.id} className="card">
                <a href={`/exhibits/${e.id}/`}>
                  <img src={`/api/exhibits/${e.id}/thumbnail.svg`} alt="" loading="lazy" width="320" height="220" />
                  <span className="card-title">{e.title}</span>
                </a>
                <span className="card-meta">
                  by {e.attribution.join(", ") || "unknown"} · <span className="num">{e.height.toFixed(1)}</span> u · {formatDate(e.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {more && (
          <p>
            <button type="button" onClick={() => void loadMore()}>
              Show more
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
