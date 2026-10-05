// A short, skippable introduction (NAV-03). Each step is done in the real
// work, not a disposable demo, and ticks off when the action really happens.
import { useEffect, useRef } from "react";

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
      <p className="actions">
        <button type="button" className={done ? "primary" : ""} onClick={() => onClose(done)}>
          {done ? "Done" : "Skip"}
        </button>
        <span className="muted small">Reopen any time with Help.</span>
      </p>
    </section>
  );
}
