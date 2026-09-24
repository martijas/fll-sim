// SPIKE Prime hub: 5x5 light matrix, lights, buttons, speaker. Pure state machine
// advanced by the simulation clock; the UI renders from `pixels`, `lights`, and sound events.

// Images 1..67 in hub.light_matrix order (IMAGE_HEART = 1 ...). Rows top->bottom, '9' = on.
// Patterns follow the micro:bit image set that the SPIKE images are based on.
const IMG: string[] = [
  "09090:99999:99999:09990:00900", // 1 HEART
  "00000:09090:09990:00900:00000", // 2 HEART_SMALL
  "00000:09090:00000:90009:09990", // 3 HAPPY
  "00000:00000:00000:90009:09990", // 4 SMILE
  "00000:09090:00000:09990:90009", // 5 SAD
  "00000:09090:00000:09090:90909", // 6 CONFUSED
  "90009:09090:00000:99999:90909", // 7 ANGRY
  "00000:99099:00000:09990:00000", // 8 ASLEEP
  "09090:00000:00900:09090:00900", // 9 SURPRISED
  "90009:00000:99999:00909:00999", // 10 SILLY
  "99999:99099:00000:09090:09990", // 11 FABULOUS
  "09090:00000:00090:00900:09000", // 12 MEH
  "00000:00009:00090:90900:09000", // 13 YES
  "90009:09090:00900:09090:90009", // 14 NO
  "00900:00900:00900:00000:00000", // 15 CLOCK12
  "00090:00090:00900:00000:00000", // 16 CLOCK1
  "00000:00099:00900:00000:00000", // 17 CLOCK2
  "00000:00000:00999:00000:00000", // 18 CLOCK3
  "00000:00000:00900:00099:00000", // 19 CLOCK4
  "00000:00000:00900:00090:00090", // 20 CLOCK5
  "00000:00000:00900:00900:00900", // 21 CLOCK6
  "00000:00000:00900:09000:09000", // 22 CLOCK7
  "00000:00000:00900:99000:00000", // 23 CLOCK8
  "00000:00000:99900:00000:00000", // 24 CLOCK9
  "00000:99000:00900:00000:00000", // 25 CLOCK10
  "09000:09000:00900:00000:00000", // 26 CLOCK11
  "00900:09990:90909:00900:00900", // 27 ARROW_N
  "00999:00099:00909:09000:90000", // 28 ARROW_NE
  "00900:00090:99999:00090:00900", // 29 ARROW_E
  "90000:09000:00909:00099:00999", // 30 ARROW_SE
  "00900:00900:90909:09990:00900", // 31 ARROW_S
  "00009:00090:90900:99000:99900", // 32 ARROW_SW
  "00900:09000:99999:09000:00900", // 33 ARROW_W
  "99900:99000:90900:00090:00009", // 34 ARROW_NW
  "00900:00090:99999:00090:00900", // 35 GO_RIGHT
  "00900:09000:99999:09000:00900", // 36 GO_LEFT
  "00900:09990:99999:00000:00000", // 37 GO_UP
  "00000:00000:99999:09990:00900", // 38 GO_DOWN
  "00000:00900:09090:99999:00000", // 39 TRIANGLE
  "90000:99000:90900:90090:99999", // 40 TRIANGLE_LEFT
  "09090:90909:09090:90909:09090", // 41 CHESSBOARD
  "00900:09090:90009:09090:00900", // 42 DIAMOND
  "00000:00900:09090:00900:00000", // 43 DIAMOND_SMALL
  "99999:90009:90009:90009:99999", // 44 SQUARE
  "00000:09990:09090:09990:00000", // 45 SQUARE_SMALL
  "90900:90900:99990:99090:99990", // 46 RABBIT
  "90009:90009:99999:09990:00900", // 47 COW
  "00900:00900:00900:99900:99900", // 48 MUSIC_CROTCHET
  "00900:00990:00909:99900:99900", // 49 MUSIC_QUAVER
  "09999:09009:09009:99099:99099", // 50 MUSIC_QUAVERS
  "90909:90909:99999:00900:00900", // 51 PITCHFORK
  "00900:09990:00900:09990:99999", // 52 XMAS
  "09999:99090:99900:99990:09999", // 53 PACMAN
  "00900:09990:99099:09990:00900", // 54 TARGET
  "99099:99999:09990:09990:09990", // 55 TSHIRT
  "00990:00990:99999:99999:09090", // 56 ROLLERSKATE
  "09900:99900:09999:09990:00000", // 57 DUCK
  "00900:09990:99999:09990:09090", // 58 HOUSE
  "00000:09990:99999:09090:00000", // 59 TORTOISE
  "99099:99999:00900:99999:99099", // 60 BUTTERFLY
  "00900:99999:00900:09090:90009", // 61 STICKFIGURE
  "99999:90909:99999:99999:90909", // 62 GHOST
  "00900:00900:00900:09990:00900", // 63 SWORD
  "99000:09000:09000:09990:09090", // 64 GIRAFFE
  "09990:90909:99999:09990:09990", // 65 SKULL
  "09990:99999:00900:90900:09900", // 66 UMBRELLA
  "99000:99099:09090:09990:00000", // 67 SNAKE
];

