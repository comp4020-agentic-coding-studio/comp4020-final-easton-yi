// ExistingFeatureBridge (main prompt §9): where each portal leads, using the
// app's existing pages and their own sign-in and return-to behaviour. No
// business logic lives here: "My Works" is the existing work list (which asks
// a signed-out visitor to sign in), and "Build Together" is the existing
// create entry (`/works/?new=1`, focused name field), because there's no
// open-room browser to invent. Explore stays in the island.
import { signInLink } from "../router.ts";

export type PortalId = "explore" | "works" | "together";

export function portalTarget(id: PortalId, signedIn: boolean): { kind: "explore"; href: string } | { kind: "page"; href: string } {
  if (id === "works") return { kind: "page", href: "/works/" };
  if (id === "together") return { kind: "page", href: signedIn ? "/works/?new=1" : signInLink("register", "/works/?new=1") };
  return { kind: "explore", href: "/world/" };
}
