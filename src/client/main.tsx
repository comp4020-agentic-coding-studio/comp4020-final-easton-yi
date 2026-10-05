import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { onLinkClick, usePath } from "./router.ts";
import { loadSession, logout, useSession } from "./session.ts";
import { Gallery } from "./pages/Gallery.tsx";
import { Works } from "./pages/Works.tsx";
import { Favorites } from "./pages/Favorites.tsx";
import { AuthPage, AccountPage } from "./pages/Auth.tsx";
import { Join } from "./pages/Join.tsx";
import { ExhibitPage } from "./pages/Exhibit.tsx";
import { Workshop } from "./workshop/Workshop.tsx";

const UUID = "[0-9a-f-]{36}";

function Header({ compact }: { compact?: boolean }) {
  const { user } = useSession();
  return (
    <header className={`site-header${compact ? " compact" : ""}`}>
      <a className="brand" href="/">
        <span aria-hidden="true" className="brand-mark" />
        Stillwood
      </a>
      <nav aria-label="Main">
        <a href="/">Exhibition</a>
        {user && <a href="/works/">My works</a>}
        {user && <a href="/favorites/">Favorites</a>}
        <a href="/readme/">About</a>
        {user ? (
          <>
            <a href="/account/" className="who">
              {user.displayName}
            </a>
            <button type="button" className="link" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <a href={`/login/?next=${encodeURIComponent(location.pathname)}`}>Sign in</a>
        )}
      </nav>
    </header>
  );
}

function NotFound() {
  return (
    <main className="page narrow">
      <h1>Nothing here</h1>
      <p>This page doesn't exist, or it's private.</p>
      <p>
        <a href="/">Go to the exhibition</a>
      </p>
    </main>
  );
}

function App() {
  const path = usePath();
  const { loaded } = useSession();
  useEffect(() => {
    void loadSession();
  }, []);
  let page: React.ReactNode;
  let compact = false;
  let m: RegExpMatchArray | null;
  if (!loaded) page = <main className="page" aria-busy="true" />;
  else if (path === "/") page = <Gallery />;
  else if (path === "/works/") page = <Works />;
  else if ((m = path.match(new RegExp(`^/works/(${UUID})/$`)))) {
    compact = true;
    page = <Workshop key={m[1]} workId={m[1]!} />;
  } else if ((m = path.match(new RegExp(`^/exhibits/(${UUID})/$`)))) {
    compact = true;
    page = <ExhibitPage key={m[1]} exhibitId={m[1]!} />;
  } else if (path === "/favorites/") page = <Favorites />;
  else if (path === "/login/") page = <AuthPage kind="login" />;
  else if (path === "/register/") page = <AuthPage kind="register" />;
  else if (path === "/recover/") page = <AuthPage kind="recover" />;
  else if (path === "/account/") page = <AccountPage />;
  else if (path === "/join/") page = <Join />;
  else page = <NotFound />;
  return (
    <div className={`app${compact ? " app-full" : ""}`} onClick={onLinkClick}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header compact={compact} />
      <div id="main" tabIndex={-1} className="app-body">
        {page}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
