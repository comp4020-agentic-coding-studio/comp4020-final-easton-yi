// The signed-in account, from the server's session (an HttpOnly cookie);
// nothing about identity is kept in browser storage.
import { useSyncExternalStore } from "react";
import { api, setCsrf } from "./api.ts";
import { navigate } from "./router.ts";

export interface User {
  id: string;
  handle: string;
  displayName: string;
}

interface State {
  loaded: boolean;
  user: User | null;
  error: string | null;
  /** One status line, shown once on the page the app moved to. */
  notice: { text: string; path: string } | null;
}

let state: State = { loaded: false, user: null, error: null, notice: null };
const listeners = new Set<() => void>();
const set = (s: Partial<State>): void => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

// Tabs of one browser share the cookie, so they learn at once when it stops
// working. Other browsers and devices learn from the server (ADR-0007).
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("stillwood.session");

const forget = (): void => {
  setCsrf("");
  set({ user: null });
  window.dispatchEvent(new CustomEvent("stillwood:logout"));
};

export const showNotice = (text: string, path: string): void => set({ notice: { text, path } });
export const clearNotice = (): void => {
  if (state.notice) set({ notice: null });
};

const ACCOUNT_DELETED_NOTICE = "This account was deleted, so you've been signed out.";

channel?.addEventListener("message", (e: MessageEvent<{ type?: string; reason?: string }>) => {
  if (e.data?.type !== "signed-out" || !state.user) return;
  forget();
  if (e.data.reason === "deleted") {
    showNotice(ACCOUNT_DELETED_NOTICE, "/");
    navigate("/", true);
  }
});

export async function loadSession(): Promise<void> {
  try {
    const r = await api<{ user: User | null; csrf?: string }>("GET", "/api/session");
    setCsrf(r.csrf ?? "");
    set({ loaded: true, user: r.user, error: null });
  } catch (e) {
    set({ loaded: true, error: (e as Error).message });
  }
}

export const signedIn = (user: User, csrf: string): void => {
  setCsrf(csrf);
  set({ user, loaded: true, error: null });
};

export async function logout(): Promise<void> {
  try {
    await api("POST", "/api/auth/logout");
  } finally {
    forget();
    channel?.postMessage({ type: "signed-out", reason: "logout" });
  }
}

/**
 * The account no longer exists. Forget it here and in this browser's other
 * tabs, then go to the public start page without leaving the old page in
 * history. Device preferences (sound, graphics) aren't the account's, so they stay.
 */
export function accountDeleted(text = ACCOUNT_DELETED_NOTICE): void {
  forget();
  channel?.postMessage({ type: "signed-out", reason: "deleted" });
  showNotice(text, "/");
  navigate("/", true);
}

export const useSession = (): State =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
  );
