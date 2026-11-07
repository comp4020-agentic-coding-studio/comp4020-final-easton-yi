// The island's phone and tablet overlay (mobile/tablet layout brief, 2026-11-07). Rendered by WorldStage only in
// the touch layout (touch-layout.ts); the desktop overlay is a separate branch and is unchanged. Every action uses
// WorldStage's own handlers (take, pause, safe point, home, light, speed, fullscreen, portals, Return to world),
// so routes, sign-in redirects, anchor scrolling and the remembered pose behave exactly as before.
//
// Layout while exploring:
//   upper left    one compact label "<landmark> · Preset" (or the region) with an information button
//   upper right   one Menu button (the existing pause semantics)
//   lower left    the move stick
//   lower right   a compact speed selector ("Run ▾") and the Up / Down / Boost cluster
//   centre        free for looking: no persistent banners, light selector or navigation strip
// The information panel and the menu are dialogs: focus moves in and comes back, Escape closes them, held input
// is cleared on opening and nothing resumes by itself on closing.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { WorldStatus, WorldView } from "./WorldView.ts";
import { portalTarget, type PortalId } from "./bridge.ts";
import { SPEED_MODES, horizontalSpeed, type SpeedMode } from "../../world/flight.ts";
import { LIGHT_MODES, type EnvironmentStatus, type LightMode } from "./daynight.ts";
import { LIGHT_LABEL, PHASE_LABEL, SPEED_LABEL, SpeedIcon } from "./world-ui.tsx";
import { RegionAnnouncer, infoButtonName, infoSubject, restingLabel, type InfoSubject, type RegionInfo } from "./touch-layout.ts";

export interface TouchHudProps {
  mode: "home" | "full";
  view: React.RefObject<WorldView | null>;
  status: WorldStatus | null;
  user: boolean;
  menu: boolean;
  setMenu: (b: boolean) => void;
  notice: string | null;
  setNotice: (n: string | null) => void;
  light: LightMode;
  env: EnvironmentStatus | null;
  onLight: (m: LightMode) => void;
  speed: SpeedMode;
  onSpeed: (m: SpeedMode) => void;
  boostLatched: boolean;
  setBoostLatched: (b: boolean) => void;
  fullscreen: boolean;
  canFullscreen: boolean;
  onTake: (opts?: { fullscreen?: boolean }) => void;
  onPause: () => void;
  onSafe: () => void;
  onHome: () => void;
  onToggleFullscreen: () => void;
  onExitFullscreen: () => void;
  onEnterPortal: (id: PortalId) => void;
  onRememberPose: () => void;
  onViewPlayerWorks: () => void;
  /** Clear held movement/look/boost without leaving exploring (WorldStage.endInput). */
  endInput: () => void;
  /** Hold off canvas look gestures while an overlay owns the screen (and clear what was held). */
  onOverlayHold: (on: boolean) => void;
  opening: string;
  takeRef: React.RefObject<HTMLButtonElement | null>;
  /** The move stick (WorldStage's TouchControls, stick only). */
  stick: ReactNode;
  /** "Go to a landmark" (WorldStage's LandmarkJump). */
  landmarkJump: ReactNode;
}

/** A press on a HUD control never starts a camera gesture. */
const stop = (e: React.PointerEvent): void => e.stopPropagation();

