// A tiny history router for the brief's page paths (NAV-01).
import { useEffect, useState } from "react";

const listeners = new Set<() => void>();
/** How the current page was reached: a fresh load, a link (push/replace) or Back/Forward (pop). */
export type NavigationKind = "initial" | "push" | "replace" | "pop";
let lastNavigation: NavigationKind = "initial";
export const navigationKind = (): NavigationKind => lastNavigation;
export const navigate = (to: string, replace = false): void => {
  lastNavigation = replace ? "replace" : "push";
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
};
window.addEventListener("popstate", () => {
  lastNavigation = "pop";
  listeners.forEach((l) => l());
});

/**
 * An optional check before an in-app action leaves the current page (Return to world): the page that owns
 * unsaved state (the workshop's unplaced stick) registers a function that explains what would be lost, or
 * returns null when leaving is safe. One guard at a time; the app's ordinary links are unchanged.
 */
let leaveGuard: (() => string | null) | null = null;
export const setLeaveGuard = (guard: () => string | null): (() => void) => {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
};
export const leaveWarning = (): string | null => {
  try {
    return leaveGuard?.() ?? null;
  } catch {
    return null;
  }
};

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
