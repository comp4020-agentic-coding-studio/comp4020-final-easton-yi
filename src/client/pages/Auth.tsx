// Sign in, create an account, recover with a code, rotate the code, and delete
// the account (AUTH-01, NAV-02, ADR-0007). No email: the recovery code is the
// only way back without the password, and the page says so.
import { useEffect, useRef, useState } from "react";
import { api, type ApiError } from "../api.ts";
import { navigate, returnTo } from "../router.ts";
import { accountDeleted, logout, signedIn, useSession, type User } from "../session.ts";
import { AUTH } from "../../shared/config.ts";

function RecoveryCode({ code, onDone, doneLabel }: { code: string; onDone: () => void; doneLabel: string }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section className="recovery" aria-labelledby="rc-h">
      <h2 id="rc-h">Your recovery code</h2>
      <p>
        If you forget your password, this code is the <strong>only</strong> way back into your account. There's no email reset. It's
        shown once and works once; after using it you'll get a new one.
      </p>
      <p className="code" tabIndex={0} aria-label="Recovery code">
        {code}
      </p>
      <p className="actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </p>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I've stored this code somewhere safe
      </label>
      <p className="actions">
        <button type="button" className="primary" disabled={!saved} onClick={onDone}>
          {doneLabel}
        </button>
      </p>
    </section>
  );
}

