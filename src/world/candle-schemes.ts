// The twenty landmarks' candle schemes (courtyard/day-night directive §9).
// Authored per building from its recipe's own structure: entries, stairs,
// platforms, floors and safe points (read from each recipe's generated
// output, docs/evidence/world/candles.md). Coordinates are landmark-local (the
// front faces −z); supported groups name a point near the surface they stand
// on, and the resolver (candles.ts) finds that surface in the pieces, checks it
// carries every cup and keeps the group off walking lines, safe points and
// viewpoints, trying the listed alternatives and a small search around each.
//
// The architectural rules (directive §9):
//   L01–L04  entrances, column bases, beside approach stairs and on landings;
//            the intervals between columns stay dark
//   L05–L08  bridge ends and safe platforms, theatre circulation, dome-hall
//            entrances and interior column bases (the interior volume legible)
//   L09–L12  gates, courtyard nodes, stair landings and circulation corners;
//            not every battlement or window
//   L13–L16  the glasshouse hall, the tower's platforms, the setbacks, the dam's
//            crest ends and toe; not the dam face
//   L17–L20  lobbies, a few significant terraces and the upper destinations;
//            no continuous strip on every floor
import type { V3 } from "./core.ts";
import type { CandleAnchor, CandleScheme } from "./candles.ts";

const S = (id: string, kind: string, at: V3[], cups: number, o: Partial<CandleAnchor> = {}): CandleAnchor => ({ id, kind, role: "supported", at, cups, ...o });
const D = (id: string, kind: string, at: V3[], cups: number, o: Partial<CandleAnchor> = {}): CandleAnchor => ({ id, kind, role: "detached", at, cups, ...o });
/** A pair mirrored across the building's centre line (x → −x). */
const pair = (mk: (side: 1 | -1, tag: string) => CandleAnchor): CandleAnchor[] => [mk(-1, "w"), mk(1, "e")];

