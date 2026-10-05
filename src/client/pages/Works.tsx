// `/works/`: works this account created or joined (NAV-01, NAV-02, SAVE-08),
// and the owner's Trash (`/works/?view=trash`, SAVE-11).
import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { navigate, signInLink } from "../router.ts";
import { useSession } from "../session.ts";
import { formatDate } from "./Gallery.tsx";
import { LIMITS } from "../../shared/config.ts";
import { plural, PurgeDialog, TrashDialog } from "../lifecycle.tsx";
import { Confirm } from "../workshop/Panels.tsx";

interface WorkSummary {
  id: string;
  title: string;
  role: "owner" | "editor";
  archived: boolean;
  stickCount: number;
  stableHeight: number;
  bestHeight: number;
  updatedAt: number;
  editorCount?: number;
  publicExhibits?: number;
}

interface TrashedWork {
  id: string;
  title: string;
  archived: boolean;
  stickCount: number;
  editorCount: number;
  exhibitCount: number;
  versionCount: number;
  trashedAt: number;
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
  const [view, setViewState] = useState<"works" | "trash">(() => (new URLSearchParams(location.search).get("view") === "trash" ? "trash" : "works"));
  const [trash, setTrash] = useState<TrashedWork[] | null>(null);
  const [trashing, setTrashing] = useState<WorkSummary | null>(null);
  const [purging, setPurging] = useState<TrashedWork | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<{ id: string; title: string }[]>([]);
  const [leaving, setLeaving] = useState<{ id: string; title: string } | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setView = (v: "works" | "trash"): void => {
    setViewState(v);
    setNotice(null);
    history.replaceState(null, "", v === "trash" ? "/works/?view=trash" : "/works/");
  };

