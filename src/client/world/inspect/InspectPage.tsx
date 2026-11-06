// Development inspector page (brief §7.3, §13.1, Appendix C1.3). Reachable
// only at /world/inspect/ with the test flag (localStorage stillwood.test=1);
// no link from the ordinary interface. Shows one landmark's real generated
// asset or one catalogued component from it, with stage toggles, course
// selection, piece counts by stock and fixed review cameras.
import { useEffect, useMemo, useRef, useState } from "react";
import { parseManifest, type WorldManifest } from "../../../world/manifest.ts";
import { RECIPE_VERSION } from "../../../world/landmarks.ts";
import { STAGES } from "../../../world/core.ts";
import { InspectView, type Counts, type ReviewCamera } from "./InspectView.ts";
import { COMPONENTS, componentMatches } from "./catalogue.ts";

const BASE = "/world-data/";
const CAMERAS: ReviewCamera[] = ["plan", "front", "side", "45", "eye", "detail"];

export function InspectPage(): React.ReactElement {
  const enabled = useMemo(() => {
    try {
      return localStorage.getItem("stillwood.test") === "1";
    } catch {
      return false;
    }
  }, []);
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<InspectView | null>(null);
  const [manifest, setManifest] = useState<WorldManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(params.get("c") ? `c:${params.get("c")}` : `l:${params.get("l") ?? "L01"}`);
  const [stages, setStages] = useState<boolean[]>(STAGES.map(() => true));
  const [course, setCourse] = useState<number | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [cam, setCam] = useState<ReviewCamera>((params.get("view") as ReviewCamera | null) ?? "45");
  const [shells, setShells] = useState(params.get("shells") !== "0");

  const entry = target.startsWith("c:") ? COMPONENTS.find((c) => c.id === target.slice(2)) ?? null : null;
  const landmarkId = entry ? entry.landmark : target.slice(2);
  const lm = manifest?.landmarks.find((l) => l.id === landmarkId) ?? null;

  useEffect(() => {
    if (!enabled) return;
    fetch(`${BASE}manifest.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest: HTTP ${r.status}`))))
      .then((j) => setManifest(parseManifest(j, RECIPE_VERSION)))
      .catch((e: Error) => setError(e.message));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !host.current) return;
    const v = new InspectView(host.current);
    view.current = v;
    (window as unknown as Record<string, unknown>).__stillwoodInspect = { counts: () => v && counts, ready: () => loaded };
    return () => {
      v.dispose();
      view.current = null;
      delete (window as unknown as Record<string, unknown>).__stillwoodInspect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // fetch the landmark's detail asset when the landmark changes
  useEffect(() => {
    if (!lm || !view.current) return;
    let stale = false;
    setLoaded(null);
    fetch(`${BASE}${lm.asset.path}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${lm.asset.path}: HTTP ${r.status}`))))
      .then((buf) => {
        if (stale || !view.current) return;
        view.current.setAsset(buf);
        setCourse(null);
        setLoaded(lm.id);
      })
      .catch((e: Error) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [lm]);

  // apply the selection
  useEffect(() => {
    const v = view.current;
    if (!v || !lm || loaded !== lm.id) return;
    const comps = entry ? new Set(lm.components.map((n, i) => (componentMatches(entry, n) ? i : -1)).filter((i) => i >= 0)) : null;
    const c = v.select({ stages, course, components: comps });
    // shells belong to the whole building; a component selection shows timber only
    v.setShells(!entry && shells ? lm.shells : []);
    setCounts(c);
    v.view(cam);
    (window as unknown as { __stillwoodInspect?: Record<string, unknown> }).__stillwoodInspect = { counts: () => c, ready: () => `${lm.id}|${target}|${stages.join(",")}|${course}|${cam}` };
  }, [loaded, lm, entry, stages, course, cam, target, shells]);

  if (!enabled) {
    return (
      <main className="page">
        <h1>Not found</h1>
        <p>
          <a href="/">Go to the exhibition</a>
        </p>
      </main>
    );
  }

  const courseOptions = lm ? lm.courses.map((c, i) => ({ i, label: `${c[0]} · ${c[1]} · ${c[2]}` })) : [];
  return (
    <main className="inspect" aria-label="Development inspector">
      <div className="inspect-host" ref={host} />
      <aside className="inspect-panel">
        <h1>Inspector</h1>
        <p className="small muted">Development only. Real generated assets; counts are the pieces shown.</p>
        {error && <p className="notice error">{error}</p>}
        <label>
          Show{" "}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label="Components (§7.3)">
              {COMPONENTS.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>
                  {c.title} — {c.landmark}
                </option>
              ))}
            </optgroup>
            <optgroup label="Landmarks">
              {manifest?.landmarks.map((l) => (
                <option key={l.id} value={`l:${l.id}`}>
                  {l.id} {l.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {entry && <p className="small">{entry.note}</p>}
        <fieldset>
          <legend>Stages</legend>
          {STAGES.map((st, i) => (
            <label key={st} className="inspect-check">
              <input type="checkbox" checked={stages[i]} onChange={(e) => setStages(stages.map((v, k) => (k === i ? e.target.checked : v)))} /> {st}
            </label>
          ))}
        </fieldset>
        <label className="inspect-check">
          <input type="checkbox" checked={shells && !entry} disabled={!!entry} onChange={(e) => setShells(e.target.checked)} /> shading shells (whole building only)
        </label>
        <label>
          Course{" "}
          <select value={course ?? ""} onChange={(e) => setCourse(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">All courses</option>
            {courseOptions.map((o) => (
              <option key={o.i} value={o.i}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="inspect-cams" role="group" aria-label="Review camera">
          {CAMERAS.map((c) => (
            <button key={c} type="button" aria-pressed={cam === c} onClick={() => setCam(c)}>
              {c === "45" ? "45°" : c === "eye" ? "1.65 m eye" : c}
            </button>
          ))}
        </div>
        {counts && (
          <dl className="inspect-counts">
            <dt>Pieces shown</dt>
            <dd className="num">{counts.shown.toLocaleString("en")}</dd>
            <dt>B / M / D</dt>
            <dd className="num">
              {counts.B.toLocaleString("en")} / {counts.M.toLocaleString("en")} / {counts.D.toLocaleString("en")}
            </dd>
            {counts.bounds && (
              <>
                <dt>Size W × H × D (m)</dt>
                <dd className="num">
                  {(counts.bounds.max[0] - counts.bounds.min[0]).toFixed(1)} × {(counts.bounds.max[1] - counts.bounds.min[1]).toFixed(1)} × {(counts.bounds.max[2] - counts.bounds.min[2]).toFixed(1)}
                </dd>
              </>
            )}
          </dl>
        )}
        {lm && (
          <p className="small">
            {lm.title} · {lm.pieces.total.toLocaleString("en")} pieces in all · features: {lm.features.join(", ")}
          </p>
        )}
      </aside>
    </main>
  );
}
