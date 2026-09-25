// Calibration kit: short SPIKE Python programs the team runs on the real robot (the SPIKE App runs
// Python projects even for teams that code in Word Blocks), then pastes the console output back
// here. The same programs run in the simulator, and comparing the two sets of numbers gives the
// corrections for the simulated robot (effective wheel size, turning width, colour sensor).
import type { ColorCalibration } from "@fll-sim/sim";
import type { RobotConfig } from "./robotConfig";

export type CalTestId = "drive" | "spin" | "speed" | "coast" | "color";

export interface CalTest {
  id: CalTestId;
  title: string;
  /** what to do on the real table */
  howTo: string;
  python: string;
  /** can run in the simulator unattended */
  simulated: boolean;
}

const header = (c: RobotConfig) => `# FLL Sim calibration program: run it on your robot and copy the console output back.
from hub import port, light_matrix, motion_sensor, button
import motor, motor_pair, runloop, time
import color_sensor

L, R = port.${c.leftPort}, port.${c.rightPort}

def sample(tag, t0):
    print("CAL,%s,%d,%d,%d,%d,%d,%d" % (tag, time.ticks_diff(time.ticks_ms(), t0), motor.relative_position(L), motor.relative_position(R), motion_sensor.tilt_angles()[0], motor.velocity(L), motor.velocity(R)))

def reset():
    motor_pair.pair(motor_pair.PAIR_1, L, R)
    motor.reset_relative_position(L, 0)
    motor.reset_relative_position(R, 0)
    motion_sensor.reset_yaw(0)
`;

/** The calibration programs for this robot's ports. */
export function calibrationTests(c: RobotConfig): CalTest[] {
  const colorPorts = c.colorPorts.map((p) => `port.${p}`).join(", ");
  return [
    {
      id: "drive",
      title: "1. Drive straight",
      howTo: "Mark where the robot's front is, run the program, then measure how far the front moved (mm) and enter it below.",
      simulated: true,
      python: header(c) + `
async def main():
    reset()
    await runloop.sleep_ms(300)
    t0 = time.ticks_ms()
    motor_pair.move_for_degrees(motor_pair.PAIR_1, 1080, 0, velocity=360)
    for i in range(90):
        sample("drive", t0)
        await runloop.sleep_ms(50)
    sample("drive-end", t0)

runloop.run(main())
`,
    },
    {
      id: "spin",
      title: "2. Spin in place",
      howTo: "Put the robot in open space and run the program; it spins about 1.5 turns. Nothing to measure: the gyro does it.",
      simulated: true,
      python: header(c) + `
async def main():
    reset()
    await runloop.sleep_ms(300)
    t0 = time.ticks_ms()
    motor_pair.move_tank_for_degrees(motor_pair.PAIR_1, 1080, 360, -360)
    for i in range(110):
        sample("spin", t0)
        await runloop.sleep_ms(40)
    sample("spin-end", t0)

runloop.run(main())
`,
    },
    {
      id: "speed",
      title: "3. Top speed",
      howTo: "Leave about 1.5 m of room in front of the robot; it drives flat out for 1.5 s.",
      simulated: true,
      python: header(c) + `
async def main():
    reset()
    await runloop.sleep_ms(300)
    t0 = time.ticks_ms()
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=1000)
    for i in range(75):
        sample("speed", t0)
        await runloop.sleep_ms(20)
    motor_pair.stop(motor_pair.PAIR_1, stop=motor.BRAKE)

runloop.run(main())
`,
    },
    {
      id: "coast",
      title: "4. Coast to a stop",
      howTo: "Leave about 1 m of room; the robot drives for 1.5 s, then the motors let go and it rolls to a stop.",
      simulated: true,
      python: header(c) + `
async def main():
    reset()
    await runloop.sleep_ms(300)
    t0 = time.ticks_ms()
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=700)
    await runloop.sleep_ms(1500)
    sample("coast-stop", t0)
    motor_pair.stop(motor_pair.PAIR_1, stop=motor.COAST)
    for i in range(60):
        sample("coast", t0)
        await runloop.sleep_ms(25)

runloop.run(main())
`,
    },
    {
      id: "color",
      title: "5. Colour sensor: white and black",
      howTo: "Start with the colour sensor(s) over the white launch area. When the arrow shows, move the robot so the sensor(s) are over a thick black line and press the right button.",
      simulated: false,
      python: header(c) + `
SENSORS = [${colorPorts}]

async def main():
    for i in range(10):
        print("CAL,white," + ",".join(str(color_sensor.reflection(p)) for p in SENSORS))
        await runloop.sleep_ms(50)
    light_matrix.show_image(light_matrix.IMAGE_ARROW_E)
    while not button.pressed(button.RIGHT):
        await runloop.sleep_ms(20)
    light_matrix.clear()
    await runloop.sleep_ms(500)
    for i in range(10):
        print("CAL,black," + ",".join(str(color_sensor.reflection(p)) for p in SENSORS))
        await runloop.sleep_ms(50)

runloop.run(main())
`,
    },
  ];
}