export const CANDLE_SCHEMES: Readonly<Record<string, CandleScheme>> = {
  // ------------------------------------------------------------ A: Origins Meadow
  L01: {
    intent: "The open end of the horseshoe is the entrance: two ground groups mark it, two more sit at the inner portal pairs' feet so the inner court reads, and the ring bays between posts stay dark.",
    anchors: [
      ...pair((s, t) => S(`mouth-${t}`, "entrance", [[s * 8.5, 0, -30], [s * 9.5, 0, -27]], 5, { ground: true, essential: true })),
      ...pair((s, t) => S(`court-${t}`, "court", [[s * 7.5, 0, -2], [s * 8.5, 0, 2]], 4, { ground: true })),
      S("court-far", "court", [[0, 0, 13], [3, 0, 15]], 3, { ground: true }),
      S("side-bay", "entrance", [[-31, 0, -2], [-33, 0, -1]], 3, { ground: true }),
    ],
  },
  L02: {
    intent: "Candles flank the foot and the head of the approach ramp, then two pairs of interior groups stand at the bases of the central high columns along the hall, leaving the aisles' forest of columns in shadow.",
    zones: [{ id: "hall", min: [-71, 0, -50], max: [71, 44, 51] }],
    anchors: [
      ...pair((s, t) => S(`ramp-foot-${t}`, "stair", [[s * 10.5, 0, -73.5], [s * 11, 0, -72]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`ramp-head-${t}`, "landing", [[s * 10.5, 4, -47.5], [s * 11, 4, -46]], 4, { essential: true })),
      ...pair((s, t) => S(`hall-1-${t}`, "interior", [[s * 8.5, 4, -24], [s * 8.5, 4, -22]], 5, { zone: "hall" })),
      ...pair((s, t) => S(`hall-2-${t}`, "interior", [[s * 8.5, 4, 14], [s * 8.5, 4, 16]], 4, { zone: "hall" })),
      S("hall-end", "interior", [[6.5, 4, 40], [-6.5, 4, 40]], 5, { zone: "hall" }),
    ],
  },
  L03: {
    intent: "The front flight is marked at its foot and its head; inside the peristyle two groups light the cella's entrance and its centre, while the 46 outer columns keep their dark intervals; the rear flight is marked for the way out.",
    zones: [{ id: "cella", min: [-30, 0, -70], max: [30, 50, 70] }],
    anchors: [
      ...pair((s, t) => S(`flight-foot-${t}`, "stair", [[s * 14.5, 0, -129], [s * 15, 0, -127]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`flight-head-${t}`, "landing", [[s * 9.5, 6, -86], [s * 10, 6, -84]], 5, { essential: true })),
      ...pair((s, t) => S(`cella-door-${t}`, "entrance", [[s * 8, 6, -50], [s * 8.5, 6, -48]], 4, { zone: "cella" })),
      ...pair((s, t) => S(`cella-${t}`, "interior", [[s * 9, 6, 8], [s * 9, 6, 12]], 5, { zone: "cella" })),
      ...pair((s, t) => S(`rear-head-${t}`, "landing", [[s * 9.5, 6, 86], [s * 10, 6, 84]], 3)),
    ],
  },
  L04: {
    intent: "The porch flight is lit at its foot and on the porch landing; the terrace flight's landing and the court in front of the hall carry the next groups; inside, the hall's column bases are lit in pairs. The colonnade's intervals stay dark.",
    zones: [{ id: "hall", min: [-24, 8, -28], max: [56, 56, 64] }, { id: "porch", min: [-56, 4, -48], max: [-20, 34, 8] }],
    anchors: [
      ...pair((s, t) => S(`porch-foot-${t}`, "stair", [[-38 + s * 9, 0, -73], [-38 + s * 9.5, 0, -72]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`porch-${t}`, "landing", [[-38 + s * 9, 4, -44], [-38 + s * 8, 4, -40]], 4, { essential: true, zone: "porch" })),
      S("link-landing", "landing", [[-25, 4, -3], [-26, 4, -1]], 5, { essential: true }),
      S("link-head", "landing", [[-2, 8, -18], [-2, 8, -20]], 4, { essential: true }),
      ...pair((s, t) => S(`court-${t}`, "court", [[16 + s * 10, 8, -50], [16 + s * 12, 8, -48]], 5, { essential: true })),
      ...pair((s, t) => S(`hall-front-${t}`, "interior", [[16 + s * 10, 8, -18], [16 + s * 11, 8, -16]], 4, { zone: "hall" })),
      ...pair((s, t) => S(`hall-back-${t}`, "interior", [[16 + s * 10, 8, 30], [16 + s * 11, 8, 32]], 4, { zone: "hall" })),
    ],
  },
  // ------------------------------------------------------------ B: Arches and Domes
  L05: {
    intent: "The aqueduct is a bridge: its two bank ends and the maintenance walk's ends are lit, with one group on the central bank terrace; the arcades themselves stay silhouettes against the sky.",
    anchors: [
      S("stream-west", "platform", [[-25, 0, -22], [-25, 0, -26]], 4, { ground: true }),
      S("stream-east", "platform", [[5, 0, -22], [5, 0, -26]], 3, { ground: true }),
      S("walk-west", "platform", [[-146, 66.5, 6], [-144, 66.5, 6.5]], 4, { essential: true }),
      S("walk-east", "platform", [[146, 66.5, 6], [144, 66.5, 6.5]], 4, { essential: true }),
      D("bank-west", "column", [[-142.6, 30.4, -10.6], [-142, 30.2, -10.2]], 3),
    ],
  },
  L06: {
    intent: "The main ground arch is lit on both sides of its passage; the arena's ring of seating carries groups at its four circulation points, and a few detached groups hover in the radial corridor so the inside reads at night. The arcades of the outer wall stay dark.",
    zones: [{ id: "arena", min: [-90, 0, -70], max: [90, 30, 70] }],
    anchors: [
      // the pad ends ~6 m outside the arcade (the hillside falls away beyond local x ≈ 126): the groups stand on it
      ...pair((s, t) => S(`main-${t}`, "entrance", [[123.5, 0, 7.8 + s * 7.5], [122.8, 0, 7.8 + s * 8]], 5, { ground: true, essential: true })),
      // the arena floor is the recipe's plank deck (a solid plank-finish shell at 0.25 m)
      S("arena-n", "court", [[0, 0.25, -30], [0, 0.25, -32]], 5, { zone: "arena", shells: true }),
      S("arena-s", "court", [[0, 0.25, 30], [0, 0.25, 32]], 5, { zone: "arena", shells: true }),
      S("arena-w", "court", [[-48, 0.25, 0], [-50, 0.25, 0]], 4, { zone: "arena", shells: true }),
      S("arena-e", "court", [[48, 0.25, 14], [50, 0.25, 14]], 4, { zone: "arena", shells: true }),
      D("corridor-1", "landing", [[96.6, 3.6, 13.8], [97.2, 3.6, 14.2], [96.6, 3.6, 1.8]], 3, { zone: "arena" }),
      D("corridor-2", "landing", [[-96.6, 3.6, -8.8], [-97, 3.6, -8.4]], 3, { zone: "arena" }),
    ],
  },
  L07: {
    intent: "The portico flight is lit at its foot and at the portico; the drum passage's entrance carries a pair; inside the rotunda, groups at the four cardinal points under the coffered dome make the round volume legible below the oculus.",
    zones: [{ id: "rotunda", min: [-48, 0, -26], max: [48, 86, 62] }],
    anchors: [
      ...pair((s, t) => S(`steps-foot-${t}`, "stair", [[s * 14.5, 0, -107], [s * 15, 0, -106]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`portico-${t}`, "landing", [[s * 10, 6, -62], [s * 10, 6, -60]], 5, { essential: true })),
      ...pair((s, t) => S(`drum-door-${t}`, "entrance", [[s * 10.5, 6, -26], [s * 11, 6, -24]], 3, { essential: true })),
      S("rotunda-n", "interior", [[0, 6, 50], [3, 6, 50]], 5, { zone: "rotunda" }),
      S("rotunda-w", "interior", [[-30, 6, 18], [-30, 6, 14]], 4, { zone: "rotunda" }),
      S("rotunda-e", "interior", [[30, 6, 18], [30, 6, 14]], 4, { zone: "rotunda" }),
      S("rotunda-centre", "interior", [[9, 6, 16], [-9, 6, 16]], 3, { zone: "rotunda" }),
    ],
  },
  L08: {
    intent: "The west flight is lit at its foot and its head under the half-dome; inside, groups stand at the bases of the four great piers, so the square under the floating dome reads at night; the aisle exit is marked, and two detached groups float at gallery height beside the piers to lift the interior volume.",
    zones: [{ id: "nave", min: [-46, 0, -80], max: [46, 96, 80] }],
    anchors: [
      ...pair((s, t) => S(`flight-foot-${t}`, "stair", [[s * 12.5, 0, -125], [s * 13, 0, -124]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`flight-head-${t}`, "landing", [[s * 9.5, 6, -82], [s * 10, 6, -80]], 4, { essential: true })),
      // at the inner corners of the four great piers (centres ±38, 12 m square: inner faces at ±32)
      ...pair((s, t) => S(`pier-s-${t}`, "interior", [[s * 29.5, 6, -29.5], [s * 29, 6, -28]], 5, { zone: "nave" })),
      ...pair((s, t) => S(`pier-n-${t}`, "interior", [[s * 29.5, 6, 29.5], [s * 29, 6, 28]], 5, { zone: "nave" })),
      S("centre", "interior", [[0, 6, 14], [0, 6, 18]], 4, { zone: "nave" }),
      S("aisle-exit", "entrance", [[52, 6, 2], [52, 6, 0]], 4, { essential: true }),
      // floating beside two piers' inner corners at gallery height, clear of the timber
      ...pair((s, t) => D(`pier-high-${t}`, "column", [[s * 30.8, 22, -30.8], [s * 30.4, 22, -30.4]], 3, { zone: "nave" })),
    ],
  },
  // ------------------------------------------------------------ C: Cities and Halls
  L09: {
    intent: "The castle is read by its way in: the gate ramp's foot and head, the outer gate, the ward's corner turn and the offset inner gate each carry a group; one landing of the keep's stair and the keep-top are marked. The battlements stay unlit.",
    zones: [{ id: "court", min: [-30, 8, -40], max: [52, 108, 50] }],
    anchors: [
      ...pair((s, t) => S(`ramp-foot-${t}`, "stair", [[-33 + s * 8.5, 0, -108], [-33 + s * 9, 0, -107]], 4, { ground: true, essential: true })),
      // inside the outer gate, either side of its passage (the east side is the ward's walking line, so that group
      // stands back against the wall's foot)
      S("gate-w", "gate", [[-41, 8, -64], [-40, 8, -62.5]], 4, { essential: true }),
      S("gate-e", "gate", [[-26.5, 8, -69.5], [-25.5, 8, -70.5], [-38.5, 8, -70.5]], 4, { essential: true }),
      S("ward-corner", "gate", [[64, 8, -64], [62, 8, -66]], 4, { essential: true }),
      S("ward-east", "landing", [[76, 8, -30], [76, 8, -34]], 3),
      ...pair((s, t) => S(`inner-gate-${t}`, "gate", [[56, 8, -6 + s * 7], [54, 8, -6 + s * 7.5]], 4, { essential: true })),
      S("court", "court", [[20, 8, -26], [22, 8, -28]], 5, { zone: "court" }),
      S("keep-landing", "landing", [[2, 32, 4], [2, 32, 0]], 3, { zone: "court" }),
      S("keep-top", "summit", [[18, 80, 4], [16, 80, 16]], 5),
    ],
  },
  L10: {
    intent: "The west door is lit at the foot of its ramp and at its head; down the high nave, groups at the bases of every second pier pair draw the bays in perspective without lighting every arch; the crossing under the spire and the aisle-roof walk are marked.",
    zones: [{ id: "nave", min: [-30, 8, -100], max: [30, 128, 100] }],
    anchors: [
      ...pair((s, t) => S(`door-foot-${t}`, "stair", [[s * 12.5, 0, -140], [s * 13, 0, -139]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`door-${t}`, "entrance", [[s * 8, 8, -84], [s * 8, 8, -82]], 4, { essential: true })),
      ...pair((s, t) => S(`bay-2-${t}`, "interior", [[s * 7.5, 8, -48], [s * 7.5, 8, -46]], 4, { zone: "nave" })),
      ...pair((s, t) => S(`bay-4-${t}`, "interior", [[s * 7.5, 8, -8], [s * 7.5, 8, -6]], 4, { zone: "nave" })),
      ...pair((s, t) => S(`bay-6-${t}`, "interior", [[s * 7.5, 8, 32], [s * 7.5, 8, 34]], 4, { zone: "nave" })),
      S("apse", "interior", [[0, 8, 74], [2, 8, 72]], 5, { zone: "nave" }),
      S("roof-walk", "terrace", [[19, 41, -12], [19, 41, -18]], 3),
    ],
  },
  L11: {
    intent: "The front flight's foot and head are marked; the hall leads under the dome with two pairs, and the octagon beneath the dome carries groups at alternate corners; at the top, the lantern's viewing ring is the upper destination and carries its own group.",
    zones: [{ id: "octagon", min: [-40, 8, 0], max: [40, 145, 80] }],
    anchors: [
      ...pair((s, t) => S(`flight-foot-${t}`, "stair", [[s * 14.5, 0, -122], [s * 15, 0, -121]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`flight-head-${t}`, "landing", [[s * 9, 8, -72], [s * 9.5, 8, -70]], 4, { essential: true })),
      ...pair((s, t) => S(`hall-${t}`, "interior", [[s * 9, 8, -30], [s * 9, 8, -28]], 4)),
      ...pair((s, t) => S(`octagon-front-${t}`, "interior", [[s * 18, 8, 22], [s * 16, 8, 24]], 5, { zone: "octagon" })),
      ...pair((s, t) => S(`octagon-back-${t}`, "interior", [[s * 18, 8, 58], [s * 16, 8, 56]], 4, { zone: "octagon" })),
      S("lantern-ring", "summit", [[6, 128.6, 36], [-6, 128.6, 36]], 5),
    ],
  },
  L12: {
    intent: "The square is read by its corners: groups at the colonnades' inner ends and at the facade's main door, the steps before it marked at their foot; inside, the hall under the dome; one group in the colonnade between rows, not along all 128 columns.",
    zones: [{ id: "hall", min: [-75, 6, 46], max: [75, 154, 120] }],
    anchors: [
      ...pair((s, t) => S(`colonnade-end-${t}`, "court", [[s * 76, 0, -110], [s * 80, 0, -106]], 4, { ground: true })),
      ...pair((s, t) => S(`square-${t}`, "court", [[s * 28, 0, -40], [s * 30, 0, -38]], 5, { ground: true })),
      ...pair((s, t) => S(`steps-foot-${t}`, "stair", [[s * 23, 0, 16], [s * 24, 0, 17]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`door-${t}`, "entrance", [[s * 10, 6, 52], [s * 11, 6, 54]], 4, { essential: true })),
      ...pair((s, t) => S(`hall-${t}`, "interior", [[s * 20, 6, 86], [s * 22, 6, 88]], 5, { zone: "hall" })),
      S("colonnade", "colonnade", [[-124, 6, -26], [-124, 6, -6]], 3),
    ],
  },
  // ------------------------------------------------------------ D: Industrial Gorge
  L13: {
    intent: "The glasshouse's main hall is read along its length: the west end entrance, groups on the hall floor at every second bay's columns and the crossing under the transverse vault; the edge gallery carries two detached groups beside its columns. The wings stay dim.",
    zones: [{ id: "hall", min: [-160, 0, -26], max: [160, 96, 26] }],
    anchors: [
      // on the pad, inside its blend into the terrain (local |x| ≤ 166)
      ...pair((s, t) => S(`west-${t}`, "entrance", [[-164, 0, 8 + s * 10.5], [-163.4, 0, 8 + s * 11]], 5, { ground: true, essential: true })),
      ...pair((s, t) => S(`hall-w-${t}`, "interior", [[-104, 4, 8 + s * 10], [-102, 4, 8 + s * 10.5]], 4, { zone: "hall" })),
      ...pair((s, t) => S(`crossing-${t}`, "interior", [[s * 12, 4, 8 + s * 9.5], [s * 14, 4, 8 + s * 10]], 5, { zone: "hall" })),
      ...pair((s, t) => S(`hall-e-${t}`, "interior", [[104, 4, 8 + s * 10], [102, 4, 8 + s * 10.5]], 4, { zone: "hall" })),
      S("east", "entrance", [[164, 0, 18], [164, 0, -2]], 4, { ground: true }),
      D("gallery-w", "column", [[-120, 42.8, 22], [-116, 42.8, 22]], 3),
      D("gallery-e", "column", [[-70, 42.8, 22], [-66, 42.8, 22]], 3),
    ],
  },
  L14: {
    intent: "Between the legs, ground groups mark the way under the arches; the tower's major platforms (the first and the second) carry groups at their safe points' edges, and the summit ring is the destination.",
    anchors: [
      ...pair((s, t) => S(`legs-${t}`, "entrance", [[s * 13, 0, -28], [s * 14, 0, -26]], 4, { ground: true, essential: true })),
      S("legs-centre", "court", [[8, 0, 6], [-8, 0, 6]], 4, { ground: true }),
      S("platform-1", "platform", [[8, 64.5, -20], [-8, 64.5, -20]], 5, { essential: true }),
      S("platform-1b", "platform", [[-8, 64.5, -24], [8, 64.5, -24]], 3),
      S("platform-2", "platform", [[7, 112.5, -15.5], [-7, 112.5, -15.5]], 4, { essential: true }),
      S("summit", "summit", [[2.8, 176.5, 2.8], [-2.8, 176.5, -2.8]], 4),
    ],
  },
  L15: {
    intent: "The lobby entrance and the lobby are lit; each of the three principal setback terraces carries one group at its front, and the top terrace by the crown is the upper destination. The 44 floors between stay as they are.",
    zones: [{ id: "lobby", min: [-56, 0, -44], max: [56, 8, 44] }],
    anchors: [
      ...pair((s, t) => S(`lobby-door-${t}`, "entrance", [[s * 11, 0, -52], [s * 12, 0, -50]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`lobby-${t}`, "interior", [[s * 14, 0, -16], [s * 14, 0, -12]], 4, { ground: true, zone: "lobby" })),
      S("terrace-40", "terrace", [[10, 40.8, -40], [-10, 40.8, -40]], 5),
      S("terrace-120", "terrace", [[10, 120.5, -29], [-10, 120.5, -29]], 4),
      S("terrace-168", "summit", [[8, 168.5, -14], [-8, 168.5, -14]], 5),
    ],
  },
  L16: {
    intent: "Not the dam face: the toe's two banks by the stilling basin's channel, the powerhouse roof, the crest road's two ends and its middle by the intake towers. The curved wall stays a quiet mass.",
    anchors: [
      // the river is cut through the canyon floor below the training walls (local |x| < 30, water 0.5 m below the
      // pad): the toe's groups stand on its two dry banks, facing each other across the channel
      S("toe-w", "platform", [[-34.5, 0, 136], [-35, 0, 128]], 4, { ground: true, essential: true }),
      S("toe-e", "platform", [[34.5, 0, 136], [35, 0, 128]], 4, { ground: true, essential: true }),
      S("powerhouse", "platform", [[44, 32.5, 88], [60, 32.5, 88]], 4),
      // the crest road is slatted decking (D slats with gaps, the widest bearing 0.25 m): no cup can stand on it
      // without overhanging, so its candles float, clearly detached, at rail height over the road's downstream edge
      D("crest-w", "crest", [[-150.6, 151.4, 34.4], [-152.6, 151.4, 35.6], [-148.6, 151.4, 34.6]], 3, { essential: true, search: 1.6 }),
      D("crest-e", "crest", [[150.6, 151.4, 34.4], [152.6, 151.4, 35.6], [148.6, 151.4, 34.6]], 3, { essential: true, search: 1.6 }),
      D("crest-mid", "crest", [[0, 151.4, -8.6], [2, 151.4, -8.6]], 3, { search: 1.6 }),
      D("crest-towers-w", "crest", [[-58, 151.4, -3.2], [-56, 151.4, -3.6]], 3, { search: 1.6 }),
      D("crest-towers-e", "crest", [[58, 151.4, -3.2], [56, 151.4, -3.6]], 3, { search: 1.6 }),
    ],
  },
  // ------------------------------------------------------------ E: Contemporary Sea Cliffs
  L17: {
    intent: "The open lobby's columns carry groups at their bases on the plaza side; the three edge terraces at 16, 32 and 48 floors each carry one group, and the roof is the upper destination. No strip on every floor.",
    zones: [{ id: "lobby", min: [-36, 0, -24], max: [36, 12, 24] }],
    anchors: [
      ...pair((s, t) => S(`plaza-${t}`, "entrance", [[s * 12, 0, -40], [s * 13, 0, -38]], 4, { ground: true, essential: true })),
      ...pair((s, t) => S(`lobby-${t}`, "interior", [[s * 14, 0, -6], [s * 14, 0, 6]], 4, { ground: true, zone: "lobby" })),
      // the edge terraces are slatted (0.5 m boards, 0.57 m gaps) and their outer board carries the rail: a row along
      // the next board in, toward the corner (clear of the safe point at the terrace's middle)
      S("terrace-16", "terrace", [[14, 72, -26.67], [-14, 72, -26.67]], 3, { row: [1, 0], search: 0 }),
      S("terrace-32", "terrace", [[-14, 136, -26.67], [14, 136, -26.67]], 3, { row: [1, 0], search: 0 }),
      S("terrace-48", "terrace", [[14, 200, -26.67], [-14, 200, -26.67]], 3, { row: [1, 0], search: 0 }),
      S("roof", "summit", [[10, 220.5, -10], [-10, 220.5, -10]], 5),
    ],
  },
  L18: {
    intent: "The base entrance in tube B's north face is lit; each of the four roof stages where tubes terminate carries a group (the climb's waypoints), the highest beside the antenna bundles. The facades stay dark.",
    anchors: [
      ...pair((s, t) => S(`base-${t}`, "entrance", [[s * 9, 0, -52], [s * 10, 0, -50]], 4, { ground: true, essential: true })),
      S("roof-A", "terrace", [[-38, 129, -38], [-22, 129, -38]], 4),
      S("roof-C", "terrace", [[38, 177, -38], [22, 177, -38]], 4),
      S("roof-D", "terrace", [[-38, 225, 8], [-22, 225, 8]], 4),
      // the highest stage: on the equipment top of tube B (a solid block under the antenna bundle), away from the antenna
      S("roof-B", "summit", [[-7, 253, -36], [-7, 253, -24]], 4, { shells: true }),
    ],
  },
  L19: {
    intent: "The diagonal route through the base is lit at both ends and at its middle; the four crown platforms, where the prisms end, each carry a small group as the climb's destinations.",
    anchors: [
      S("diagonal-sw", "entrance", [[-50, 0, 42], [-42, 0, 50]], 4, { ground: true, essential: true }),
      S("diagonal-ne", "entrance", [[50, 0, -42], [42, 0, -50]], 4, { ground: true, essential: true }),
      S("base-centre", "court", [[8, 0, 8], [-8, 0, -8]], 3, { ground: true }),
      S("platform-W", "platform", [[-6, 168.5, 2.2], [-3.5, 168.5, -2.2]], 3),
      S("platform-S", "platform", [[2.2, 200.5, 6.5], [-2.2, 200.5, 3.5]], 3),
      S("platform-N", "platform", [[-2.2, 232.5, -6.5], [2.2, 232.5, -3.5]], 3),
      S("platform-E", "summit", [[6.5, 264.5, 2.2], [3.5, 264.5, -2.2]], 3),
    ],
  },
  L20: {
    intent: "The plaza and the entrance at wing A's nose are lit; of the twelve rotating setback terraces, four (1, 4, 7 and 10, one every turn) carry groups so the spiral is legible without a strip on every floor; the top platform below the spire is the upper destination.",
    anchors: [
      ...pair((s, t) => S(`plaza-${t}`, "entrance", [[s * 9, 0, -100], [s * 10, 0, -98]], 4, { ground: true, essential: true })),
      // the setback roofs are timber decks over plank-finish infill shells (the recipe's solid roof below the deck)
      S("terrace-1", "terrace", [[4, 32.5, -74], [-4, 32.5, -74]], 4, { shells: true }),
      // these three terraces are where a flight up the spiral starts (it leaves from the safe point at the middle):
      // the groups stand at the deck's sides, clear of that walking band
      S("terrace-4", "terrace", [[6.4, 104.5, -71], [-6.4, 104.5, -71]], 4, { search: 1.2, shells: true }),
      // the flight leaves toward +x: the group stands on the deck's −x side
      // the upper terraces narrow to ~8 m and both of their flights cross the deck: no spot keeps a cup off a walking
      // line, so their groups hover, detached, off the deck's outer nose (beyond its rail, in clear air)
      D("terrace-7", "terrace", [[0, 177.6, -66.6], [0, 177.6, -67.4]], 3, { search: 1.2 }),
      D("terrace-10", "terrace", [[0, 249.6, -58.6], [0, 249.6, -59.4]], 3, { search: 1.2 }),
      S("platform", "summit", [[8, 296.5, -12], [-8, 296.5, -12]], 5, { shells: true }),
      S("platform-b", "summit", [[-10, 296.5, 8], [10, 296.5, 8]], 3, { shells: true }),
    ],
  },
};
