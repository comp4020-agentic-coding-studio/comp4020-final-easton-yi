// Work management: people and invitations (AUTH-02..05), versions and
// exhibits (SAVE-04..08), deliberate pushing (PUSH-01..03) and lifecycle.
// Every button here is a convenience; the server re-checks authority.
import { useEffect, useRef, useState, type RefObject } from "react";
import { api } from "../api.ts";
import type { Viewport } from "../scene/viewport.ts";
import { PERSON_COLORS, PERSON_SHAPES } from "../scene/viewport.ts";
import { LIMITS } from "../../shared/config.ts";
import type { CommandKind, CommandResultMsg, PresenceEntry, StickInfo } from "../../shared/protocol.ts";
import type { RoomView, Toast } from "./Workshop.tsx";
import { formatDate } from "../pages/Gallery.tsx";

type ToastFn = (t: string, k?: Toast["kind"]) => void;

export function Confirm({ title, children, confirmLabel, onConfirm, onCancel, danger }: { title: string; children: React.ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.showModal();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);
  return (
    <dialog ref={ref} className="confirm" aria-labelledby="confirm-h" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <h2 id="confirm-h">{title}</h2>
      <div>{children}</div>
      <p className="actions">
        <button type="button" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </p>
    </dialog>
  );
}

const useCommandResults = (onResult: (r: CommandResultMsg) => void): void => {
  const ref = useRef(onResult);
  ref.current = onResult;
  useEffect(() => {
    const l = (e: Event): void => ref.current((e as CustomEvent<CommandResultMsg>).detail);
    window.addEventListener("stillwood:command", l);
    return () => window.removeEventListener("stillwood:command", l);
  }, []);
};

// ---------------------------------------------------------------- people

interface Member {
  userId: string;
  displayName: string;
  role: "owner" | "editor";
  joinedAt: number;
}