export function AuthPage({ kind }: { kind: "login" | "register" | "recover" }) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const next = returnTo();
  const nextQ = `?next=${encodeURIComponent(next)}`;

  if (newCode) {
    return (
      <main className="page narrow">
        <h1>{kind === "register" ? "Account created" : "Password changed"}</h1>
        <RecoveryCode code={newCode} onDone={() => navigate(next, true)} doneLabel="Continue" />
      </main>
    );
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === "register") {
        const r = await api<{ user: User; csrf: string; recoveryCode: string }>("POST", "/api/auth/register", { handle, displayName, password });
        signedIn(r.user, r.csrf);
        setNewCode(r.recoveryCode);
      } else if (kind === "login") {
        const r = await api<{ user: User; csrf: string }>("POST", "/api/auth/login", { handle, password });
        signedIn(r.user, r.csrf);
        navigate(next, true);
      } else {
        const r = await api<{ csrf: string; recoveryCode: string }>("POST", "/api/auth/recover", { handle, recoveryCode: code, newPassword: password });
        const s = await api<{ user: User; csrf: string }>("GET", "/api/session");
        signedIn(s.user, r.csrf);
        setNewCode(r.recoveryCode);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = { login: "Sign in", register: "Create an account", recover: "Recover your account" }[kind];
  return (
    <main className="page narrow">
      <h1>{title}</h1>
      {kind === "register" && <p>An account lets you save works, come back to them, join friends' works and keep favorites.</p>}
      {kind === "recover" && <p>Enter your handle, the recovery code you saved, and a new password. All your other sign-ins will end.</p>}
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate={false}>
        <label htmlFor="handle">Handle</label>
        <input
          id="handle"
          autoComplete="username"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          pattern="[A-Za-z0-9_]{3,24}"
          required
          aria-describedby={kind === "register" ? "handle-help" : undefined}
        />
        {kind === "register" && (
          <p id="handle-help" className="muted small">
            3–24 letters, digits or underscores. Used to sign in; it isn't shown publicly.
          </p>
        )}
        {kind === "register" && (
          <>
            <label htmlFor="display">Display name</label>
            <input id="display" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required aria-describedby="display-help" />
            <p id="display-help" className="muted small">
              Shown to collaborators and on exhibits you contribute to.
            </p>
          </>
        )}
        {kind === "recover" && (
          <>
            <label htmlFor="code">Recovery code</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} required />
          </>
        )}
        <label htmlFor="password">{kind === "recover" ? "New password" : "Password"}</label>
        <input
          id="password"
          type="password"
          autoComplete={kind === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={kind === "login" ? undefined : AUTH.passwordMin}
          maxLength={AUTH.passwordMax}
          required
          aria-describedby={kind !== "login" ? "pw-help" : undefined}
        />
        {kind !== "login" && (
          <p id="pw-help" className="muted small">
            At least {AUTH.passwordMin} characters. A password manager is welcome.
          </p>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Working…" : title}
        </button>
      </form>
      <p className="muted">
        {kind !== "login" && <a href={`/login/${nextQ}`}>Sign in instead</a>}
        {kind === "login" && (
          <>
            <a href={`/register/${nextQ}`}>Create an account</a> · <a href={`/recover/${nextQ}`}>Forgot your password?</a>
          </>
        )}
      </p>
    </main>
  );
}

/** Answers that prove the server deleted nothing: refused before the transaction, or rolled back. */
const NOTHING_DELETED = new Set(["BAD_CREDENTIALS", "UNAUTHENTICATED", "CSRF", "ORIGIN", "RATE_LIMITED", "BUSY", "SAVE_FAILED", "BAD_REQUEST"]);

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; password?: boolean } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [check, setCheck] = useState<string | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.showModal();
    field.current?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  const cancel = (): void => {
    if (inFlight.current) return;
    setPassword("");
    onClose();
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (inFlight.current || !password) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    setCheck(null);
    try {
      await api("POST", "/api/account/delete", { password });
      setPassword("");
      accountDeleted("Your account and everything it owned have been deleted.");
      return;
    } catch (err) {
      const { code, message } = err as ApiError;
      setPassword("");
      if (code === "UNAUTHENTICATED") {
        setError({ text: "You're signed out, so this request couldn't delete anything. If you'd already sent it once, that earlier request may have finished: sign in to check." });
      } else if (NOTHING_DELETED.has(code)) {
        setError({ text: /nothing was deleted/i.test(message) ? message : `${message} Nothing was deleted.`, password: code === "BAD_CREDENTIALS" });
      } else {
        // A lost answer says nothing about the database: it may have committed.
        setUnconfirmed(true);
      }
    }
    inFlight.current = false;
    setBusy(false);
    field.current?.focus();
  };

  const checkAccount = async (): Promise<void> => {
    setCheck("Checking…");
    try {
      const s = await api<{ user: User | null }>("GET", "/api/session");
      setCheck(s.user ? "Your account still exists, so nothing was deleted. You can try again." : "You're signed out here. If you can't sign in again, the deletion went through.");
    } catch {
      setCheck("Still couldn't reach the server. Check your connection and try again.");
    }
  };

  const described = ["delete-pw-help", error && "delete-error"].filter(Boolean).join(" ");
  return (
    <dialog ref={ref} className="confirm" aria-labelledby="delete-h" aria-describedby="delete-what" onCancel={(e) => (e.preventDefault(), cancel())}>
      <h2 id="delete-h">Permanently delete your account?</h2>
      <div id="delete-what">
        <p>This can't be undone. It deletes:</p>
        <ul>
          <li>your account, password and recovery code, and signs you out on every device;</li>
          <li>every work you own, whether active, archived or in your trash, with all its saved versions and recovery points;</li>
          <li>every exhibit from those works, published or withdrawn. Collaborators lose access to those works, and the exhibits leave other people's favorites.</li>
        </ul>
        <p>
          Works you collaborate on but don't own stay with their owners. You're removed as a member; sticks you placed there stay in the structure, labelled “Deleted user”, and your name is
          removed from their versions and exhibits.
        </p>
        <p className="small muted">
          Stillwood's live data goes at once. Copies someone already downloaded can't be recalled, and the server's backups and hosting logs aren't rewritten: they keep older copies until they
          expire.
        </p>
      </div>
      <form onSubmit={(e) => void submit(e)}>
        <label htmlFor="delete-password">Current password</label>
        <input
          id="delete-password"
          ref={field}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={AUTH.passwordMax}
          readOnly={busy}
          required
          aria-invalid={error?.password ? true : undefined}
          aria-describedby={described}
        />
        <p id="delete-pw-help" className="muted small">
          Forgotten it? <a href="/recover/">Recover your account</a> with your recovery code first.
        </p>
        {error && (
          <p id="delete-error" className="error-text" role="alert">
            {error.text}
          </p>
        )}
        {unconfirmed && (
          <div className="notice error" role="alert">
            <p>We couldn't confirm what happened: the answer from the server didn't arrive. Your account may or may not have been deleted.</p>
            <p>
              <button type="button" onClick={() => void checkAccount()}>
                Check my account
              </button>
            </p>
            {check && <p role="status">{check}</p>}
          </div>
        )}
        <p className="actions">
          <button type="button" onClick={cancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={busy || !password}>
            {busy ? "Deleting…" : "Permanently delete account"}
          </button>
        </p>
      </form>
    </dialog>
  );
}

export function AccountPage() {
  const { user } = useSession();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!user) {
    return (
      <main className="page narrow">
        <h1>Account</h1>
        <p>
          <a href="/login/?next=/account/">Sign in</a> to manage your account.
        </p>
      </main>
    );
  }
  return (
    <main className="page narrow">
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user.displayName}</strong> (handle <code>{user.handle}</code>).
      </p>
      {code ? (
        <RecoveryCode code={code} onDone={() => setCode(null)} doneLabel="Done" />
      ) : (
        <section aria-labelledby="rot-h">
          <h2 id="rot-h">Recovery code</h2>
          <p>Lost your recovery code, or think someone saw it? Make a new one. The old code stops working immediately.</p>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                setCode((await api<{ recoveryCode: string }>("POST", "/api/auth/recovery-code")).recoveryCode);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Make a new recovery code
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="del-h">
        <h2 id="del-h">Delete account</h2>
        <p>
          Permanently deletes your account, your sign-in and recovery credentials, and every work and exhibit you own. Collaborators lose access to those works. This can't be undone.
        </p>
        <button type="button" className="danger" onClick={() => setDeleting(true)}>
          Delete account
        </button>
      </section>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
      <p>
        <button type="button" onClick={() => void logout().then(() => navigate("/"))}>
          Sign out
        </button>
      </p>
    </main>
  );
}