export function imagePixels(id: number): number[] {
  const s = IMG[id - 1];
  if (!s) throw new RangeError(`image id ${id} out of range 1..67`);
  return s.replace(/:/g, "").split("").map((c) => (c === "9" ? 100 : 0));
}

// 5x5 font: each glyph is 5 rows of variable width (columns), '1' = on.
const FONT: Record<string, string> = {
  " ": "000:000:000:000:000", "!": "1:1:1:0:1", '"': "101:101:000:000:000", "#": "01010:11111:01010:11111:01010",
  "'": "1:1:0:0:0", "(": "01:10:10:10:01", ")": "10:01:01:01:10", "*": "000:101:010:101:000", "+": "000:010:111:010:000",
  ",": "00:00:00:01:10", "-": "000:000:111:000:000", ".": "0:0:0:0:1", "/": "001:001:010:100:100",
  ":": "0:1:0:1:0", ";": "00:01:00:01:10", "<": "001:010:100:010:001", "=": "000:111:000:111:000", ">": "100:010:001:010:100",
  "?": "111:001:010:000:010", "_": "000:000:000:000:111",
  "0": "0110:1001:1001:1001:0110", "1": "010:110:010:010:111", "2": "1110:0001:0110:1000:1111", "3": "1110:0001:0110:0001:1110",
  "4": "0010:0110:1010:1111:0010", "5": "1111:1000:1110:0001:1110", "6": "0110:1000:1110:1001:0110", "7": "1111:0001:0010:0100:0100",
  "8": "0110:1001:0110:1001:0110", "9": "0110:1001:0111:0001:0110",
  A: "0110:1001:1111:1001:1001", B: "1110:1001:1110:1001:1110", C: "0111:1000:1000:1000:0111", D: "1110:1001:1001:1001:1110",
  E: "1111:1000:1110:1000:1111", F: "1111:1000:1110:1000:1000", G: "0111:1000:1011:1001:0111", H: "1001:1001:1111:1001:1001",
  I: "111:010:010:010:111", J: "0011:0001:0001:1001:0110", K: "1001:1010:1100:1010:1001", L: "1000:1000:1000:1000:1111",
  M: "10001:11011:10101:10001:10001", N: "1001:1101:1011:1001:1001", O: "0110:1001:1001:1001:0110", P: "1110:1001:1110:1000:1000",
  Q: "0110:1001:1001:1010:0101", R: "1110:1001:1110:1010:1001", S: "0111:1000:0110:0001:1110", T: "11111:00100:00100:00100:00100",
  U: "1001:1001:1001:1001:0110", V: "10001:10001:10001:01010:00100", W: "10001:10001:10101:11011:10001", X: "1001:1001:0110:1001:1001",
  Y: "10001:01010:00100:00100:00100", Z: "1111:0010:0100:1000:1111",
};

function glyph(ch: string): number[][] {
  const g = FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT["?"];
  return g.split(":").map((row) => row.split("").map((c) => (c === "1" ? 1 : 0)));
}

/** Columns (each a 5-array, top->bottom) for scrolling `text`, with 1-column gaps. */
export function textColumns(text: string): number[][] {
  const cols: number[][] = [];
  for (const ch of text) {
    const g = glyph(ch);
    const w = g[0].length;
    for (let x = 0; x < w; x++) cols.push([0, 1, 2, 3, 4].map((y) => g[y][x]));
    cols.push([0, 0, 0, 0, 0]);
  }
  return cols;
}

/** Centre a single glyph on the 5x5 matrix. */
function glyphPixels(ch: string, intensity: number): number[] {
  const g = glyph(ch);
  const w = g[0].length;
  const off = Math.floor((5 - w) / 2);
  const px = new Array(25).fill(0);
  for (let y = 0; y < 5; y++) for (let x = 0; x < w; x++) if (g[y][x]) px[y * 5 + x + off] = intensity;
  return px;
}

export interface BeepEvent { t: number; freq: number; durationMs: number; volume: number; waveform: number }

