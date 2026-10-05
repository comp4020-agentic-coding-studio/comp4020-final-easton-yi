// `/join/#token=…`: preview an editing invitation, then accept it explicitly
// (AUTH-03). The token stays in the fragment and is sent only in a POST body.
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { navigate, signInLink } from "../router.ts";
import { useSession } from "../session.ts";
import { AUTHORITY_TEXT } from "../lifecycle.tsx";

export function Join() {
  const { user } = useSession();
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  const [preview, setPreview] = useState<{ workTitle: string; inviterName: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This link is missing its invitation code. Ask the owner to send it again.");
      return;
    }
    api("POST", "/api/invites/preview", { token })
      .then(setPreview)
      .catch((e) => setError(e.message));
  }, [token]);

  const accept = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ workId: string }>("POST", "/api/invites/accept", { token });
      navigate(`/works/${r.workId}/`, true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page narrow">
      <h1>Invitation</h1>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!error && !preview && <p className="muted">Checking the invitation…</p>}
      {preview && (
        <>
          <p>
            <strong>{preview.inviterName}</strong> invited you to build <strong>“{preview.workTitle}”</strong> with them.
          </p>
          <p className="muted small">As an editor you can place sticks, save versions and see the work's history. The link expires {new Date(preview.expiresAt).toLocaleString()}.</p>
          <div className="notice">
            <p className="small">
              <strong>{preview.inviterName} owns this work.</strong> {AUTHORITY_TEXT} What you build stays part of the shared work, so it goes wherever the owner takes it.
            </p>
          </div>
          {user ? (
            <p className="actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void accept()}>
                Join as {user.displayName}
              </button>
              <a className="button" href="/works/">
                Not now
              </a>
            </p>
          ) : (
            <>
              <p>Create an account to save and come back. You'll return here to confirm joining.</p>
              <p className="actions">
                <a className="button primary" href={signInLink("register", "/join/" + location.hash)}>
                  Create an account
                </a>
                <a className="button" href={signInLink("login", "/join/" + location.hash)}>
                  Sign in
                </a>
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
