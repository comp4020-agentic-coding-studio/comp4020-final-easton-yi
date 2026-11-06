// `/`: the public exhibition and starting point (NAV-01, NAV-02, SAVE-07).
// Newest first, name search, no popularity ranking and no invented activity.
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useSession } from "../session.ts";
import { signInLink } from "../router.ts";
import { WorldStage } from "../world/WorldStage.tsx";

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
    <>
    {/* The island opens with the page (its own region, above the existing exhibition, which is unchanged below). */}
    <WorldStage mode="home" />
    <main className="page">
      {/* The introduction (courtyard/day-night directive §2, 2026-11-06): the copy is the author's, verbatim. */}
      <section className="intro" aria-labelledby="intro-h">
        <h1 id="intro-h">A world begins with one stick.</h1>
        <p className="lede">
          A single wooden beam seems simple. Place another beside it, then another above it, and complexity begins to emerge: a
          bridge, a soaring tower, a structure with the quiet presence of an ancient monument.
        </p>
        <p className="lede">
          Build alongside others, and each placement becomes part of a conversation. What you leave becomes someone else’s
          starting point—a support, a challenge, an unexpected direction. Discover what takes shape between you.
        </p>
        <div className="intro-actions">
          <p className="actions">
            <a className="button primary" href={user ? "/works/?new=1" : signInLink("register", "/works/?new=1")}>
              Start building
            </a>
            {user && (
              <a className="button" href="/works/">
                Go to my works
              </a>
            )}
          </p>
          <p className="intro-support">Start with one stick. Invite others to add the next.</p>
          {/* account and saving: secondary, and only what applies to the current sign-in state */}
          {!user && <p className="hint small">Create an account to save your work and come back to it.</p>}
        </div>
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
    </>
  );
}
