// `/favorites/`: a private list of exhibit references (SAVE-07). A withdrawn
// or deleted exhibit shows only that state and can be removed (SAVE-12).
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { signInLink } from "../router.ts";
import { useSession } from "../session.ts";
import { formatDate } from "./Gallery.tsx";

type Fav =
  | { exhibitId: string; withdrawn: true; removed?: true; savedAt: number }
  | { exhibitId: string; withdrawn: false; savedAt: number; title: string; height: number; attribution: string[] };

export function Favorites() {
  const { user } = useSession();
  const [favs, setFavs] = useState<Fav[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    setError(null);
    api<{ favorites: Fav[] }>("GET", "/api/favorites")
      .then((r) => setFavs(r.favorites))
      .catch((e) => setError(e.message));
  }, [user, attempt]);

  if (!user) {
    return (
      <main className="page narrow">
        <h1>Favorites</h1>
        <p>Favorites are private to your account.</p>
        <p>
          <a className="button primary" href={signInLink("login", "/favorites/")}>
            Sign in
          </a>
        </p>
      </main>
    );
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await api("DELETE", `/api/favorites/${id}`);
      setFavs((f) => f?.filter((x) => x.exhibitId !== id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="page">
      <h1>Favorites</h1>
      <p className="muted small">Only you can see this list.</p>
      {error && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}
      {!error && favs === null && <p className="muted">Loading…</p>}
      {favs && favs.length === 0 && (
        <div className="empty">
          <p>No favorites yet.</p>
          <p>
            <a href="/">Browse the exhibition</a> and use “Add to favorites” on an exhibit you like.
          </p>
        </div>
      )}
      {favs && favs.length > 0 && (
        <ul className="cards">
          {favs.map((f) =>
            f.withdrawn ? (
              <li key={f.exhibitId} className="card withdrawn">
                <span className="card-title">{f.removed ? "No longer available" : "Withdrawn"}</span>
                <span className="card-meta">
                  {f.removed ? "Its owner deleted this work permanently." : "Its owner withdrew this exhibit."} Saved {formatDate(f.savedAt)}.
                </span>
                <button type="button" onClick={() => void remove(f.exhibitId)}>
                  Remove from favorites
                </button>
              </li>
            ) : (
              <li key={f.exhibitId} className="card">
                <a href={`/exhibits/${f.exhibitId}/`}>
                  <img src={`/api/exhibits/${f.exhibitId}/thumbnail.svg`} alt="" loading="lazy" width="320" height="220" />
                  <span className="card-title">{f.title}</span>
                </a>
                <span className="card-meta">
                  by {f.attribution.join(", ")} · <span className="num">{f.height.toFixed(1)}</span> u
                </span>
                <button type="button" className="link" onClick={() => void remove(f.exhibitId)}>
                  Remove
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </main>
  );
}
