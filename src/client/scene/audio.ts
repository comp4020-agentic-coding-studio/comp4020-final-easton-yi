// Collision sounds (LOOK-03): a short filtered-noise knock whose loudness and
// brightness follow the authoritative contact strength. Audio starts only
// after a user gesture, plays at most 6 voices and ~25 knocks/s, and has no
// background loop. The mute choice is a per-browser preference.
const MAX_VOICES = 6;
let ctx: AudioContext | null = null;
let voices = 0;
let lastAt = 0;
const heard = new Set<string>();
let muted = (() => {
  try {
    return localStorage.getItem("stillwood.muted") === "1";
  } catch {
    return false;
  }
})();

export const isMuted = (): boolean => muted;
export const setMuted = (m: boolean): void => {
  muted = m;
  try {
    localStorage.setItem("stillwood.muted", m ? "1" : "0");
  } catch {
    // storage may be unavailable; the choice still applies this session
  }
};

/** Call from a user gesture handler. */
export const unlockAudio = (): void => {
  if (ctx || muted) return;
  try {
    ctx = new AudioContext();
  } catch {
    ctx = null;
  }
};

export function knock(eventId: string, strength: number): void {
  if (muted || !ctx || heard.has(eventId)) return;
  heard.add(eventId);
  if (heard.size > 500) heard.clear();
  const now = ctx.currentTime;
  if (voices >= MAX_VOICES || now - lastAt < 0.04) return;
  lastAt = now;
  voices++;
  const level = Math.min(1, Math.log10(1 + strength / 40) / 2.2);
  const dur = 0.08 + level * 0.12;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * dur * 0.18));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 500 + level * 1400;
  filter.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.value = 0.05 + level * 0.35;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.onended = () => {
    voices--;
    src.disconnect();
    gain.disconnect();
  };
  src.start();
}
