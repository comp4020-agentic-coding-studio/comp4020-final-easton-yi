// DOM controls that mirror every placement and camera gesture, so building
// never requires the canvas, a mouse or right-click (ACCESS-01, LOOK-02).
import { useMemo, useRef, useState, type RefObject } from "react";
import type { Viewport } from "../scene/viewport.ts";
import { PERSON_SHAPES } from "../scene/viewport.ts";
import { setQualityMode, useGraphicsQuality } from "../graphics-setting.ts";
import { parseQualityMode, type QualityTier } from "../scene/quality.ts";
import type { Draft, Pivot } from "../placement-math.ts";
import type { RemoteDraft, StickInfo } from "../../shared/protocol.ts";

const R2D = 180 / Math.PI;
const fmt = (x: number, d = 2): string => (Math.abs(x) < 0.005 ? 0 : x).toFixed(d);

interface Actions {
  move: (dx: number, dz: number) => void;
  height: (dy: number) => void;
  yaw: (s: number) => void;
  pitch: (s: number) => void;
  roll: (s: number) => void;
  horizontal: () => void;
  vertical: () => void;
  snap: () => void;
  setPose: (c: [number, number, number], yaw: number, pitch: number, roll: number) => void;
}

function Stepper({ label, value, unit, onStep, disabled, hint }: { label: string; value: string; unit: string; onStep: (s: number) => void; disabled: boolean; hint?: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="stepper-label">{label}</span>
      <button type="button" onClick={() => onStep(-1)} disabled={disabled} aria-label={`${label} decrease`} title={hint ? `${hint} −` : undefined}>
        −
      </button>
      <output className="num" aria-live="off">
        {value}
        <span className="unit">{unit}</span>
      </output>
      <button type="button" onClick={() => onStep(1)} disabled={disabled} aria-label={`${label} increase`} title={hint ? `${hint} +` : undefined}>
        +
      </button>
    </div>
  );
}

export function AdjustPanel(props: {
  draft: Draft;
  pivot: Pivot;
  setPivot: (p: Pivot) => void;
  fine: boolean;
  setFine: (f: boolean) => void;
  snapping: boolean;
  setSnapping: (s: boolean) => void;
  actions: Actions;
  disabled: boolean;
  yawPitchRoll: { yaw: number; pitch: number; roll: number };
}) {
  const { draft, actions, disabled } = props;
  const [open, setOpen] = useState(true);
  const [exact, setExact] = useState(false);
  const c = draft.center;
  return (
    <section className={`adjust${open ? "" : " collapsed"}`} aria-labelledby="adjust-h">
      <div className="adjust-head">
        <h2 id="adjust-h">Adjust stick</h2>
        <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <>
          <fieldset className="pivot">
            <legend>Turn around</legend>
            {(["center", "A", "B"] as const).map((p) => (
              <label key={p} className="chip">
                <input type="radio" name="pivot" checked={props.pivot === p} onChange={() => props.setPivot(p)} />
                {p === "center" ? "Centre" : `End ${p}`}
              </label>
            ))}
          </fieldset>
          <div className="steppers">
            <Stepper label="Left / right (X)" value={fmt(c[0])} unit="u" onStep={(s) => actions.move(s, 0)} disabled={disabled} hint="← →" />
            <Stepper label="Back / front (Z)" value={fmt(c[2])} unit="u" onStep={(s) => actions.move(0, s)} disabled={disabled} hint="↑ ↓" />
            <Stepper label="Height" value={fmt(c[1])} unit="u" onStep={actions.height} disabled={disabled} hint="PgUp PgDn" />
            <Stepper label="Direction" value={fmt(props.draft.yaw * R2D, 0)} unit="°" onStep={actions.yaw} disabled={disabled} hint="Q E" />
            <Stepper label="Tilt" value={fmt(props.draft.pitch * R2D, 0)} unit="°" onStep={actions.pitch} disabled={disabled} hint="R F" />
            <Stepper label="Roll" value={fmt(props.draft.roll * R2D, 0)} unit="°" onStep={actions.roll} disabled={disabled} />
          </div>
          <div className="row wrap">
            <button type="button" onClick={actions.horizontal} disabled={disabled} title="H">
              Horizontal
            </button>
            <button type="button" onClick={actions.vertical} disabled={disabled} title="V">
              Vertical
            </button>
            <button type="button" onClick={actions.snap} disabled={disabled} title="G">
              Snap to support
            </button>
          </div>
          <div className="row wrap">
            <label className="check">
              <input type="checkbox" checked={props.fine} onChange={(e) => props.setFine(e.target.checked)} /> Fine steps
            </label>
            <label className="check">
              <input type="checkbox" checked={props.snapping} onChange={(e) => props.setSnapping(e.target.checked)} /> Angle snapping
            </label>
            <button type="button" className="link" onClick={() => setExact(!exact)} aria-expanded={exact}>
              Exact values
            </button>
          </div>
          {exact && <ExactPose draft={draft} disabled={disabled} onApply={actions.setPose} />}
          <p className="muted small">
            Drag the ghost's middle to slide it, the blue arrows to raise it, a green ball to swing that end around the other, and a brown cone to
            tilt it. Hold Shift with the keys for small steps.
          </p>
        </>
      )}
    </section>
  );
}