export type HubEvent =
  | { type: "beep"; t: number; freq: number; durationMs: number; volume: number; waveform: number }
  | { type: "sound_stop"; t: number };

export class HubState {
  /** Raw pixel intensities (0..100) in matrix coordinates before orientation. */
  private raw: number[] = new Array(25).fill(0);
  orientation = 0; // 0 up, 1 right, 2 down, 3 left
  lights: Record<number, number> = { 0: 10, 1: 3 }; // POWER white, CONNECT blue
  volume = 100;
  /** ms timestamp when each button was pressed, or -1. */
  buttonDown: Record<number, number> = { 1: -1, 2: -1 };
  events: HubEvent[] = [];
  private write: { id: number; cols: number[][]; intensity: number; tpc: number; start: number; single: boolean } | null = null;
  private beepEnd: { id: number; t: number } | null = null;
  private statuses = new Map<number, number>();
  private allocId: () => number;

  constructor(allocId: () => number) {
    this.allocId = allocId;
  }

  get pixels(): number[] {
    // Apply orientation: rotate the raw image so `orientation` side is up.
    const out = new Array(25).fill(0);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        let sx = x, sy = y;
        switch (this.orientation) {
          case 1: sx = y; sy = 4 - x; break;
          case 2: sx = 4 - x; sy = 4 - y; break;
          case 3: sx = 4 - y; sy = x; break;
        }
        out[y * 5 + x] = this.raw[sy * 5 + sx];
      }
    return out;
  }

  status(id: number) {
    return this.statuses.get(id) ?? 0;
  }

  private cancelWrite() {
    if (this.write) {
      this.statuses.set(this.write.id, 0);
      this.write = null;
    }
  }

  show(pixels: number[]) {
    this.cancelWrite();
    for (let i = 0; i < 25; i++) this.raw[i] = Math.max(0, Math.min(100, Math.round(pixels[i] ?? 0)));
  }
  showImage(id: number) {
    this.show(imagePixels(id));
  }
  clear() {
    this.show(new Array(25).fill(0));
  }
  setPixel(x: number, y: number, v: number) {
    this.cancelWrite();
    if (x < 0 || x > 4 || y < 0 || y > 4) throw new RangeError("pixel out of range");
    this.raw[y * 5 + x] = Math.max(0, Math.min(100, Math.round(v)));
  }
  getPixel(x: number, y: number) {
    return this.raw[y * 5 + x];
  }

  startWrite(t: number, text: string, intensity: number, tpc: number): number {
    this.cancelWrite();
    const id = this.allocId();
    const s = String(text);
    this.statuses.set(id, 1);
    if (s.length === 1) {
      this.raw = glyphPixels(s, intensity);
      this.statuses.set(id, 0);
      return id;
    }
    this.write = { id, cols: textColumns(s), intensity, tpc: Math.max(1, tpc), start: t, single: false };
    return id;
  }

  beep(t: number, freq: number, durationMs: number, volume: number, waveform: number): number {
    const id = this.allocId();
    this.events.push({ type: "beep", t, freq, durationMs, volume: Math.round((volume * this.volume) / 100), waveform });
    if (this.beepEnd) this.statuses.set(this.beepEnd.id, 0);
    this.beepEnd = { id, t: t + durationMs };
    this.statuses.set(id, 1);
    return id;
  }
  stopSound(t: number) {
    this.events.push({ type: "sound_stop", t });
    if (this.beepEnd) {
      this.statuses.set(this.beepEnd.id, 0);
      this.beepEnd = null;
    }
  }

  /** Advance to time t (ms). */
  update(t: number) {
    if (this.beepEnd && t >= this.beepEnd.t) {
      this.statuses.set(this.beepEnd.id, 0);
      this.beepEnd = null;
    }
    const w = this.write;
    if (!w) return;
    // Scroll: each character occupies ~ tpc ms; move one column per (tpc / glyph pitch).
    const colMs = w.tpc / 5;
    const total = w.cols.length + 5; // scroll fully off the left edge
    const step = Math.floor((t - w.start) / colMs);
    if (step >= total) {
      this.raw.fill(0);
      this.statuses.set(w.id, 0);
      this.write = null;
      return;
    }
    for (let x = 0; x < 5; x++) {
      const c = step + x - 5; // starts off the right edge
      const col = c >= 0 && c < w.cols.length ? w.cols[c] : [0, 0, 0, 0, 0];
      for (let y = 0; y < 5; y++) this.raw[y * 5 + x] = col[y] ? w.intensity : 0;
    }
  }

  buttonPressedMs(button: number, t: number): number {
    const d = this.buttonDown[button];
    return d === undefined || d < 0 ? 0 : Math.max(1, t - d);
  }
}