export function MembersPanel({ workId, isOwner, me, presence, toast }: { workId: string; isOwner: boolean; me: string; presence: PresenceEntry[]; toast: ToastFn }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invite, setInvite] = useState<{ expiresAt: number; maxUses: number; used: number; expired: boolean } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);
  const load = async (): Promise<void> => {
    try {
      const w = await api<{ members: Member[] }>("GET", `/api/works/${workId}`);
      setMembers(w.members);
      if (isOwner) setInvite((await api<{ invite: typeof invite }>("GET", `/api/works/${workId}/invite`)).invite);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [workId]);
  const here = new Map(presence.map((p) => [p.userId, p]));

  const createInvite = async (): Promise<void> => {
    try {
      const r = await api<{ path: string }>("POST", `/api/works/${workId}/invite`);
      setLink(location.origin + r.path);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h2>People</h2>
      {error && <p className="error-text" role="alert">{error}</p>}
      {members && (
        <ul className="members">
          {members.map((m, i) => (
            <li key={m.userId}>
              <span style={{ color: PERSON_COLORS[i % 8] }} aria-hidden="true">
                {PERSON_SHAPES[i % 8]}
              </span>{" "}
              {m.displayName} <span className="muted">· {m.role === "owner" ? "Owner" : "Editor"}{here.has(m.userId) ? (here.get(m.userId)!.editing ? " · here, editing" : " · here, observing") : ""}</span>
              {isOwner && m.role === "editor" && (
                <button type="button" className="link" onClick={() => setRemoving(m)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Being a member doesn't by itself mean someone built anything; each stick records who placed it.</p>
      {isOwner && (
        <section aria-labelledby="inv-h">
          <h3 id="inv-h">Invite an editor</h3>
          <p className="small">
            A link lets up to {LIMITS.inviteMaxUses} people join as editors for {LIMITS.inviteDays} days. There's one active link at a time:{" "}
            <strong>making a new one switches off the old link</strong>. Switching a link off never removes people who already joined.
          </p>
          {invite && !invite.expired && (
            <p className="small">
              Current link: used by {invite.used} of {invite.maxUses}, expires {new Date(invite.expiresAt).toLocaleString()}.
            </p>
          )}
          {link && (
            <p className="invite-link">
              <label htmlFor="invite-url">Send this link to a friend (shown once):</label>
              <input id="invite-url" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Link copied", "ok"))}>
                Copy
              </button>
            </p>
          )}
          <p className="row wrap">
            <button type="button" onClick={() => void createInvite()}>
              {invite && !invite.expired ? "Make a new link (switches off the old one)" : "Make an invitation link"}
            </button>
            {invite && !invite.expired && (
              <button
                type="button"
                onClick={async () => {
                  await api("DELETE", `/api/works/${workId}/invite`).catch((e) => setError(e.message));
                  setLink(null);
                  await load();
                }}
              >
                Switch off the link
              </button>
            )}
          </p>
        </section>
      )}
      {!isOwner && (
        <p>
          <button type="button" onClick={() => setLeaving(true)}>
            Leave this work
          </button>
        </p>
      )}
      {removing && (
        <Confirm
          title={`Remove ${removing.displayName}?`}
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api("DELETE", `/api/works/${workId}/members/${removing.userId}`);
              toast(`${removing.displayName} can no longer edit. The sticks they placed keep their name.`);
            } catch (e) {
              setError((e as Error).message);
            }
            setRemoving(null);
            await load();
          }}
        >
          <p>They'll stop editing immediately and lose access to this work and its versions. Sticks they placed stay, credited to them.</p>
        </Confirm>
      )}
      {leaving && (
        <Confirm
          title="Leave this work?"
          confirmLabel="Leave"
          danger
          onCancel={() => setLeaving(false)}
          onConfirm={async () => {
            try {
              await api("POST", `/api/works/${workId}/leave`);
              location.assign("/works/");
            } catch (e) {
              setError((e as Error).message);
              setLeaving(false);
            }
          }}
        >
          <p>You'll lose access. The sticks you placed stay, credited to you. The owner can invite you again.</p>
        </Confirm>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- versions and exhibits

interface Version {
  id: string;
  kind: "named" | "restore-protect" | "push-protect";
  title: string;
  height: number;
  stickCount: number;
  stable: boolean;
  createdAt: number;
  creatorName: string;
  referenced: boolean;
}
interface WorkExhibit {
  id: string;
  title: string;
  withdrawn: boolean;
  publishedAt: number;
  snapshotId: string;
}

export function VersionsPanel({ workId, room, isOwner, sendCommand, viewport, toast, connected }: { workId: string; room: RoomView; isOwner: boolean; sendCommand: (k: CommandKind, p: unknown) => string | null; viewport: RefObject<Viewport | null>; toast: ToastFn; connected: boolean }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [exhibits, setExhibits] = useState<WorkExhibit[]>([]);
  const [title, setTitle] = useState(`Version ${new Date().toLocaleDateString()}`);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Version | null>(null);
  const [publishing, setPublishing] = useState<Version | null>(null);
  const [pubTitle, setPubTitle] = useState("");
  const [pubDesc, setPubDesc] = useState("");
  const load = async (): Promise<void> => {
    try {
      setVersions((await api<{ versions: Version[] }>("GET", `/api/works/${workId}/versions`)).versions);
      setExhibits((await api<{ exhibits: WorkExhibit[] }>("GET", `/api/works/${workId}/exhibits`)).exhibits);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [workId, room.epoch]);

  useCommandResults((r) => {
    if (r.kind === "snapshot.create" && (r.commandId === waiting || r.outcome === "accepted")) {
      if (r.outcome === "accepted") {
        toast("Version saved.", "ok");
        setWaiting(null);
        void load();
      } else if (r.outcome === "pending") {
        setWaiting(r.commandId);
      } else if (r.outcome === "cancelled" || r.outcome === "interrupted") {
        setWaiting(null);
        toast(r.outcome === "cancelled" ? "The waiting save was cancelled." : "The waiting save was interrupted; nothing was saved.");
      } else {
        setWaiting(null);
        setError(r.message ?? "Couldn't save the version.");
      }
    }
    if (r.kind === "restore") {
      if (r.outcome === "accepted") toast("Restored. A recovery point of the previous state was saved first.", "ok");
      else if (r.outcome === "rejected") setError(r.message ?? "Restore failed.");
      void load();
    }
  });

  const named = versions?.filter((v) => v.kind === "named") ?? [];
  const recovery = versions?.filter((v) => v.kind !== "named") ?? [];
  const moving = room.save === "moving" || room.measuring;

  return (
    <div>
      <h2>Versions</h2>
      {error && <p className="error-text" role="alert">{error}</p>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const id = sendCommand("snapshot.create", { title, whenSettled: moving });
          if (!id) setError("Not connected.");
          else if (moving) setWaiting(id);
        }}
      >
        <label htmlFor="ver-title">Save the current structure as a version</label>
        <input id="ver-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
        {moving && !waiting && <p className="small">The structure is still moving. A version must be a settled structure, so this will save once it settles.</p>}
        {waiting ? (
          <p className="row">
            <span>Waiting for the structure to settle…</span>
            <button type="button" onClick={() => sendCommand("snapshot.cancel", {})}>
              Cancel
            </button>
          </p>
        ) : (
          <button type="submit" disabled={!connected || !room.live || named.length >= LIMITS.namedVersionsPerWork}>
            {moving ? "Save when settled" : "Save version"}
          </button>
        )}
        <p className="muted small">
          {named.length} of {LIMITS.namedVersionsPerWork} versions used.
        </p>
      </form>

      {versions && named.length === 0 && <p className="muted">No saved versions yet.</p>}
      <ul className="versions">
        {named.map((v) => (
          <li key={v.id}>
            <strong>{v.title}</strong>
            <span className="muted small">
              {" "}
              · {v.stickCount} sticks · <span className="num">{v.height.toFixed(1)}</span> u · {v.creatorName} · {formatDate(v.createdAt)}
              {v.referenced && " · exhibited"}
            </span>
            {isOwner && (
              <span className="row wrap">
                <button type="button" onClick={() => setRestoring(v)} disabled={!connected}>
                  Restore
                </button>
                <button type="button" onClick={() => (setPublishing(v), setPubTitle(v.title), setPubDesc(""))}>
                  Exhibit…
                </button>
                {!v.referenced && (
                  <button
                    type="button"
                    className="link"
                    onClick={async () => {
                      if (!confirm(`Remove the version “${v.title}”? This can't be undone.`)) return;
                      await api("DELETE", `/api/works/${workId}/versions/${v.id}`).catch((e) => setError(e.message));
                      void load();
                    }}
                  >
                    Remove
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {recovery.length > 0 && (
        <details>
          <summary>Recovery points ({recovery.length})</summary>
          <p className="muted small">Saved automatically before restoring or pushing. They may include motion and can't be exhibited. The latest {LIMITS.recoveryPointsPerWork} are kept.</p>
          <ul className="versions">
            {recovery.map((v) => (
              <li key={v.id}>
                {v.title} <span className="muted small">· {formatDate(v.createdAt)}</span>
                {isOwner && (
                  <button type="button" onClick={() => setRestoring(v)} disabled={!connected}>
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h3>Exhibits</h3>
      {exhibits.length === 0 && <p className="muted small">Nothing exhibited from this work yet. Exhibits are frozen copies of a saved version; building on doesn't change them.</p>}
      <ul className="versions">
        {exhibits.map((x) => (
          <li key={x.id}>
            <a href={`/exhibits/${x.id}/`}>{x.title}</a> <span className="muted small">· {x.withdrawn ? "Withdrawn" : `Public since ${formatDate(x.publishedAt)}`}</span>
            {isOwner && (
              <button
                type="button"
                onClick={async () => {
                  await api("POST", `/api/exhibits/${x.id}/withdraw`, { withdrawn: !x.withdrawn }).catch((e) => setError(e.message));
                  toast(x.withdrawn ? "Exhibit is public again." : "Exhibit withdrawn. It's no longer public; copies people already downloaded can't be recalled.");
                  void load();
                }}
              >
                {x.withdrawn ? "Republish" : "Withdraw"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {restoring && (
        <Confirm
          title={`Restore “${restoring.title}”?`}
          confirmLabel="Restore"
          onCancel={() => setRestoring(null)}
          onConfirm={() => {
            const id = sendCommand("restore", { snapshotId: restoring.id });
            if (!id) setError("Not connected.");
            setRestoring(null);
          }}
        >
          <p>The current structure is saved as a recovery point first, then everyone here sees the restored one. Sticks people are holding will need a second look before placing.</p>
          <p>
            Here now: {room.presence.map((p) => p.displayName).join(", ") || "nobody else"}. Members, favorites, exhibits and the best height stay as they are.
          </p>
        </Confirm>
      )}
      {publishing && (
        <Confirm
          title="Exhibit this version"
          confirmLabel="Publish"
          onCancel={() => setPublishing(null)}
          onConfirm={async () => {
            try {
              const r = await api<{ id: string }>("POST", `/api/works/${workId}/exhibits`, {
                snapshotId: publishing.id,
                title: pubTitle,
                description: pubDesc,
                framing: viewport.current?.currentFraming() ?? { yaw: 0.8, pitch: 0.95, distance: 60, targetY: 4 },
              });
              toast("Published to the exhibition.", "ok");
              setPublishing(null);
              void load();
              void r;
            } catch (e) {
              setError((e as Error).message);
              setPublishing(null);
            }
          }}
        >
          <form className="stack" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="pub-title">Title</label>
            <input id="pub-title" value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} maxLength={80} />
            <label htmlFor="pub-desc">Short description (optional, plain text)</label>
            <textarea id="pub-desc" value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} maxLength={500} rows={3} />
            <p className="muted small">The current camera angle becomes the exhibit's starting view. Visitors see the geometry, title, description and who placed sticks; never the member list or the working structure.</p>
          </form>
        </Confirm>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- push

export function PushPanel({ room, push, setPush, sendCommand, toast, sticks, connected }: { room: RoomView; push: { stickId: string; point: [number, number, number]; yaw: number } | null; setPush: (p: { stickId: string; point: [number, number, number]; yaw: number } | null) => void; sendCommand: (k: CommandKind, p: unknown) => string | null; toast: ToastFn; sticks: Map<string, StickInfo>; connected: boolean }) {
  const [error, setError] = useState<string | null>(null);
  useCommandResults((r) => {
    if (!r.kind.startsWith("push.")) return;
    if (r.outcome === "rejected") setError(r.message ?? "That didn't work.");
    else setError(null);
  });
  const mode = room.mode;
  return (
    <div>
      <h2>Push the structure</h2>
      <p className="small">Choose a stick, a point on it and a horizontal direction; one fixed, gentle push is applied. You choose where and which way, not how hard.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {mode === "build" && (
        <>
          <p className="small">Starting saves a protection point and pauses everyone's placing until you finish. Others can keep watching.</p>
          <button type="button" disabled={!connected || room.measuring} onClick={() => (setError(null), sendCommand("push.prepare", {}))}>
            {room.measuring ? "Wait for the structure to settle" : "Enter push mode"}
          </button>
        </>
      )}
      {mode === "push-selecting" && (
        <>
          {!push ? (
            <p>Click or tap the stick you want to push, at the point you want to push it.</p>
          ) : (
            <>
              <p>
                Pushing stick placed by {sticks.get(push.stickId)?.authorName ?? "someone"}. The red arrow shows the direction.
              </p>
              <p className="row wrap">
                <button type="button" onClick={() => setPush({ ...push, yaw: push.yaw - Math.PI / 12 })}>
                  Turn arrow left
                </button>
                <button type="button" onClick={() => setPush({ ...push, yaw: push.yaw + Math.PI / 12 })}>
                  Turn arrow right
                </button>
              </p>
              <button
                type="button"
                className="danger"
                onClick={() => sendCommand("push.confirm", { stickId: push.stickId, point: push.point, direction: [Math.cos(push.yaw), 0, Math.sin(push.yaw)] })}
              >
                Push
              </button>
            </>
          )}
          <p>
            <button type="button" onClick={() => (setPush(null), sendCommand("push.cancel", {}))}>
              Cancel push mode
            </button>
          </p>
        </>
      )}
      {mode === "push-running" && <p>Watching what happens…</p>}
      {mode === "push-review" && (
        <>
          <p>The structure has settled. Keep the result, or restore the protection point saved before the push (under Versions → Recovery points).</p>
          <button type="button" onClick={() => (sendCommand("push.keep", {}), toast("Kept."))}>
            Keep the result
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- work settings

export function SettingsPanel({ workId, room, isOwner, toast, onLeft }: { workId: string; room: RoomView; isOwner: boolean; toast: ToastFn; onLeft: () => void }) {
  const [title, setTitle] = useState(room.title);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const archived = room.mode === "archived" || room.liveReason === "ARCHIVED";
  if (!isOwner) {
    return (
      <div>
        <h2>Work</h2>
        <p>{room.title}</p>
        <p className="muted small">The owner manages the title, members, publishing and archiving.</p>
      </div>
    );
  }
  return (
    <div>
      <h2>Work</h2>
      {error && <p className="error-text" role="alert">{error}</p>}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("PATCH", `/api/works/${workId}`, { title });
            toast("Renamed.", "ok");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label htmlFor="work-title">Title</label>
        <input id="work-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
        <button type="submit">Rename</button>
      </form>
      <h3>Archive</h3>
      {archived ? (
        <button
          type="button"
          onClick={async () => {
            await api("POST", `/api/works/${workId}/archive`, { archived: false }).catch((e) => setError(e.message));
            location.reload();
          }}
        >
          Unarchive and continue building
        </button>
      ) : (
        <button type="button" onClick={() => setArchiving(true)}>
          Archive this work…
        </button>
      )}
      {archiving && (
        <Confirm
          title="Archive this work?"
          confirmLabel="Archive"
          onCancel={() => setArchiving(false)}
          onConfirm={async () => {
            try {
              await api("POST", `/api/works/${workId}/archive`, { archived: true });
              setArchiving(false);
              onLeft();
            } catch (e) {
              setError((e as Error).message);
              setArchiving(false);
            }
          }}
        >
          <p>Live editing ends and the work is hidden from your default list. Nothing is deleted, and you can unarchive it later.</p>
          <p>
            <strong>Archiving doesn't withdraw its exhibits.</strong> Public exhibits stay public until you withdraw them under Versions.
          </p>
        </Confirm>
      )}
    </div>
  );
}
