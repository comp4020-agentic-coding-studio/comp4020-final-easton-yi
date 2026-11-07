// A tiny history router for the brief's page paths (NAV-01).
import { useEffect, useState } from "react";

const listeners = new Set<() => void>();
/** How the current page was reached: a fresh load, a link (push/replace) or Back/Forward (pop). */
export type NavigationKind = "initial" | "push" | "replace" | "pop";
let lastNavigation: NavigationKind = "initial";
export const navigationKind = (): NavigationKind => lastNavigation;
const hashTarget = (hash: string): HTMLElement | null => {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null; // a malformed escape in the hash: no target, so the page starts at the top as before
  }
};
/**
 * Go to an in-app URL. The router owns the scroll for every in-app navigation: a new page starts at the top, and a
 * hash on the current page (same path and query, e.g. the home page's "View player works" → /#exhibits-h) scrolls
 * its target into view instead, smoothly unless the person prefers reduced motion. Following a link to the URL that
 * is already current replaces the history entry rather than adding a duplicate, as a native anchor does.
 */
export const navigate = (to: string, replace = false): void => {
  const next = new URL(to, location.href);
  const samePage = next.pathname === location.pathname && next.search === location.search;
  const target = samePage && next.hash ? hashTarget(next.hash) : null;
  const useReplace = replace || next.href === location.href;
  lastNavigation = useReplace ? "replace" : "push";
  if (useReplace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  if (target) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  else window.scrollTo(0, 0);
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
