// Generic articulated-model description. The drive base below is hand-authored; later the
// assembly package produces the same structure from LDraw parts + connections, so the
// physics code never needs to know where a model came from.
//
// Robot frame (mm): origin on the ground midway between the drive wheels,
// +x right, +y up, -z forward (Three.js convention).

import type { Quat, Vec3 } from "@fll-sim/units";
import { MOTOR_SPECS, type MotorType } from "./motor";

export type Material = "rubber" | "plastic" | "steel" | "wood";

/** Friction coefficient against the mat/table (combine rule: multiply with mat = 1.0). */
export const FRICTION: Record<Material, number> = {
  rubber: 0.9,
  plastic: 0.3,
  steel: 0.12,
  wood: 0.4,
};

export type ShapeSpec =
  | { kind: "box"; sizeMm: Vec3; posMm: Vec3; rot?: Quat; color: string; material?: Material; massKg?: number }
  | {
      kind: "cylinder"; radiusMm: number; lengthMm: number;
      /** cylinder axis (ignored when `rot` is given: then the axis is rot applied to +Y) */
      axis: "x" | "y" | "z"; rot?: Quat; posMm: Vec3; color: string; material?: Material; massKg?: number;
    }
  | { kind: "sphere"; radiusMm: number; posMm: Vec3; color: string; material?: Material; massKg?: number };

/** A real LEGO part (or subfile) drawn for a body: 3x4 row-major matrix from part LDU to body mm. */
export interface VisualSpec {
  file: string;
  color: number;
  m: number[];
}

export interface BodySpec {
  id: string;
  massKg: number;
  /** Shapes in body-local mm coordinates. Body origin = robot origin at build time. */
  shapes: ShapeSpec[];
  /** Extra rotational inertia about a local axis (e.g. motor rotor reflected through gearbox). */
  extraInertia?: { axis: Vec3; kgm2: number };
  /** LDraw parts to render for this body (else the collision shapes are drawn). */
  visuals?: VisualSpec[];
}

export interface MotorJointSpec {
  id: string;
  /** Body holding the motor housing, and body driven by the output shaft. */
  housing: string;
  output: string;
  /** Anchor point, robot frame (mm). */
  anchorMm: Vec3;
  /** Unit vector pointing OUT of the motor's output face, robot frame. */
  axisOut: Vec3;
  port: Port;
  motor: MotorType;
}

export interface FreeJointSpec {
  id: string;
  a: string;
  b: string;
  anchorMm: Vec3;
  axis: Vec3;
  /** Friction pins: joint resists turning a little. */
  friction?: boolean;
  /** Torque (N·m) the joint resists turning with (Coulomb friction; sums its pins/axles). */
  frictionNm?: number;
}

export type Port = "A" | "B" | "C" | "D" | "E" | "F";
export const PORTS: Port[] = ["A", "B", "C", "D", "E", "F"];

export type SensorType = "color" | "distance" | "force";

export interface SensorSpec {
  port: Port;
  type: SensorType;
  body: string;
  /** Sensing point and look direction, robot frame. */
  posMm: Vec3;
  dir: Vec3;
}

export interface HubSpec {
  body: string;
  posMm: Vec3;
  /**
   * Rotation taking hub-local axes into robot axes. Hub local: +z out of the light matrix
   * (TOP face), +y toward the speaker end... identity = hub flat, matrix up, USB port toward the back.
   */
  rot: Quat;
}

/**
 * Two meshing gears. The teeth must move together at the contact point:
 *   (ωa − ωfa)·ja = (ωb − ωfb)·jb
 * where fa/fb are the bodies the gears turn in (their axle's holder; the gear's own body when it
 * can't turn) and ja/jb are the gears' lever vectors (axis × pitch radius, or axis × lead/2π for
 * a worm), mm, in the model frame at build time (they turn with fa/fb).
 */
export interface GearSpec {
  id: string;
  a: string; fa: string; ja: Vec3;
  b: string; fb: string; jb: Vec3;
  /** e.g. "8:24" */
  label: string;
  /** torque limit at gear a (N·m), e.g. a slip clutch; default: no limit */
  maxTorqueNm?: number;
}

export interface RobotModel {
  name: string;
  bodies: BodySpec[];
  motors: MotorJointSpec[];
  freeJoints: FreeJointSpec[];
  /** Meshing gears (none for hand-made models). */
  gears?: GearSpec[];
  sensors: SensorSpec[];
  hub: HubSpec;
  /** Robot footprint (for launch-area inspection), mm. */
  footprintMm: { w: number; l: number; h: number };
}

const I: Quat = { x: 0, y: 0, z: 0, w: 1 };
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export interface DriveBaseOptions {
  wheelDiameterMm?: number; // SPIKE Prime 56 mm wheel (tyre 39367 on hub 39370/39367)
  wheelWidthMm?: number;
  trackWidthMm?: number; // wheel-centre to wheel-centre
  leftPort?: Port;
  rightPort?: Port;
  driveMotor?: MotorType;
  colorPorts?: { port: Port; xMm: number; zMm: number }[];
  distancePort?: Port | null;
  attachmentPorts?: Port[];
}

/**
 * A compact SPIKE Prime drive base: hub lying flat, two drive motors with outward-facing
 * outputs, 56 mm wheels, a steel ball caster at the back, downward colour sensors and a
 * forward distance sensor. Dimensions are nominal and should be replaced by the builder output.
 */
