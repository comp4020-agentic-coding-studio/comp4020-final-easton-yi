// `/exhibits/:id/`: a frozen public exhibit (SAVE-06). The same renderer as
// the workshop, but no physics, no editing and no live room: just the frozen
// geometry with independent orbiting.
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api.ts";
import { Viewport, webglAvailable } from "../scene/viewport.ts";
import { ViewControls } from "../workshop/Controls.tsx";
import { useSession } from "../session.ts";
import { signInLink } from "../router.ts";
import { formatDate } from "./Gallery.tsx";
import type { WireBody } from "../../shared/protocol.ts";

interface ExhibitData {
  id: string;
  title: string;
  description: string;
  attribution: string[];
  height: number;
  publishedAt: number;
  framing: { yaw: number; pitch: number; distance: number; targetY: number };
  geometry: {
    stick: { length: number; width: number; height: number };
    table: { radius: number; thickness: number; top: number };
    sticks: { p: number[]; q: number[]; seed: number; a: number }[];
  };
}

export function ExhibitPage({ exhibitId }: { exhibitId: string }) {
  const { user } = useSession();
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<Viewport | null>(null);
  const [data, setData] = useState<ExhibitData | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [fav, setFav] = useState<boolean | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [gl] = useState(webglAvailable);

  useEffect(() => {
    setError(null);
    api<ExhibitData>("GET", `/api/exhibits/${exhibitId}`)
      .then(setData)
      .catch((e: ApiError) => setError({ code: e.code, message: e.message }));
  }, [exhibitId, attempt]);

  useEffect(() => {
    if (!user) return setFav(null);
    api<{ favorite: boolean }>("GET", `/api/favorites/${exhibitId}`).then((r) => setFav(r.favorite)).catch(() => setFav(null));
  }, [user, exhibitId]);

  useEffect(() => {
    if (!data || !gl || !host.current) return;
    let v: Viewport;
    try {
      v = new Viewport(host.current, { dims: data.geometry.stick, table: data.geometry.table, mode: "exhibit" });
    } catch {
      return;
    }
    viewport.current = v;
    // Read-only probe for browser tests: opt-in per browser, never shown in the UI.
    try {
      if (localStorage.getItem("stillwood.test") === "1") (window as unknown as Record<string, unknown>).__stillwood = { framing: () => v.currentFraming(), stats: () => v.stats() };
    } catch {
      // storage unavailable: no probe
    }
    const bodies: WireBody[] = data.geometry.sticks.map((s, i) => [`s${i}`, s.p[0]!, s.p[1]!, s.p[2]!, s.q[0]!, s.q[1]!, s.q[2]!, s.q[3]!, 1]);
    v.setBodies(bodies, new Map(data.geometry.sticks.map((s, i) => [`s${i}`, s.seed])));
    v.frame(data.framing);
    return () => {
      v.dispose();
      viewport.current = null;
    };
  }, [data, gl]);

  if (error) {
    return (
      <main className="page narrow">
        <h1>{error.code === "WITHDRAWN" ? "Withdrawn" : error.code === "NOT_FOUND" ? "No such exhibit" : "Couldn't load this exhibit"}</h1>
        <p>{error.message}</p>
        {error.code !== "WITHDRAWN" && error.code !== "NOT_FOUND" && (
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        )}
        <p>
          <a href="/">Back to the exhibition</a>
        </p>
      </main>
    );
  }
  if (!data) return <main className="page" aria-busy="true"><p className="muted">Loading…</p></main>;

  const toggleFav = async (): Promise<void> => {
    setFavError(null);
    try {
      const r = await api<{ favorite: boolean }>(fav ? "DELETE" : "PUT", `/api/favorites/${exhibitId}`);
      setFav(r.favorite);
    } catch (e) {
      setFavError((e as Error).message);
    }
  };

  return (
    <main className="exhibit">
      <div className="exhibit-stage">
        {gl ? (
          <>
            <div className="scene-host" ref={host} />
            <ViewControls viewport={viewport} />
          </>
        ) : (
          <div className="notice error">
            <p>This browser can't show 3D (WebGL is unavailable). Here's a flat preview instead.</p>
            <img src={`/api/exhibits/${exhibitId}/thumbnail.svg`} alt={`Preview of ${data.title}`} />
          </div>
        )}
      </div>
      <section className="exhibit-info" aria-labelledby="ex-h">
        <p className="muted small">Exhibit · frozen on {formatDate(data.publishedAt)}</p>
        <h1 id="ex-h">{data.title}</h1>
        {data.description && <p className="description">{data.description}</p>}
        <p>
          By {data.attribution.join(", ") || "unknown"} · {data.geometry.sticks.length} {data.geometry.sticks.length === 1 ? "stick" : "sticks"} · stable structure height <span className="num">{data.height.toFixed(1)}</span> u
        </p>
        <p className="muted small">Orbit freely; nothing here moves or can be edited. The work it came from may have changed since.</p>
        {user ? (
          fav !== null && (
            <button type="button" aria-pressed={fav} onClick={() => void toggleFav()}>
              {fav ? "★ In your favorites" : "☆ Add to favorites"}
            </button>
          )
        ) : (
          <p className="small">
            <a href={signInLink("login")}>Sign in</a> to keep favorites.
          </p>
        )}
        {favError && <p className="error-text" role="alert">{favError}</p>}
      </section>
    </main>
  );
}