// ---- reading the output ---------------------------------------------------------------------------
export interface Sample { t: number; l: number; r: number; yaw: number; vl: number; vr: number }
export interface CalLog { byTag: Map<string, Sample[]>; white: number[][]; black: number[][] }

/** Parse pasted console output (anything that isn't a "CAL," line is ignored). */
export function parseCalLog(text: string): CalLog {
  const byTag = new Map<string, Sample[]>();
  const white: number[][] = [], black: number[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const i = raw.indexOf("CAL,");
    if (i < 0) continue;
    const f = raw.slice(i).trim().split(",");
    if (f[1] === "white" || f[1] === "black") {
      const vals = f.slice(2).map(Number).filter((v) => Number.isFinite(v));
      (f[1] === "white" ? white : black).push(vals);
      continue;
    }
    const n = f.slice(2).map(Number);
    if (n.length < 6 || n.some((v) => !Number.isFinite(v))) continue;
    const s: Sample = { t: n[0], l: n[1], r: n[2], yaw: n[3], vl: n[4], vr: n[5] };
    (byTag.get(f[1]) ?? byTag.set(f[1], []).get(f[1])!).push(s);
  }
  return { byTag, white, black };
}

// ---- analysis -------------------------------------------------------------------------------------
export interface CalMetrics {
  /** drive: average wheel degrees and heading drift */
  driveDeg?: number;
  driveYawDeg?: number;
  /** drive distance (mm): measured on the table, or the simulator's own */
  driveMm?: number;
  /** effective wheel diameter from the drive test (mm) */
  wheelMm?: number;
  /** spin: how far the robot turned (deg) for the wheel degrees */
  spinDeg?: number;
  spinWheelDeg?: number;
  /** effective turning width (wheel centre to wheel centre, mm) */
  trackMm?: number;
  /** top speed (deg/s) and time to reach 90 % of it (ms) */
  topSpeed?: number;
  t90?: number;
  /** wheel degrees rolled after the motors let go */
  coastDeg?: number;
  /** colour reflections per sensor */
  white?: number[];
  black?: number[];
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export function metrics(log: CalLog, driveMm?: number): CalMetrics {
  const m: CalMetrics = {};
  const avgDeg = (s: Sample) => (Math.abs(s.l) + Math.abs(s.r)) / 2;
  const drive = log.byTag.get("drive-end")?.at(-1) ?? log.byTag.get("drive")?.at(-1);
  if (drive) {
    m.driveDeg = avgDeg(drive);
    m.driveYawDeg = drive.yaw / 10;
    if (driveMm && driveMm > 0) {
      m.driveMm = driveMm;
      m.wheelMm = driveMm / ((m.driveDeg / 360) * Math.PI);
    }
  }
  const spin = [...(log.byTag.get("spin") ?? []), ...(log.byTag.get("spin-end") ?? [])];
  if (spin.length > 2) {
    // yaw is reported in -180..180 (decidegrees): unwrap it
    let total = 0;
    for (let i = 1; i < spin.length; i++) {
      let d = (spin[i].yaw - spin[i - 1].yaw) / 10;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      total += d;
    }
    m.spinDeg = Math.abs(total);
    m.spinWheelDeg = avgDeg(spin[spin.length - 1]);
    if (m.wheelMm && m.spinDeg > 30) {
      const arc = (m.spinWheelDeg / 360) * Math.PI * m.wheelMm; // each wheel's path
      m.trackMm = (2 * arc) / ((m.spinDeg * Math.PI) / 180);
    }
  }
  const speed = log.byTag.get("speed") ?? [];
  if (speed.length > 10) {
    const v = speed.map((s) => (Math.abs(s.vl) + Math.abs(s.vr)) / 2);
    const tail = v.slice(Math.floor(v.length * 0.6));
    m.topSpeed = mean(tail);
    const i90 = v.findIndex((x) => x >= 0.9 * m.topSpeed!);
    if (i90 >= 0) m.t90 = speed[i90].t - speed[0].t;
  }
  const stop = log.byTag.get("coast-stop")?.at(-1), coast = log.byTag.get("coast") ?? [];
  if (stop && coast.length) m.coastDeg = Math.abs(avgDeg(coast[coast.length - 1]) - avgDeg(stop));
  if (log.white.length) m.white = log.white[0].map((_, k) => mean(log.white.map((r) => r[k])));
  if (log.black.length) m.black = log.black[0].map((_, k) => mean(log.black.map((r) => r[k])));
  return m;
}

export interface CalResult {
  wheelDiameterMm?: number;
  trackWidthMm?: number;
  colorCalibration?: ColorCalibration;
  notes: string[];
}

/**
 * Corrections for the simulated robot: scale its wheel size and turning width by how far the real
 * robot is from the simulator (so simulator-only effects like wheel slip cancel out), and fit the
 * colour sensor's offset/gain to the real white and black readings.
 * `colorModel`: the simulator's colour reading as a function of the calibration, over the mat's
 * white and black (from the loaded mat and the sensor height).
 */
export function corrections(real: CalMetrics, sim: CalMetrics, cfg: RobotConfig, cal: ColorCalibration, colorModel?: { white: number; black: number; heightFactor: number; lumWhite: number; lumBlack: number }): CalResult {
  const out: CalResult = { notes: [] };
  if (real.wheelMm && sim.wheelMm) {
    out.wheelDiameterMm = +(cfg.wheelDiameterMm * (real.wheelMm / sim.wheelMm)).toFixed(1);
    out.notes.push(`Wheels: the real wheels roll like ${real.wheelMm.toFixed(1)} mm wheels, the simulated ones like ${sim.wheelMm.toFixed(1)} mm → wheel size ${cfg.wheelDiameterMm} → ${out.wheelDiameterMm} mm.`);
  }
  if (real.trackMm && sim.trackMm) {
    out.trackWidthMm = +(cfg.trackWidthMm * (real.trackMm / sim.trackMm)).toFixed(1);
    out.notes.push(`Turning: effective track ${real.trackMm.toFixed(1)} mm real vs ${sim.trackMm.toFixed(1)} mm simulated → track width ${cfg.trackWidthMm} → ${out.trackWidthMm} mm.`);
  }
  if (real.driveYawDeg !== undefined && Math.abs(real.driveYawDeg) >= 1)
    out.notes.push(`Straight driving: the real robot drifted ${real.driveYawDeg.toFixed(1)}° over the drive test (the simulator drives dead straight) — check wheel and tyre alignment.`);
  if (real.topSpeed && sim.topSpeed)
    out.notes.push(`Top speed: ${Math.round(real.topSpeed)} °/s real vs ${Math.round(sim.topSpeed)} °/s simulated${real.t90 && sim.t90 ? `; 90 % reached after ${real.t90} ms vs ${sim.t90} ms` : ""}.`);
  if (real.coastDeg !== undefined && sim.coastDeg !== undefined)
    out.notes.push(`Coasting: the wheels rolled ${Math.round(real.coastDeg)}° after letting go on the real table vs ${Math.round(sim.coastDeg)}° in the simulator.`);
  if (real.white?.length && real.black?.length && colorModel) {
    // reflection = f · (offset + gain · P): P = L^0.6 of the mat's white / black
    const W = mean(real.white), B = mean(real.black);
    const f = colorModel.heightFactor, pw = Math.pow(colorModel.lumWhite, 0.6), pb = Math.pow(colorModel.lumBlack, 0.6);
    if (f > 0 && pw - pb > 0.05) {
      const gain = (W - B) / (f * (pw - pb));
      const offset = W / f - gain * pw;
      out.colorCalibration = { offset: +offset.toFixed(2), gain: +gain.toFixed(2) };
      out.notes.push(`Colour sensor: real white ${W.toFixed(0)} / black ${B.toFixed(0)} vs simulated ${colorModel.white} / ${colorModel.black} (offset ${cal.offset} → ${out.colorCalibration.offset}, gain ${cal.gain} → ${out.colorCalibration.gain}).`);
    }
  }
  if (!out.notes.length) out.notes.push("Paste the console output of the tests above (and the measured drive distance) to see the comparison.");
  return out;
}
