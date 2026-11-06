// "Return to world" on the pages a world portal opens (interaction brief §6):
// My Works, the create entry, a work's editor, exhibits and the exhibition,
// plus the sign-in pages a portal can pass through. The island remembered its
// route (home page or /world/) and the explorer's pose when they left
// (world-session.ts); this link goes back there, and the island restores the
// pose in free-cursor mode with nothing held. Nothing here keeps a renderer
// alive, and leaving the editor respects its unsaved-stick protection.
import { useEffect, useRef, useState } from "react";
import { leaveWarning, navigate } from "../router.ts";
import { clearReturn, loadReturn, type WorldReturn } from "./world-session.ts";

/** Pages with their own island (or the island itself) don't need the link. */
const WORLD_PAGES = new Set(["/", "/world/", "/world/inspect/"]);

export function ReturnToWorld({ path }: { path: string }) {
  const [ret, setRet] = useState<WorldReturn | null>(() => (WORLD_PAGES.has(path) ? null : loadReturn()));
  const [confirming, setConfirming] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    setRet(WORLD_PAGES.has(path) ? null : loadReturn());
    setConfirming(null);
  }, [path]);
  if (!ret) return null;

  const label = ret.route === "/world/" ? "the island page" : "the island on the home page";
  const go = (): void => {
    setConfirming(null);
    // the island on that route reads the remembered pose when it mounts (the home page's island is at its top)
    navigate(ret.route);
  };
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab keeps this page
    e.preventDefault();
    e.stopPropagation(); // the app's link router would navigate before the guard is asked
    const warning = leaveWarning();
    if (warning) setConfirming(warning);
    else go();
  };

  return (
    <div className="world-return" role="navigation" aria-label="Island">
      <a ref={linkRef} className="button world-return-link" href={ret.route} onClick={onClick}>
        <span aria-hidden="true" className="world-return-icon">
          ←
        </span>
        Return to world
      </a>
      <span className="muted small world-return-where">Back to where you left {label}.</span>
      <button
        type="button"
        className="link small"
        onClick={() => {
          clearReturn();
          setRet(null);
        }}
      >
        Dismiss
      </button>
      {confirming && (
        <div className="world-return-confirm" role="alertdialog" aria-labelledby="world-return-h" aria-describedby="world-return-d">
          <p id="world-return-h">
            <strong>Leave this work?</strong>
          </p>
          <p id="world-return-d">{confirming}</p>
          <p className="actions">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirming(null);
                linkRef.current?.focus();
              }}
            >
              Stay here
            </button>
            <button type="button" className="danger" onClick={go}>
              Leave and return to world
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
