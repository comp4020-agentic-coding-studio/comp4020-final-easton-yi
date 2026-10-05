// Sign in, create an account, recover with a code, and rotate the code
// (AUTH-01, NAV-02). No email: the recovery code is the only way back
// without the password, and the page says so.
import { useState } from "react";
import { api } from "../api.ts";
import { navigate, returnTo } from "../router.ts";
import { logout, signedIn, useSession, type User } from "../session.ts";
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

export function AccountPage() {
  const { user } = useSession();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      <p>
        <button type="button" onClick={() => void logout().then(() => navigate("/"))}>
          Sign out
        </button>
      </p>
    </main>
  );
}