export function TouchHud(p: TouchHudProps) {
  const s = p.status;
  const exploring = s?.control === "exploring";
  const ready = s?.phase === "ready";
  const manifest = p.view.current?.manifest ?? null;

  // ---- the information subject: the landmark near you, else the region (never a stale landmark)
  const regionOf = (id: string | undefined): RegionInfo | null => {
    if (!id) return null;
    const r = manifest?.regions.find((x) => x.id === id);
    return { id, name: r?.name ?? null, prompt: r?.prompt ?? s?.regionPrompt ?? "" };
  };
  const live = s ? infoSubject(s.nearLandmark, regionOf(s.regionId)) : null;
  const [info, setInfo] = useState<InfoSubject | null>(null); // the subject frozen while the panel is open
  const infoOpen = info !== null;
  const infoBtn = useRef<HTMLButtonElement>(null);
  const [modesOpen, setModesOpen] = useState(false);
  const modeBtn = useRef<HTMLButtonElement>(null);

  const openInfo = (): void => {
    if (!live) return;
    p.endInput();
    setModesOpen(false);
    setInfo(live);
  };
  const closeInfo = (): void => {
    setInfo(null);
    // focus back to the information button (or the label's place); exploring continues without held input
    requestAnimationFrame(() => infoBtn.current?.focus({ preventScroll: true }));
  };

  // ---- a brief, debounced region toast on entering a different region (always also in the panel)
  const announcer = useRef(new RegionAnnouncer());
  const [toast, setToast] = useState<RegionInfo | null>(null);
  useEffect(() => {
    if (!exploring || !s) {
      announcer.current.reset();
      return;
    }
    const tick = (): void => {
      const id = announcer.current.update(s.regionId, performance.now());
      if (id) {
        const r = regionOf(id);
        if (r?.prompt) setToast(r);
      }
    };
    tick();
    // the region only changes with a status emit; one deferred re-check lets a held region pass the settle time
    const t = window.setTimeout(tick, 1300);
    return () => window.clearTimeout(t);
  }, [exploring, s?.regionId]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---- menus close with Escape (an attached keyboard); world input is cleared while any overlay is open
  useEffect(() => {
    if (!infoOpen && !modesOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (infoOpen) closeInfo();
      else {
        setModesOpen(false);
        modeBtn.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [infoOpen, modesOpen]);

  // leaving exploring (pause, blur, a portal) closes the transient speed selector
  useEffect(() => {
    if (!exploring) setModesOpen(false);
  }, [exploring]);

  // the info panel holds the world still while open: any input that sneaks in (a held stick at the moment of the
  // tap) is dropped again; nothing is resumed on close
  useEffect(() => {
    p.onOverlayHold(infoOpen);
    return () => p.onOverlayHold(false);
  }, [infoOpen]);
  // the panel describes where you were when you opened it; leaving exploring (pause, a portal) closes it
  useEffect(() => {
    if (!exploring && infoOpen) setInfo(null);
  }, [exploring]);

  const lightNow = p.env ? (p.light === "auto" ? `Auto · ${PHASE_LABEL[p.env.phase]} now` : `${LIGHT_LABEL[p.light]} fixed`) : "";

  const destinations = (
    <nav className="world-portals world-t-dest" aria-label="Island portals">
      <a href="/world/" onClick={(e) => (e.preventDefault(), p.onEnterPortal("explore"))}>
        Explore the World
      </a>
      <a href={portalTarget("works", p.user).href} onClick={p.onRememberPose}>
        My Works
      </a>
      <a href={portalTarget("together", p.user).href} onClick={p.onRememberPose}>
        Build Together
      </a>
      <a href="/#exhibits-h" onClick={p.onViewPlayerWorks}>
        View player works
      </a>
    </nav>
  );

  const lightGroup = (
    <div className="world-light world-t-light" role="group" aria-label="Light: day and night" aria-describedby="world-light-now">
      <span className="world-light-title" aria-hidden="true">
        Light
      </span>
      {LIGHT_MODES.map((m) => (
        <button key={m} type="button" aria-pressed={p.light === m} onClick={() => p.onLight(m)} onPointerDown={stop}>
          {LIGHT_LABEL[m]}
        </button>
      ))}
      <span id="world-light-now" className="world-light-now small">
        {lightNow}
      </span>
    </div>
  );

  const helpText = "Left stick moves; drag anywhere else on the island to look; Up and Down fly; Boost speeds up; the speed button switches Walk, Run and Fly.";

  return (
    <div className={`world-overlay world-t${infoOpen ? " info-open" : ""}`}>
      {/* ---- before exploring (and while paused): the opening card, now holding the whole menu */}
      {!exploring && (
        <div className="world-intro world-t-sheet" role={p.menu ? "dialog" : undefined} aria-labelledby={p.menu ? "world-t-paused" : undefined}>
          {p.menu ? (
            <h3 id="world-t-paused" className="world-t-paused">
              Paused
            </h3>
          ) : (
            <p className="world-opening">{p.opening}</p>
          )}
          {s?.phase === "loading" && (
            <p className="world-progress" role="status">
              Loading the island… {Math.round((s.progress ?? 0) * 100)}%
            </p>
          )}
          {(s?.phase === "error" || s?.phase === "context-lost") && (
            <div className="notice error world-error" role="alert">
              <p>{s.message}</p>
              {s.phase === "error" && (
                <button type="button" onClick={() => p.view.current?.retry()}>
                  Try again
                </button>
              )}
              <p className="small">The exhibition, your works and building together don't need the island.</p>
            </div>
          )}
          <div className="world-actions">
            <button ref={p.takeRef} type="button" className="primary" disabled={!ready} onClick={() => p.onTake()}>
              {p.menu ? "Resume exploring" : "Start exploring"}
            </button>
            {p.canFullscreen && !p.fullscreen && (
              <button type="button" disabled={!ready} onClick={() => p.onTake({ fullscreen: true })}>
                Explore fullscreen
              </button>
            )}
            {p.fullscreen && (
              <button type="button" onClick={p.onExitFullscreen}>
                Exit fullscreen
              </button>
            )}
            {p.mode === "home" && (
              <a className="button" href="/world/">
                Island page
              </a>
            )}
          </div>
          {p.menu && ready && (
            <div className="world-t-group world-menu" role="group" aria-label="Paused">
              <button type="button" onClick={p.onSafe}>
                Return to nearest safe point
              </button>
              <button type="button" onClick={p.onHome}>
                Return home
              </button>
              {p.landmarkJump}
            </div>
          )}
          <div className="world-t-group">
            <h3 className="world-t-h">Go to</h3>
            {destinations}
          </div>
          <div className="world-t-group">{lightGroup}</div>
          <p id="world-help" className="world-help small">
            {helpText}
          </p>
        </div>
      )}

      {exploring && (
        <>
          {/* upper left: the compact label and its information button */}
          {live && (
            <div className="world-t-label world-hud-ui" onPointerDown={stop}>
              <span className="world-t-title">
                <span className="world-t-name">{restingLabel(live)}</span>
                {live.kind === "landmark" && <span className="world-t-preset"> · Preset</span>}
              </span>
              <button ref={infoBtn} type="button" className="world-t-info" aria-label={infoButtonName(live)} aria-haspopup="dialog" aria-expanded={infoOpen} onClick={openInfo}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {/* upper right: one Menu button with the existing pause semantics */}
          <button type="button" className="world-t-menu" aria-label="Menu (pauses exploring)" onPointerDown={stop} onClick={p.onPause}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className="world-t-menu-text">Menu</span>
          </button>

          {/* operational messages stay outside the information panel: portals, side routes, the boundary */}
          <div className="world-hud world-t-ops" aria-live="polite">
            {s?.nearPortal && (
              <p className="world-portal-label">
                {s.nearPortal.label}
                {s.nearPortal.close && <span className="world-enter"> · walk through or tap Enter</span>}
              </p>
            )}
            {s?.wayPrompt && <p className="world-way">{s.wayPrompt}</p>}
            {s && s.boundary > 0.05 && <p className="world-wind">The wind pushes back toward the island.</p>}
            {toast && !s?.nearPortal && (
              <p className="world-t-toast">
                <strong>{toast.name ?? ""}</strong> {toast.prompt}
              </p>
            )}
          </div>
          {s?.nearPortal?.close && (
            <button type="button" className="primary world-t-enter" onPointerDown={stop} onClick={() => p.onEnterPortal(s.nearPortal!.id)}>
              Enter {s.nearPortal.label}
            </button>
          )}

          {/* lower left: the move stick */}
          {p.stick}

          {/* lower right: speed selector and the Up / Down / Boost cluster */}
          <div className="world-t-cluster world-touch" onPointerDown={stop}>
            <div className="world-t-modewrap">
              {modesOpen && (
                <div className="world-t-modes" role="group" aria-label="Speed">
                  {[...SPEED_MODES].reverse().map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`world-speed-btn speed-${m}`}
                      aria-pressed={p.speed === m}
                      title={`${SPEED_LABEL[m]} · ${horizontalSpeed(m, false)} m/s`}
                      onClick={() => {
                        p.onSpeed(m);
                        setModesOpen(false);
                        modeBtn.current?.focus({ preventScroll: true });
                      }}
                    >
                      <SpeedIcon mode={m} />
                      <span className="world-speed-label">{SPEED_LABEL[m]}</span>
                    </button>
                  ))}
                </div>
              )}
              <button ref={modeBtn} type="button" className="world-t-mode" aria-label={`Speed: ${SPEED_LABEL[p.speed]}`} aria-haspopup="true" aria-expanded={modesOpen} onClick={() => setModesOpen(!modesOpen)}>
                <SpeedIcon mode={p.speed} />
                <span>{SPEED_LABEL[p.speed]}</span>
                <span aria-hidden="true" className="world-t-caret">
                  ▾
                </span>
              </button>
            </div>
            <HoldButtons view={p.view} boostLatched={p.boostLatched} setBoostLatched={p.setBoostLatched} />
          </div>

          {/* the information panel: full title, Preset, inspiration, period, organisation and the region's observation */}
          {info && <InfoPanel subject={info} manifest={manifest} onClose={closeInfo} />}
        </>
      )}

      {p.notice && (
        <p className="world-notice world-t-notice" role="status">
          {p.notice}
        </p>
      )}
    </div>
  );
}

/** Up / Down held, Boost latched: the same input as before (WorldView.input), compact, with icons and labels. */
function HoldButtons({ view, boostLatched, setBoostLatched }: { view: React.RefObject<WorldView | null>; boostLatched: boolean; setBoostLatched: (b: boolean) => void }) {
  const hold = (key: "ascend" | "descend") => ({
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (view.current) view.current.input[key] = true;
      view.current?.invalidate();
    },
    onPointerUp: () => {
      if (view.current) view.current.input[key] = false;
    },
    onPointerCancel: () => {
      if (view.current) view.current.input[key] = false;
    },
    onLostPointerCapture: () => {
      if (view.current) view.current.input[key] = false;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const arrow = (d: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <div className="world-fly world-t-fly">
      <button type="button" {...hold("ascend")}>
        {arrow("M6 15l6-6 6 6")}
        <span>Up</span>
      </button>
      <button type="button" {...hold("descend")}>
        {arrow("M6 9l6 6 6-6")}
        <span>Down</span>
      </button>
      <button type="button" aria-pressed={boostLatched} onClick={() => setBoostLatched(!boostLatched)}>
        {arrow("M5 17l5-5-5-5M12 17l5-5-5-5")}
        <span>Boost</span>
      </button>
    </div>
  );
}

function InfoPanel({ subject, manifest, onClose }: { subject: InfoSubject; manifest: WorldView["manifest"]; onClose: () => void }) {
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    const b = body.current;
    if (!b) return;
    const check = (): void => setMore(b.scrollHeight - b.scrollTop - b.clientHeight > 2);
    check();
    b.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(b);
    return () => {
      b.removeEventListener("scroll", check);
      ro?.disconnect();
    };
  }, []);
  // keep Tab inside the panel while it is open
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key !== "Tab" || !panel.current) return;
    const f = [...panel.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])")];
    if (!f.length) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const lm = subject.kind === "landmark" ? manifest?.landmarks.find((l) => l.id === subject.landmark.id) : null;
  const title = subject.kind === "landmark" ? subject.landmark.title : (subject.region.name ?? "About this place");
  return (
    <div
      ref={panel}
      className="world-t-panel world-hud-ui"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-t`}
      onKeyDown={onKey}
      // a scroll or tap in the panel is never a world gesture
      onPointerDown={stop}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="world-t-panel-head">
        <h3 id={`${id}-t`} className="world-t-panel-title">
          {title}
        </h3>
        <button ref={close} type="button" className="world-t-close" aria-label="Close information" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div ref={body} className={`world-t-panel-body${more ? " more" : ""}`} tabIndex={more ? 0 : undefined} aria-label={more ? "Information (scrolls)" : undefined}>
        {subject.kind === "landmark" && (
          <>
            <p className="world-t-kind">World preset · an authored landmark, not a player exhibit</p>
            <p>Inspired by {subject.landmark.inspiration}</p>
            {lm && (
              <dl className="world-t-facts">
                {lm.period && (
                  <>
                    <dt>Period</dt>
                    <dd>{lm.period}</dd>
                  </>
                )}
                {lm.organization && (
                  <>
                    <dt>Organisation</dt>
                    <dd>{lm.organization}</dd>
                  </>
                )}
              </dl>
            )}
          </>
        )}
        {subject.region.prompt && (
          <div className="world-t-region">
            {subject.region.name && <h4>{subject.region.name}</h4>}
            <p>{subject.region.prompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}

