// The signed-in account, from the server's session (an HttpOnly cookie);
// nothing about identity is kept in browser storage.
import { useSyncExternalStore } from "react";
import { api, setCsrf } from "./api.ts";

export interface User {
  id: string;
  handle: string;
  displayName: string;
}

interface State {
  loaded: boolean;
  user: User | null;
  error: string | null;
}

let state: State = { loaded: false, user: null, error: null };
const listeners = new Set<() => void>();
const set = (s: Partial<State>): void => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

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
    setCsrf("");
    set({ user: null });
    window.dispatchEvent(new CustomEvent("stillwood:logout"));
  }
}

export const useSession = (): State =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
  );
