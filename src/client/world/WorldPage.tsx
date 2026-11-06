// `/world/`: the island full screen. The same runtime as the home page's
// island (one canvas at a time; leaving either page disposes it).
import { WorldStage } from "./WorldStage.tsx";

export function WorldPage() {
  return (
    <main className="world-page" aria-label="The island">
      <WorldStage mode="full" />
    </main>
  );
}
