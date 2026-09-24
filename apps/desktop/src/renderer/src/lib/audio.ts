import type { HubEvent } from "@fll-sim/sim";

// Hub speaker: plays beep events through Web Audio.
let ctx: AudioContext | null = null;
let current: OscillatorNode | null = null;

const WAVE: Record<number, OscillatorType> = { 1: "sine", 2: "square", 3: "sawtooth" };

export function playHubEvents(events: HubEvent[], speed: number) {
  for (const e of events) {
    if (e.type === "sound_stop") {
      current?.stop();
      current = null;
      continue;
    }
    ctx ??= new AudioContext();
    current?.stop();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = WAVE[e.waveform] ?? "sine";
    osc.frequency.value = e.freq;
    gain.gain.value = (e.volume / 100) * 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + Math.min(e.durationMs, 60000) / 1000 / speed);
    current = osc;
  }
}
