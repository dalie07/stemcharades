import { useSettings } from "../state/settings";

/**
 * Game feedback: short synthesised sounds and phone vibration. Sounds are generated with the Web Audio API, so
 * there are no audio files to download and they work offline. Both respect the player's settings, and every
 * call is safe on browsers that support neither.
 */

export type Cue = "start" | "tick" | "correct" | "close" | "wrong" | "timeup" | "combo" | "reveal";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft note: a sine or triangle wave with a quick attack and a gentle fade, like a xylophone. */
function note(ac: AudioContext, freq: number, start: number, length: number, type: OscillatorType = "triangle", volume = 0.18) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  gain.gain.setValueAtTime(0, ac.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ac.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + length + 0.05);
}

const SOUNDS: Record<Cue, (ac: AudioContext) => void> = {
  start: (ac) => [523, 659, 784].forEach((f, i) => note(ac, f, i * 0.08, 0.25)),
  tick: (ac) => note(ac, 1200, 0, 0.05, "square", 0.05),
  correct: (ac) => [659, 880, 1175].forEach((f, i) => note(ac, f, i * 0.07, 0.3)),
  close: (ac) => [587, 659].forEach((f, i) => note(ac, f, i * 0.09, 0.22, "sine")),
  wrong: (ac) => note(ac, 196, 0, 0.18, "sine", 0.12),
  timeup: (ac) => [392, 330, 262].forEach((f, i) => note(ac, f, i * 0.12, 0.3, "sine", 0.16)),
  combo: (ac) => [784, 988, 1175, 1568].forEach((f, i) => note(ac, f, i * 0.06, 0.25)),
  reveal: (ac) => [523, 784].forEach((f, i) => note(ac, f, i * 0.1, 0.35, "sine", 0.12)),
};

const BUZZ: Partial<Record<Cue, number | number[]>> = {
  correct: [40, 40, 60],
  combo: [30, 30, 30, 30, 80],
  timeup: 180,
  tick: 15,
};

/** Play the cue's sound and vibration, each only if the player has it switched on. */
export function cue(name: Cue): void {
  const { sound, vibration } = useSettings.getState();
  if (sound) {
    const ac = audio();
    if (ac) SOUNDS[name](ac);
  }
  const pattern = BUZZ[name];
  if (vibration && pattern !== undefined && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not allowed here: ignore */
    }
  }
}
