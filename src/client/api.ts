// Same-origin JSON API with the session's CSRF token. Errors carry the
// server's stable code so the UI can say what actually happened.
export class ApiError extends Error {
  code: string;
  status: number;
  retryAfterMs?: number;
  constructor(status: number, code: string, message: string, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

let csrf = "";
export const setCsrf = (token: string): void => {
  csrf = token;
};
export const getCsrf = (): string => csrf;

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && csrf) headers["x-csrf-token"] = csrf;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't reach the server. Check your connection and try again.");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data?.error ?? data;
    throw new ApiError(res.status, e?.code ?? "HTTP_" + res.status, e?.message || `Request failed (${res.status}).`, e?.retryAfterMs);
  }
  return data as T;
}
