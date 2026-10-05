// A tiny history router for the brief's page paths (NAV-01).
import { useEffect, useState } from "react";

const listeners = new Set<() => void>();
export const navigate = (to: string, replace = false): void => {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
};
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export const usePath = (): string => {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const l = (): void => setPath(location.pathname);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return path;
};

/** Intercept same-origin <a> clicks so links stay real links. */
export const onLinkClick = (e: React.MouseEvent<HTMLElement>): void => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a || a.target || a.hasAttribute("download") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/readme") || url.pathname.startsWith("/api/")) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
};

/** Where to come back to after sign-in (NAV-02). */
export const returnTo = (): string => {
  const p = new URLSearchParams(location.search).get("next");
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/works/";
};
export const signInLink = (kind: "login" | "register", next = location.pathname + location.hash): string =>
  `/${kind}/?next=${encodeURIComponent(next)}`;
