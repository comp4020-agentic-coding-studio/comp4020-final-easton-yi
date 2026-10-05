// Owner lifecycle actions shared by My works, Trash and the workshop's Work
// panel (SAVE-10..SAVE-12). Lists update only after the server confirms; the
// server re-checks ownership, trashed state and the typed title.
import { useState } from "react";
import { api } from "./api.ts";
import { Confirm } from "./workshop/Panels.tsx";

export const AUTHORITY_TEXT =
  "The owner has final say over this work: they publish and withdraw exhibits, archive it, move it to the trash, restore it, and can delete it permanently, which removes it for every collaborator. Editors build, save versions and can leave at any time.";

export const plural = (n: number, one: string, many = one + "s"): string => `${n} ${n === 1 ? one : many}`;

export function TrashDialog({ work, onDone, onCancel }: { work: { id: string; title: string; editorCount: number; publicExhibits: number }; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Confirm
      title={`Move “${work.title}” to the trash?`}
      confirmLabel={busy ? "Moving…" : "Move to trash"}
      danger
      confirmDisabled={busy}
      onCancel={onCancel}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await api("POST", `/api/works/${work.id}/trash`);
          onDone();
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <ul>
        <li>
          {work.editorCount === 0 ? "No collaborators are affected; you're the only member." : `${plural(work.editorCount, "collaborator")} will lose access to the workshop while it's in the trash.`}
        </li>
        <li>Live building stops now, even if the structure is still moving. Its latest state is saved first.</li>
        <li>
          {work.publicExhibits === 0 ? "It has no public exhibits." : `${plural(work.publicExhibits, "public exhibit")} will be withdrawn.`} Restoring the work doesn't republish them; you can republish each one yourself afterwards.
        </li>
        <li>Pending editing invitations are revoked.</li>
        <li>Its building content stays recoverable: you can restore it from Trash until you delete it permanently. Nothing in the trash is removed automatically, and it still counts toward your work limit.</li>
      </ul>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Confirm>
  );
}

export function PurgeDialog({ work, onDone, onCancel }: { work: { id: string; title: string; editorCount: number; exhibitCount: number; versionCount: number }; onDone: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Confirm
      title={`Delete “${work.title}” permanently?`}
      confirmLabel={busy ? "Deleting…" : "Delete permanently"}
      danger
      confirmDisabled={busy || typed !== work.title}
      onCancel={onCancel}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await api("POST", `/api/works/${work.id}/delete-permanently`, { title: typed });
          onDone();
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <p>
        This removes the work's building state, {plural(work.versionCount, "saved version")} and {plural(work.exhibitCount, "exhibit")} from Stillwood. It affects{" "}
        {work.editorCount === 0 ? "only you" : `you and ${plural(work.editorCount, "collaborator")}`}. <strong>It can't be restored from the trash.</strong>
      </p>
      <p className="small muted">Collaborators' accounts and their other works are not affected. Copies someone already downloaded, and the server's own backups or logs, aren't recalled by this.</p>
      <label htmlFor="purge-title">
        Type the title <strong>{work.title}</strong> to confirm
      </label>
      <input id="purge-title" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Confirm>
  );
}
