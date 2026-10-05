// Versioned configuration. Every tunable starting value lives here, not as a
// scattered magic number (brief §15). Physics values that change how a saved
// world steps are frozen per `physicsConfigVersion`: a work records the version
// (and the full values) it was created with, so tuning a new version cannot
// silently collapse an old tower on its next load.

export interface PhysicsConfig {
  readonly physicsConfigVersion: number;
  readonly stick: { readonly length: number; readonly width: number; readonly height: number; readonly mass: number };
  readonly table: { readonly radius: number; readonly thickness: number; readonly top: number };
  /**
   * null = one Rapier cylinder for the whole table. Otherwise a cylinder of
   * `innerRadius` plus a flush triangle-mesh ring out to the table radius as
   * a regular `segments`-gon, which the renderer draws identically (M-005).
   */
  readonly tableRim: { readonly innerRadius: number; readonly segments: number } | null;
  readonly gravity: readonly [number, number, number];
  readonly fixedStep: number;
  readonly maxCatchUpSteps: number;
  readonly friction: number;
  readonly restitution: number;
  /** Rapier CoefficientCombineRule name, applied to both friction and restitution. */
  readonly combineRule: "Average" | "Min" | "Multiply" | "Max";
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly solverIterations: number;
  readonly ccd: boolean;
  readonly maxCcdSubsteps: number;
  /** Rapier length unit: the engine scales its internal tolerances by this. */
  readonly lengthUnit: number;
  readonly stableLinear: number;
  readonly stableAngular: number;
  readonly stableSeconds: number;
  readonly placementGap: number;
  readonly penetrationTolerance: number;
  readonly placementBounds: { readonly minY: number; readonly maxY: number; readonly radius: number };
  readonly removalBounds: { readonly belowY: number; readonly radius: number };
  /** Push impulse magnitude = mass × this (u/s). */
  readonly pushSpeed: number;
  /** Contact force threshold for collision sound events. */
  readonly soundForceThreshold: number;
}

/** Immutable registry: never edit a published version, add a new one. */
export const PHYSICS_CONFIGS: Readonly<Record<number, PhysicsConfig>> = ({
  1: Object.freeze({
    physicsConfigVersion: 1,
    stick: { length: 8, width: 1, height: 1, mass: 1 },
    table: { radius: 18, thickness: 2, top: 0 },
    gravity: [0, -30, 0],
    fixedStep: 1 / 60,
    maxCatchUpSteps: 4,
    friction: 0.8,
    restitution: 0.02,
    combineRule: "Average",
    linearDamping: 0.05,
    angularDamping: 0.15,
    solverIterations: 8,
    ccd: true,
    maxCcdSubsteps: 2,
    lengthUnit: 1,
    stableLinear: 0.03,
    stableAngular: 0.02,
    stableSeconds: 1.5,
    placementGap: 0.005,
    penetrationTolerance: 0.002,
    placementBounds: { minY: 0, maxY: 80, radius: 22 },
    removalBounds: { belowY: -20, radius: 60 },
    pushSpeed: 3,
    soundForceThreshold: 40,
    tableRim: null,
  } satisfies PhysicsConfig),
});

/**
 * v2 (2026-10-05): under v1 a stick lying across the table's curved rim with
 * another resting on it never settled: it pulsed at ~0.5–1.7 u/s, crept
 * outward and kept the whole island awake. The cylinder's rim contact was the
 * cause. v2 keeps a cylinder for the middle and makes the outer 1.5 u a flush
 * 128-sided triangle-mesh ring: the rim case settles in 2 s at near-cylinder
 * cost (M-005). Everything else is unchanged from v1.
 */
(PHYSICS_CONFIGS as Record<number, PhysicsConfig>)[2] = Object.freeze({
  ...PHYSICS_CONFIGS[1]!,
  physicsConfigVersion: 2,
  tableRim: Object.freeze({ innerRadius: 16.5, segments: 128 }),
});
Object.freeze(PHYSICS_CONFIGS);

export const CURRENT_PHYSICS_CONFIG_VERSION = 2;
export const currentPhysicsConfig = (): PhysicsConfig => PHYSICS_CONFIGS[CURRENT_PHYSICS_CONFIG_VERSION]!;

export const SNAPSHOT_SCHEMA_VERSION = 1;
/** The exact pinned engine; stored with every saved state. */
export const ENGINE_VERSION = "rapier3d-compat@0.19.3";

export const LIMITS = Object.freeze({
  sticksPerWork: 200,
  editorSeatsPerRoom: 4,
  activeRooms: 3,
  ownedWorksPerAccount: 20,
  favoritesPerAccount: 100,
  exhibitsPerWork: 30,
  namedVersionsPerWork: 30,
  recoveryPointsPerWork: 10,
  titleChars: 80,
  descriptionChars: 500,
  displayNameChars: 40,
  inviteDays: 7,
  inviteMaxUses: 3,
  /** Reject new durable writes once free space on the data volume drops below this. */
  storageReserveBytes: 50 * 1024 * 1024,
});

export const TRANSPORT = Object.freeze({
  previewHz: 15,
  frameHz: 20,
  checkpointMs: 500,
  emptyRoomSettleMs: 10_000,
  /** A settled room with nobody connected stays loaded this long (no stepping) before unloading. */
  emptyRoomIdleMs: 30_000,
  pushOwnerGraceMs: 10_000,
  pushSelectIdleMs: 60_000,
  heartbeatMs: 5_000,
  heartbeatStaleMs: 15_000,
  freshTicks: 120,
  ephemeralPerSecond: 20,
  ephemeralBurst: 10,
  commandsPerSecond: 2,
  commandBurst: 4,
  roomQueueMax: 16,
  inboundMaxBytes: 16 * 1024,
  coalesceBufferedBytes: 256 * 1024,
  closeBufferedBytes: 1024 * 1024,
  interpolationDelayMs: 100,
  reconnectBackoffMs: [500, 1000, 2000, 4000, 8000],
});

export const INPUT = Object.freeze({
  translateStep: 0.1,
  translateFine: 0.02,
  angleStepDeg: 5,
  angleFineDeg: 1,
  snapAcquireDeg: 3,
  snapReleaseDeg: 5,
  supportSnapMax: 0.2,
  parallelRayThreshold: 0.08,
  /** Max world movement per pointer event when falling back to screen projection. */
  parallelMaxStep: 0.5,
});

export const AUTH = Object.freeze({
  // OWASP-listed scrypt option N=2^15, r=8, p=3 (32 MiB per hash). The
  // initial N=2^16, p=2 (64 MiB) pushed peak RSS to 234 MiB of 256 under
  // concurrent logins (M-004). Hashes carry their parameters, so older ones
  // still verify; maxmem leaves room for that.
  scrypt: { N: 32768, r: 8, p: 3, keyLen: 64, maxmem: 96 * 1024 * 1024 },
  hashConcurrency: 1,
  hashQueue: 8,
  sessionAbsoluteMs: 30 * 24 * 3600 * 1000,
  sessionIdleMs: 7 * 24 * 3600 * 1000,
  lastSeenWriteMs: 15 * 60 * 1000,
  passwordMin: 12,
  passwordMax: 128,
  passwordMaxBytes: 1024,
  /**
   * Abuse limits as [burst, refill per minute]. The bounded hash queue is what
   * protects memory; these stop scripted guessing and mass sign-up.
   */
  rate: {
    loginPerHandle: [10, 10],
    failedLoginPerIp: [30, 30],
    registerPerIp: [60, 20],
    recoverPerHandle: [5, 5],
    invitePreviewPerIp: [60, 60],
  } as Record<string, [number, number]>,
});
