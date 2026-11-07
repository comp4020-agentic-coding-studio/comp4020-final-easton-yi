// Labels and icons shared by the island's desktop overlay (WorldStage) and its phone/tablet overlay (TouchHud).
// Moved here unchanged from WorldStage.tsx so the two overlays don't import each other.
import type { SpeedMode } from "../../world/flight.ts";
import type { EnvironmentStatus, LightMode } from "./daynight.ts";

export const SPEED_LABEL: Record<SpeedMode, string> = { walk: "Walk", run: "Run", fly: "Fly" };
export const LIGHT_LABEL: Record<LightMode, string> = { auto: "Auto", day: "Day", night: "Night" };
export const PHASE_LABEL: Record<EnvironmentStatus["phase"], string> = { dawn: "dawn", day: "day", dusk: "dusk", night: "night" };

export function SpeedIcon({ mode }: { mode: SpeedMode }) {
  // simple line icons that read on bright sky and dark stone alike (stroke follows the button's text colour)
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (mode === "fly")
    return (
      <svg {...common}>
        <path d="M3 13c3-1 5-4 9-4s6 3 9 4" />
        <path d="M7 12.5 4 17M17 12.5l3 4.5M12 9v8" />
      </svg>
    );
  if (mode === "run")
    return (
      <svg {...common}>
        <circle cx="15" cy="4.5" r="1.8" />
        <path d="M9 20l3-5 3 2v4M12 15l1-5 4 3h3M13 10l-4-1-3 3" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 8v6l-2 6M12 14l2 6M9 11l3-2 3 2" />
    </svg>
  );
}
