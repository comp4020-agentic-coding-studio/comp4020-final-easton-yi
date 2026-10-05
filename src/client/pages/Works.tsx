// `/works/`: works this account created or joined (NAV-01, NAV-02, SAVE-08).
import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { navigate, signInLink } from "../router.ts";
import { useSession } from "../session.ts";
import { formatDate } from "./Gallery.tsx";
import { LIMITS } from "../../shared/config.ts";

interface WorkSummary {
  id: string;
  title: string;
  role: "owner" | "editor";
  archived: boolean;
  stickCount: number;
  stableHeight: number;
  bestHeight: number;
  updatedAt: number;
}

export function Works() {
  const { user } = useSession();
  const [works, setWorks] = useState<WorkSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("Untitled work");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const wantsNew = new URLSearchParams(location.search).has("new");

  useEffect(() => {
    if (!user) return;
    let live = true;
    setError(null);
    api<{ works: WorkSummary[] }>("GET", "/api/works")
      .then((r) => live && setWorks(r.works))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [user, attempt]);

  useEffect(() => {
    if (wantsNew) titleRef.current?.focus();
  }, [wantsNew, works]);

  if (!user) {
    return (
      <main className="page narrow">
        <h1>My works</h1>
        <p>Create an account to save your work and come back to it. Viewing the exhibition doesn't need one.</p>
        <p className="actions">
          <a className="button primary" href={signInLink("register", "/works/?new=1")}>
            Create an account
          </a>
          <a className="button" href={signInLink("login", "/works/")}>
            Sign in
          </a>
        </p>
      </main>
    );
  }

  const create = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const r = await api<{ id: string }>("POST", "/api/works", { title });
      navigate(`/works/${r.id}/?intro=1`);
    } catch (err) {
      // keep what was typed; explain the limit instead of deleting anything
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const visible = works?.filter((w) => showArchived || !w.archived) ?? [];
  const archivedCount = works?.filter((w) => w.archived).length ?? 0;
  const owned = works?.filter((w) => w.role === "owner").length ?? 0;

  return (
    <main className="page">
      <h1>My works</h1>
      <form className="create" onSubmit={(e) => void create(e)}>
        <label htmlFor="new-title">New work name</label>
        <div className="row">
          <input id="new-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          <button type="submit" className="primary" disabled={creating || !title.trim()}>
            {creating ? "Creating…" : "Create work"}
          </button>
        </div>
        <p className="muted small">
          You own {owned} of {LIMITS.ownedWorksPerAccount} works.
        </p>
        {createError && (
          <p className="error-text" role="alert">
            {createError}
          </p>
        )}
      </form>

      {error && (
        <div className="notice error" role="alert">
          <p>Couldn't load your works: {error}</p>
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}
      {!error && works === null && <p className="muted">Loading…</p>}
      {works && visible.length === 0 && (
        <div className="empty">
          <p>{works.length === 0 ? "You haven't started or joined a work yet." : "All your works are archived."}</p>
          <p className="muted">Name one above to start. A friend can also send you an invitation link to join theirs.</p>
        </div>
      )}
      {visible.length > 0 && (
        <ul className="work-list">
          {visible.map((w) => (
            <li key={w.id}>
              <a href={`/works/${w.id}/`} className="work-title">
                {w.title}
              </a>
              <span className="muted small">
                {w.role === "owner" ? "Owner" : "Editor"} · {w.stickCount} sticks · stable height <span className="num">{w.stableHeight.toFixed(1)}</span> u · best{" "}
                <span className="num">{w.bestHeight.toFixed(1)}</span> u · updated {formatDate(w.updatedAt)}
                {w.archived && " · Archived"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {archivedCount > 0 && (
        <p>
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show {archivedCount} archived
          </label>
        </p>
      )}
    </main>
  );
}
