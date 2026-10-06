// A short, skippable introduction (NAV-03). Each step is done in the real
// work, not a disposable demo, and ticks off when the action really happens.
import { useEffect, useRef } from "react";
import { LIMITS } from "../../shared/config.ts";

const STEPS: [string, string][] = [
  ["orbit", "Look around: drag the empty background to orbit; scroll or pinch to zoom. The view is yours alone."],
  ["add", "Press Add (or N) to hold a stick. It's a ghost: only you can move it, and partners see it as your intention."],
  ["adjust", "Adjust it: drag its middle to slide, the blue arrows for height, a green ball to swing one end around the other, or use the panel and keys."],
  ["place", "Press Place (or Enter). Once the server saves it, it's real wood and gravity takes over."],
  ["saved", "Watch the status at the top: “Placement saved; structure moving”, then “Structure saved” once everything is still."],
];

export function Intro({ progress, onClose }: { progress: Set<string>; onClose: (done: boolean) => void }) {
  const ref = useRef<HTMLElement>(null);
  const done = STEPS.every(([k]) => progress.has(k));
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <section className="intro-card" aria-labelledby="intro-h" tabIndex={-1} ref={ref}>
      <h2 id="intro-h">Getting started</h2>
      <ol>
        {STEPS.map(([k, text]) => (
          <li key={k} className={progress.has(k) ? "done" : ""}>
            <span className="tick" aria-hidden="true">
              {progress.has(k) ? "✓" : "○"}
            </span>{" "}
            {text}
            {progress.has(k) && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
      <details className="lifecycle-help">
        <summary>Archive, trash and deleting a work</summary>
        <ul className="small">
          <li>
            <strong>Archive</strong> (owner): stops live building and hides the work from the default list. Exhibits stay public. Unarchive any time.
          </li>
          <li>
            <strong>Withdraw</strong> (owner, under Versions): takes one exhibit out of public view. Republish it later. Withdrawn exhibits still count toward the {LIMITS.exhibitsPerWork}-exhibit limit.
          </li>
          <li>
            <strong>Move to trash</strong> (owner, under Work): closes the work for everyone and withdraws all its exhibits. Nothing is deleted.
          </li>
          <li>
            <strong>Restore work</strong> (owner, My works → Trash): brings it back as it was. Exhibits stay withdrawn until republished; people who left aren't added back.
          </li>
          <li>
            <strong>Delete permanently</strong> (owner, from Trash, after typing the title): removes the work, its versions and exhibits for every collaborator. It can't be undone.
          </li>
          <li>Editors can leave at any time, from People, or from My works if the work is in the owner's trash.</li>
        </ul>
      </details>
      <p className="muted small">
        If the view feels slow, open Graphics in the view controls and choose Medium or Low. Auto, the default, adjusts by itself. It only affects
        this device.
      </p>
      <p className="actions">
        <button type="button" className={done ? "primary" : ""} onClick={() => onClose(done)}>
          {done ? "Done" : "Skip"}
        </button>
        <span className="muted small">Reopen any time with Help.</span>
      </p>
    </section>
  );
}