export function makeDriveBase(o: DriveBaseOptions = {}): RobotModel {
  const wd = o.wheelDiameterMm ?? 56;
  const ww = o.wheelWidthMm ?? 14;
  const track = o.trackWidthMm ?? 120;
  const motor = o.driveMotor ?? "medium";
  const r = wd / 2;
  const L = o.leftPort ?? "A";
  const R = o.rightPort ?? "B";
  const colorPorts = o.colorPorts ?? [
    { port: "C" as Port, xMm: -24, zMm: -88 },
    { port: "D" as Port, xMm: 24, zMm: -88 },
  ];
  const distPort = o.distancePort === undefined ? ("E" as Port) : o.distancePort;
  const attach = o.attachmentPorts ?? [];

  const chassisTop = 64;
  const bodies: BodySpec[] = [];
  const mMotor = MOTOR_SPECS[motor].massKg;
  const inner = track / 2 - ww / 2 - 2; // inner face of wheel
  // Chassis: frame + hub (hub 56 x 32 x 88 mm incl. battery, ~0.2 kg) + drive motors + sensors.
  bodies.push({
    id: "chassis",
    massKg: 0.2 /* hub */ + 2 * mMotor + 0.18 /* beams & pins */ + colorPorts.length * 0.02 + (distPort ? 0.03 : 0),
    shapes: [
      // Hub, flat, centred slightly forward of the axle.
      { kind: "box", sizeMm: v(56, 32, 88), posMm: v(0, chassisTop - 16, -20), color: "#f2f2f2", material: "plastic" },
      // Drive motors (medium angular motor housing ~ 40 x 24 x 32 mm), outputs facing out.
      { kind: "box", sizeMm: v(inner - 30, 32, 40), posMm: v(-(30 + (inner - 30) / 2), r, 0), color: "#f2f2f2", material: "plastic" },
      { kind: "box", sizeMm: v(inner - 30, 32, 40), posMm: v(30 + (inner - 30) / 2, r, 0), color: "#f2f2f2", material: "plastic" },
      // Frame beams.
      { kind: "box", sizeMm: v(2 * inner, 8, 16), posMm: v(0, r + 20, -52), color: "#1e6fd9", material: "plastic" },
      { kind: "box", sizeMm: v(60, 8, 150), posMm: v(0, 18, -25), color: "#1e6fd9", material: "plastic" },
      // Caster holder at the front (COM sits between axle and caster).
      { kind: "box", sizeMm: v(24, 16, 24), posMm: v(0, 18, -60), color: "#2b2b2b", material: "plastic" },
      // Steel caster ball (LEGO 3/4" ball ~ 13 mm dia is too small; SPIKE caster ball ~ 16 mm).
      { kind: "sphere", radiusMm: 8, posMm: v(0, 8, -60), color: "#b8b8b8", material: "steel" },
      // Sensors (visual + collision), front.
      ...colorPorts.map((c): ShapeSpec => ({ kind: "box", sizeMm: v(24, 24, 24), posMm: v(c.xMm, 12 + 12, c.zMm), color: "#f2f2f2", material: "plastic" })),
      ...(distPort ? [{ kind: "box", sizeMm: v(48, 24, 24), posMm: v(0, 48, -82), color: "#f2f2f2", material: "plastic" } as ShapeSpec] : []),
    ],
  });
  for (const side of [-1, 1]) {
    bodies.push({
      id: side < 0 ? "wheelL" : "wheelR",
      massKg: 0.025,
      shapes: [{ kind: "cylinder", radiusMm: r, lengthMm: ww, axis: "x", posMm: v((side * track) / 2, r, 0), color: "#2b2b2b", material: "rubber" }],
      extraInertia: { axis: v(1, 0, 0), kgm2: MOTOR_SPECS[motor].reflectedInertia },
    });
  }
  const motors: MotorJointSpec[] = [
    { id: "driveL", housing: "chassis", output: "wheelL", anchorMm: v(-track / 2, r, 0), axisOut: v(-1, 0, 0), port: L, motor },
    { id: "driveR", housing: "chassis", output: "wheelR", anchorMm: v(track / 2, r, 0), axisOut: v(1, 0, 0), port: R, motor },
  ];
  // Attachment motors: small arms on top that swing freely (no load) for now.
  attach.forEach((p, i) => {
    const x = (i === 0 ? -1 : 1) * 36;
    const id = `arm${p}`;
    bodies.push({
      id,
      massKg: 0.02,
      shapes: [{ kind: "box", sizeMm: v(8, 8, 60), posMm: v(x + (i === 0 ? -10 : 10), chassisTop + 20, -50), color: "#e8b500", material: "plastic" }],
      extraInertia: { axis: v(1, 0, 0), kgm2: MOTOR_SPECS.medium.reflectedInertia },
    });
    motors.push({ id: `motor${p}`, housing: "chassis", output: id, anchorMm: v(x, chassisTop + 20, -20), axisOut: v(i === 0 ? -1 : 1, 0, 0), port: p, motor: "medium" });
  });

  const sensors: SensorSpec[] = colorPorts.map((c) => ({ port: c.port, type: "color", body: "chassis", posMm: v(c.xMm, 12, c.zMm), dir: v(0, -1, 0) }));
  if (distPort) sensors.push({ port: distPort, type: "distance", body: "chassis", posMm: v(0, 48, -94), dir: v(0, 0, -1) });

  return {
    name: "SPIKE Prime drive base",
    bodies,
    motors,
    freeJoints: [],
    sensors,
    hub: { body: "chassis", posMm: v(0, chassisTop - 16, -20), rot: I },
    footprintMm: { w: track + ww, l: 190, h: 90 },
  };
}
