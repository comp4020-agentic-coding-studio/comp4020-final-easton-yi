// The component preview set (brief §7.3) as selections of the real landmarks:
// every entry names the landmark whose generated asset it comes from and the
// component names inside it, so the preview shows exactly what stands in the
// world rather than a separately maintained copy.
export interface ComponentEntry {
  id: string;
  title: string;
  landmark: string;
  /** Component names (exact) or a pattern over component names. */
  match: string[] | RegExp;
  note: string;
}

export const COMPONENTS: readonly ComponentEntry[] = [
  { id: "doric", title: "Doric column", landmark: "L03", match: ["peristyle column 1"], note: "Ridge Doric Temple peristyle: no base, 20 flutes, entasis, echinus and abacus" },
  { id: "ionic", title: "Ionic column", landmark: "L04", match: ["main ionic 1"], note: "Volute Terrace Palace main order: Appendix B4 recipe, base, fluted shaft, curled volutes" },
  { id: "corinthian", title: "Corinthian column", landmark: "L07", match: ["portico column 1"], note: "Oculus Hall portico (sixteen columns): five lanes of leaf clusters, abacus" },
  { id: "lotus", title: "Lotus / papyrus column", landmark: "L02", match: ["low column 1"], note: "Lotus Column Forest side aisle: bundled stems, bud capital" },
  { id: "steps", title: "Broad shallow steps", landmark: "L03", match: ["approach front"], note: "0.25 m risers, 1.5 m treads up the temple platform" },
  { id: "round-arch", title: "Round arch arcade", landmark: "L05", match: ["lower arcade", "lower pier 3", "lower pier 4"], note: "Triple Aqueduct lower tier: arch rings with depth, piers" },
  { id: "pointed-arch", title: "Pointed arches and compound piers", landmark: "L10", match: /^(arcades|pier N\d)$/, note: "Pointed-Arch Cloud Nave: the north aisle arcade on its nine compound piers (the south arcade shows too: one component)" },
  { id: "dome", title: "Eight-lobed dome", landmark: "L11", match: /^(dome|octagon face \d+|lantern)$/, note: "Eight-Lobed Dome Palace: ribs, rings, octagon drum faces and lantern" },
  { id: "braced", title: "Braced facade", landmark: "L19", match: ["bracing"], note: "Prismatic Brace Tower: large X braces over 32 m bands" },
  { id: "spillway", title: "Fin spillway (four bays)", landmark: "L16", match: ["fin spillway"], note: "Curved Gorge Dam annex: five fin buttresses, recessed gates, chutes (§7.4)" },
];

export function componentMatches(entry: ComponentEntry, name: string): boolean {
  return Array.isArray(entry.match) ? entry.match.includes(name) : entry.match.test(name);
}