  useEffect(() => {
    if (!user) return;
    let live = true;
    setError(null);
    Promise.all([
      api<{ works: WorkSummary[] }>("GET", "/api/works"),
      api<{ works: TrashedWork[] }>("GET", "/api/trash"),
      api<{ works: { id: string; title: string }[] }>("GET", "/api/collaborations/unavailable"),
    ])
      .then(([w, t, u]) => {
        if (!live) return;
        setWorks(w.works);
        setTrash(t.works);
        setUnavailable(u.works);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [user, attempt]);

  const reload = (message: string): void => {
    setNotice(message);
    setAttempt((a) => a + 1);
  };

  // counts in the confirmation must be current: an editor may have left since the list loaded
  const openPurge = async (w: TrashedWork): Promise<void> => {
    setError(null);
    try {
      const fresh = (await api<{ works: TrashedWork[] }>("GET", "/api/trash")).works;
      setTrash(fresh);
      const current = fresh.find((x) => x.id === w.id);
      if (current) setPurging(current);
      else setNotice("That work is no longer in your trash.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const restore = async (w: TrashedWork): Promise<void> => {
    setRestoring(w.id);
    setError(null);
    try {
      await api("POST", `/api/works/${w.id}/trash/restore`);
      reload(`Restored “${w.title}”${w.archived ? " as an archived work" : ""}. Its exhibits stay withdrawn until you republish them under Versions.`);
    } catch (e) {
      setNotice(null);
      setError((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

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
  const owned = (works?.filter((w) => w.role === "owner").length ?? 0) + (trash?.length ?? 0);

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
          You own {owned} of {LIMITS.ownedWorksPerAccount} works{trash?.length ? `, including ${trash.length} in the trash` : ""}.
        </p>
        {createError && (
          <p className="error-text" role="alert">
            {createError}
          </p>
        )}
      </form>

      <div className="view-switch" role="group" aria-label="Show">
        <button type="button" aria-pressed={view === "works"} onClick={() => setView("works")}>
          Works
        </button>
        <button type="button" aria-pressed={view === "trash"} onClick={() => setView("trash")}>
          Trash{trash?.length ? ` (${trash.length})` : ""}
        </button>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          <p>Couldn't load your works: {error}</p>
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}
      {!error && works === null && <p className="muted">Loading…</p>}
      {view === "trash" && trash && (
        <section aria-labelledby="trash-h">
          <h2 id="trash-h">Trash</h2>
          <p className="muted small">
            Only you see your trash. Works stay here until you restore them or delete them permanently; nothing is removed automatically, and they still count toward your
            work limit. Collaborators can't open a work while it's here.
          </p>
          {trash.length === 0 ? (
            <div className="empty">
              <p>Your trash is empty.</p>
            </div>
          ) : (
            <ul className="work-list">
              {trash.map((w) => (
                <li key={w.id}>
                  <span className="work-title">{w.title}</span>
                  <span className="muted small">
                    {plural(w.stickCount, "stick")} · {plural(w.versionCount, "saved version")} · {plural(w.exhibitCount, "exhibit")} (withdrawn) · {plural(w.editorCount, "collaborator")} · was{" "}
                    {w.archived ? "archived" : "active"} · moved to trash {formatDate(w.trashedAt)}
                  </span>
                  <span className="row wrap">
                    <button type="button" disabled={restoring === w.id} onClick={() => void restore(w)}>
                      {restoring === w.id ? "Restoring…" : "Restore work"}
                    </button>
                    <button type="button" className="danger" onClick={() => void openPurge(w)}>
                      Delete permanently…
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {view === "works" && works && visible.length === 0 && (
        <div className="empty">
          <p>{works.length === 0 ? (unavailable.length ? "You have no works you can open right now." : "You haven't started or joined a work yet.") : "All your works are archived."}</p>
          <p className="muted">Name one above to start. A friend can also send you an invitation link to join theirs.</p>
        </div>
      )}
      {view === "works" && visible.length > 0 && (
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
              {w.role === "owner" && (
                <span className="row wrap">
                  <button type="button" className="link" onClick={() => setTrashing(w)}>
                    Move to trash…
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {view === "works" && unavailable.length > 0 && (
        <section aria-labelledby="unavailable-h">
          <h2 id="unavailable-h">Unavailable collaborations</h2>
          <p className="muted small">Their owners moved these works to the trash. You can't open them unless the owner restores them. Leaving is permanent: restoring won't add you back.</p>
          <ul className="work-list">
            {unavailable.map((w) => (
              <li key={w.id}>
                <span className="work-title">{w.title}</span>
                <span className="muted small">Editor · in the owner's trash</span>
                <span className="row wrap">
                  <button type="button" onClick={() => (setLeaveError(null), setLeaving(w))}>
                    Leave this collaboration…
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view === "works" && archivedCount > 0 && (
        <p>
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show {archivedCount} archived
          </label>
        </p>
      )}
      {trashing && (
        <TrashDialog
          work={{ id: trashing.id, title: trashing.title, editorCount: trashing.editorCount ?? 0, publicExhibits: trashing.publicExhibits ?? 0 }}
          onCancel={() => setTrashing(null)}
          onDone={() => {
            const t = trashing.title;
            setTrashing(null);
            reload(`Moved “${t}” to the trash. You can restore it from Trash.`);
          }}
        />
      )}
      {leaving && (
        <Confirm
          title={`Leave “${leaving.title}”?`}
          confirmLabel={leaveBusy ? "Leaving…" : "Leave"}
          confirmDisabled={leaveBusy}
          onCancel={() => setLeaving(null)}
          onConfirm={async () => {
            setLeaveBusy(true);
            setLeaveError(null);
            try {
              await api("POST", `/api/works/${leaving.id}/leave`);
              const t = leaving.title;
              setLeaving(null);
              reload(`You left “${t}”. If its owner restores it, you won't be a member.`);
            } catch (e) {
              setLeaveError((e as Error).message);
            } finally {
              setLeaveBusy(false);
            }
          }}
        >
          <p>You stop being an editor of this work. The sticks you placed stay in it, credited to you. If the owner restores it later, you won't be added back.</p>
          {leaveError && (
            <p className="error-text" role="alert">
              {leaveError}
            </p>
          )}
        </Confirm>
      )}
      {purging && (
        <PurgeDialog
          work={purging}
          onCancel={() => setPurging(null)}
          onDone={() => {
            const t = purging.title;
            setPurging(null);
            reload(`Deleted “${t}” permanently.`);
          }}
        />
      )}
    </main>
  );
}