function ExactPose({ draft, disabled, onApply }: { draft: Draft; disabled: boolean; onApply: Actions["setPose"] }) {
  const [v, setV] = useState(() => ({
    x: fmt(draft.center[0]),
    y: fmt(draft.center[1]),
    z: fmt(draft.center[2]),
    yaw: fmt(draft.yaw * R2D, 1),
    pitch: fmt(draft.pitch * R2D, 1),
    roll: fmt(draft.roll * R2D, 1),
  }));
  const field = (k: keyof typeof v, label: string) => (
    <label>
      {label}
      <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </label>
  );
  const nums = Object.values(v).map(Number);
  const ok = nums.every(Number.isFinite);
  return (
    <form
      className="exact"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onApply([+v.x, +v.y, +v.z], +v.yaw, +v.pitch, +v.roll);
      }}
    >
      {field("x", "X")}
      {field("y", "Height")}
      {field("z", "Z")}
      {field("yaw", "Direction °")}
      {field("pitch", "Tilt °")}
      {field("roll", "Roll °")}
      <button type="submit" disabled={disabled || !ok}>
        Apply
      </button>
    </form>
  );
}

export function ViewControls({ viewport }: { viewport: RefObject<Viewport | null> }) {
  const v = (): Viewport | null => viewport.current;
  const [qualityOpen, setQualityOpen] = useState(false);
  const qualityButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="view-controls" role="toolbar" aria-label="View">
        <button type="button" onClick={() => v()?.setView("default")} title="Default view">
          Default
        </button>
        <button type="button" onClick={() => v()?.setView("top")}>Top</button>
        <button type="button" onClick={() => v()?.setView("side")}>Side</button>
        <button type="button" onClick={() => v()?.fitAll()}>Fit all</button>
        <button type="button" onClick={() => v()?.zoom(0.8)} aria-label="Zoom in">
          Zoom +
        </button>
        <button type="button" onClick={() => v()?.zoom(1.25)} aria-label="Zoom out">
          Zoom −
        </button>
        <button type="button" onClick={() => v()?.raiseTarget(2)} aria-label="Raise view target">
          Look higher
        </button>
        <button type="button" onClick={() => v()?.raiseTarget(-2)} aria-label="Lower view target">
          Look lower
        </button>
        <button ref={qualityButton} type="button" aria-expanded={qualityOpen} aria-controls="quality-panel" onClick={() => setQualityOpen(!qualityOpen)}>
          Graphics
        </button>
      </div>
      {qualityOpen && (
        <GraphicsQuality
          onClose={() => {
            setQualityOpen(false);
            qualityButton.current?.focus();
          }}
        />
      )}
    </>
  );
}

const TIER_LABEL: Record<QualityTier, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Per-device graphics quality (LOOK-04). Opened from the view toolbar, but a
 * sibling of it: the toolbar scrolls sideways on phones and would clip it.
 */
function GraphicsQuality({ onClose }: { onClose: () => void }) {
  const { mode, applied } = useGraphicsQuality();
  return (
    <div
      id="quality-panel"
      className="quality-panel"
      role="group"
      aria-label="Graphics"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // don't also cancel a held stick
        onClose();
      }}
    >
      <label htmlFor="quality-mode">Graphics quality</label>
      <select id="quality-mode" value={mode} aria-describedby="quality-help" onChange={(e) => setQualityMode(parseQualityMode(e.target.value) ?? "auto")}>
        <option value="auto">Auto (recommended)</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <p id="quality-help" className="muted small">
        Auto balances detail and smoothness. This setting only affects this device.
      </p>
      {mode === "auto" && applied && <p className="small quality-current">Currently: {TIER_LABEL[applied]}</p>}
    </div>
  );
}

/** A searchable, paginated list instead of 200 tab stops (ACCESS-01). */
export function StickList({ sticks, selected, onSelect, remote }: { sticks: StickInfo[]; selected: string | null; onSelect: (id: string) => void; remote: RemoteDraft[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const ordered = useMemo(() => [...sticks].sort((a, b) => a.placedAt - b.placedAt), [sticks]);
  const filtered = ordered
    .map((s, i) => ({ ...s, n: i + 1 }))
    .filter((s) => !q || s.authorName.toLowerCase().includes(q.toLowerCase()) || String(s.n) === q.trim());
  const per = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / per));
  const shown = filtered.slice(page * per, page * per + per);
  return (
    <div>
      <h2>Sticks ({sticks.length})</h2>
      {remote.length > 0 && (
        <p className="muted small">
          Being held now: {remote.map((r) => `${PERSON_SHAPES[r.color % PERSON_SHAPES.length]} ${r.displayName}`).join(", ")} (ghosts aren't real sticks yet)
        </p>
      )}
      <label htmlFor="stick-q">Find by number or by who placed it</label>
      <input id="stick-q" type="search" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
      {filtered.length === 0 ? (
        <p className="muted">{sticks.length ? "No match." : "No sticks yet. Use Add to hold one."}</p>
      ) : (
        <ol className="stick-list">
          {shown.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={selected === s.id} onClick={() => onSelect(s.id)}>
                #{s.n} · placed by {s.authorName}
              </button>
            </li>
          ))}
        </ol>
      )}
      {pages > 1 && (
        <p className="row">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page + 1} of {pages}
          </span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </p>
      )}
    </div>
  );
}
