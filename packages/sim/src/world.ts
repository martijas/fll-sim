import RAPIER from "@dimforge/rapier3d-compat";
import {
  type Quat, type Vec3, add, dot, matToWorld, mmToM, mToMm, quatFromAxisAngle, rotate, worldToMat, wrapDeg, radToDeg, degToRad,
} from "@fll-sim/units";
import { HubState } from "./hub";
import { FRICTION, type FreeJointSpec, type GearSpec, type WeldSpec, type Port, type RobotModel, type SensorType, type ShapeSpec } from "./model";
import { MotorController } from "./motor";
import { type MatImage, type SeasonConfig, matPlacement } from "./season";
import { shapeBounds } from "./shapes";
import { type ColorCalibration, DEFAULT_CALIBRATION, colorReading, parseHexColor, sampleMat, spotRadiusMm, type RGB } from "./sensors";

let rapierReady: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export const DT = 0.001; // physics + firmware tick, s
/** Hinge friction: deflection (rad) at which a held joint pushes back with its full friction torque. */
const FRICTION_HOLD_RAD = 0.005;
/** Sliding axles: deflection (m) at which a held slide pushes back with its full friction force. */
const FRICTION_HOLD_M = 0.0002;

// Collision groups: membership in the high 16 bits, filter in the low 16 bits.
const G_FIELD = 0x0001, G_ROBOT = 0x0002, G_MODEL = 0x0004, G_QUERY = 0x0008;
const groups = (member: number, filter: number) => (member << 16) | filter;

export interface StartPose { xMm: number; yMm: number; headingDeg: number }

/** A LEGO mission model placed on the field (built from real parts). */
export interface FieldModel {
  id: string;
  model: RobotModel;
  pose: StartPose;
  /** Bodies held by Dual Lock (fixed to the mat); all others are free. */
  fixedBodies: string[];
}

export interface SimOptions {
  season: SeasonConfig;
  robot: RobotModel;
  start: StartPose;
  mat?: MatImage | null;
  colorCalibration?: ColorCalibration;
  /** Real-part mission models; any season mission model not listed here gets a stand-in block. */
  fieldModels?: FieldModel[];
  /** Show stand-in blocks for mission models without a real-part model (default true). */
  footprints?: boolean;
}

/** Static scene description sent once to the renderer. */
export interface SceneBody {
  id: string;
  kind: "robot" | "field" | "model";
  shapes: ShapeSpec[]; // body-local, mm
  label?: string;
  translucent?: boolean;
}

interface MotorBinding {
  ctl: MotorController;
  housing: RAPIER.RigidBody;
  output: RAPIER.RigidBody;
  axisLocal: Vec3; // in housing body frame
  angleDeg: number;
}

interface SensorBinding {
  type: SensorType;
  body: RAPIER.RigidBody;
  posM: Vec3; // body-local
  dir: Vec3; // body-local
}

const toQ = (r: RAPIER.Rotation): Quat => ({ x: r.x, y: r.y, z: r.z, w: r.w });
const toV = (r: RAPIER.Vector): Vec3 => ({ x: r.x, y: r.y, z: r.z });

export class Simulation {
  readonly world: RAPIER.World;
  readonly season: SeasonConfig;
  readonly robot: RobotModel;
  readonly hub: HubState;
  readonly motors = new Map<Port, MotorBinding>();
  readonly sensors = new Map<Port, SensorBinding>();
  /** Mission models whose moving parts are still frozen: bodies + bounding circle (m, world). */
  private frozen: { bodies: RAPIER.RigidBody[]; friction: Simulation["frictionJoints"]; gears: GearConstraint[]; gearFriction: FrictionRow[]; welds: Weld[]; x: number; z: number; rM: number }[] = [];
  /** Meshing gears (see solveConstraints). */
  private gears: GearConstraint[] = [];
  /** Breakable holds of game pieces (see Weld). */
  private welds: Weld[] = [];
  /** Friction of the hinges gears turn on, solved together with the gears. */
  private gearFriction: FrictionRow[] = [];
  /** Hinges with friction (see addJointFriction). */
  private frictionJoints: FrictionJoint[] = [];
  /** Collider pairs that never touch (see excludePair). */
  private excluded = new Map<number, Set<number>>();
  private events = new RAPIER.EventQueue(true);
  private hooks: RAPIER.PhysicsHooks = {
    filterContactPair: (c1, c2) => (this.excluded.get(c1)?.has(c2) ? null : RAPIER.SolverFlags.COMPUTE_IMPULSE),
    filterIntersectionPair: () => true,
  };
  readonly bodies: { id: string; body: RAPIER.RigidBody; kind: "robot" | "field" | "model" }[] = [];
  readonly scene: SceneBody[] = [];
  private colliderColor = new Map<number, RGB>();
  private surfaceHandle = -1;
  private mat: MatImage | null;
  private matPxPerMm: number;
  private cal: ColorCalibration;
  private hubBody: RAPIER.RigidBody;
  private hubRot: Quat;
  private prevHubVel: Vec3 = { x: 0, y: 0, z: 0 };
  private hubAccel: Vec3 = { x: 0, y: 9.81, z: 0 };
  private yawOffsetDeg = 0;
  private idCounter = 1_000_000;
  /** Simulation time in ms (integer ticks). */
  timeMs = 0;

  private constructor(o: SimOptions) {
    this.season = o.season;
    this.robot = o.robot;
    this.mat = o.mat ?? null;
    this.matPxPerMm = o.season.mat.image?.pxPerMm ?? 2;
    this.cal = o.colorCalibration ?? DEFAULT_CALIBRATION;
    this.hub = new HubState(() => this.idCounter++);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    world.integrationParameters.numSolverIterations = 8;
    world.integrationParameters.lengthUnit = 0.05;
    this.world = world;
    this.buildTable();
    const placed = new Set((o.fieldModels ?? []).map((f) => f.id));
    if (o.footprints !== false) this.buildFootprints(o.season.missionModels.filter((m) => !placed.has(m.id)));
    for (const f of o.fieldModels ?? []) this.buildArticulated(f.model, f.pose, "model", f.id + ":", new Set(f.fixedBodies));
    const { hubBody, hubRot } = this.buildRobot(o.start);
    this.hubBody = hubBody;
    this.hubRot = hubRot;
  }

  static async create(o: SimOptions): Promise<Simulation> {
    await initPhysics();
    return new Simulation(o);
  }

  get matPlacement() {
    return matPlacement(this.season);
  }

  allocId() {
    return this.idCounter++;
  }

  // ---- construction ------------------------------------------------------------
  private buildTable() {
    const t = this.season.table;
    const W = mmToM(t.interiorMm.w), H = mmToM(t.interiorMm.h);
    const wt = mmToM(t.wall.thicknessMm), wh = mmToM(t.wall.heightMm);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const mk = (hx: number, hy: number, hz: number, x: number, y: number, z: number, friction: number) => {
      const c = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(friction)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
          .setCollisionGroups(groups(G_FIELD, 0xffff)),
        body,
      );
      return c;
    };
    const surface = mk(W / 2 + wt, 0.01, H / 2 + wt, W / 2, -0.01, -H / 2, 1.0);
    this.surfaceHandle = surface.handle;
    const walls: [number, number, number, number, number, number][] = [
      [W / 2 + wt, wh / 2, wt / 2, W / 2, wh / 2, wt / 2], // south
      [W / 2 + wt, wh / 2, wt / 2, W / 2, wh / 2, -H - wt / 2], // north
      [wt / 2, wh / 2, H / 2, -wt / 2, wh / 2, -H / 2], // west
      [wt / 2, wh / 2, H / 2, W + wt / 2, wh / 2, -H / 2], // east
    ];
    const wallShapes: ShapeSpec[] = [];
    for (const [hx, hy, hz, x, y, z] of walls) {
      const c = mk(hx, hy, hz, x, y, z, 0.4);
      this.colliderColor.set(c.handle, parseHexColor("#2a2a2a"));
      wallShapes.push({ kind: "box", sizeMm: { x: mToMm(hx * 2), y: mToMm(hy * 2), z: mToMm(hz * 2) }, posMm: { x: mToMm(x), y: mToMm(y), z: mToMm(z) }, color: "#3a3a3a" });
    }
    this.scene.push({ id: "table-walls", kind: "field", shapes: wallShapes });
    this.bodies.push({ id: "table-walls", body, kind: "field" });
  }

  /** Stand-in blocks for mission models: fixed boxes/cylinders at their wireframe footprints. */
  private buildFootprints(models: SeasonConfig["missionModels"]) {
    for (const mm of models) {
      const f = mm.shape;
      const center = matToWorld({ x: f.cx, y: f.cy }, this.matPlacement, 0);
      const rot = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, degToRad(f.kind === "rect" ? f.rot : 0));
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, 0, center.z).setRotation(rot));
      const h = mm.heightMm;
      const shape: ShapeSpec = f.kind === "rect"
        ? { kind: "box", sizeMm: { x: f.w, y: h, z: f.h }, posMm: { x: 0, y: h / 2, z: 0 }, color: mm.color, material: "plastic" }
        : { kind: "cylinder", radiusMm: f.r, lengthMm: h, axis: "y", posMm: { x: 0, y: h / 2, z: 0 }, color: mm.color, material: "plastic" };
      const c = this.world.createCollider(colliderDesc(shape).setFriction(0.4).setCollisionGroups(groups(G_MODEL, 0xffff)), body);
      this.colliderColor.set(c.handle, parseHexColor(mm.color));
      this.bodies.push({ id: `fp:${mm.id}`, body, kind: "field" });
      this.scene.push({ id: `fp:${mm.id}`, kind: "field", shapes: [shape], label: `M${mm.missions.map((n) => String(n).padStart(2, "0")).join("/")} ${mm.name}`, translucent: true });
    }
  }

  /** Mission model built from LEGO parts: fixed (Dual Lock) bodies + free parts and hinges. */
  private buildArticulated(m: RobotModel, pose: StartPose, kind: "model", prefix: string, fixed: Set<string>) {
    const origin = matToWorld({ x: pose.xMm, y: pose.yMm }, this.matPlacement, 0);
    const rot = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, degToRad(pose.headingDeg));
    const byId = new Map<string, RAPIER.RigidBody>();
    const modelFriction: FrictionJoint[] = []; // active once the model wakes up
    const modelGears: GearConstraint[] = [];
    const shapesOf = new Map(m.bodies.map((b) => [b.id, b.shapes]));
    for (const b of m.bodies) {
      // Moving parts start frozen (fixed): the model stays exactly as set up, as friction
      // holds it on a real table, until the robot comes near (see wakeModels).
      const desc = (fixed.has(b.id) ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(origin.x, origin.y + 0.0003, origin.z).setRotation(rot);
      const body = this.world.createRigidBody(desc);
      byId.set(b.id, body);
      const shapes = shapesOf.get(b.id)!;
      const vols = shapes.map(shapeVolume);
      const vt = vols.reduce((x, y) => x + y, 0) || 1;
      shapes.forEach((s, i) => {
        const cd = colliderDesc(s)
          .setMass(s.massKg ?? (b.massKg * vols[i]) / vt)
          .setFriction(FRICTION[s.material ?? "plastic"])
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
          .setRestitution(0.05)
          .setCollisionGroups(groups(G_MODEL, 0xffff));
        const c = this.world.createCollider(cd, body);
        this.colliderColor.set(c.handle, parseHexColor(s.color));
      });
      this.bodies.push({ id: prefix + b.id, body, kind });
      this.scene.push({ id: prefix + b.id, kind, shapes: b.shapes });
    }
    const carriers: RAPIER.RigidBody[] = [];
    for (const j of m.freeJoints) {
      const carrier = this.addHinge(j, byId, modelFriction, false);
      if (carrier) carriers.push(carrier);
    }
    for (const g of m.gears ?? []) modelGears.push(gearConstraint(g, byId));
    const modelWelds = (m.welds ?? []).map((w) => weldConstraint(w, byId));
    // meshing teeth interlock: the gear constraint handles them, not collisions (a joint that
    // constrains nothing, only to switch their contacts off natively)
    const zero = { x: 0, y: 0, z: 0 };
    for (const g of m.gears ?? []) {
      const joint = this.world.createImpulseJoint(RAPIER.JointData.generic(zero, zero, { x: 1, y: 0, z: 0 }, 0 as RAPIER.JointAxesMask), byId.get(g.a)!, byId.get(g.b)!, false);
      joint.setContactsEnabled(false);
    }
    // bodies whose contacts are already off (hinged together, meshing gears)
    const noContact = new Set<string>();
    for (const j of m.freeJoints) noContact.add([j.a, j.b].sort().join("|"));
    for (const g of m.gears ?? []) noContact.add([g.a, g.b].sort().join("|"));
    const modelGearFriction = takeGearFriction(modelGears, modelFriction);
    // Colliders of one model that already overlap as built (pins through holes, parts nested in
    // each other, voxel slack) must not push each other apart; everything else keeps colliding,
    // so hinged parts still rest on their stops. Filtered per collider pair by a contact hook.
    const all: { body: number; handle: number; bounds: ReturnType<typeof shapeBounds> }[] = [];
    m.bodies.forEach((b, bi) => {
      const body = byId.get(b.id)!;
      shapesOf.get(b.id)!.forEach((sh, si) => all.push({ body: bi, handle: body.collider(si).handle, bounds: shapeBounds(sh) }));
    });
    const hit = (x: ReturnType<typeof shapeBounds>, y: ReturnType<typeof shapeBounds>) =>
      x.max.x - y.min.x > 0.2 && y.max.x - x.min.x > 0.2 && x.max.y - y.min.y > 0.2 && y.max.y - x.min.y > 0.2 && x.max.z - y.min.z > 0.2 && y.max.z - x.min.z > 0.2;
    for (let i = 0; i < all.length; i++)
      for (let k = i + 1; k < all.length; k++) {
        const x = all[i], y = all[k];
        if (x.body === y.body || (fixed.has(m.bodies[x.body].id) && fixed.has(m.bodies[y.body].id)) || !hit(x.bounds, y.bounds)) continue;
        if (noContact.has([m.bodies[x.body].id, m.bodies[y.body].id].sort().join("|"))) continue;
        this.excludePair(x.handle, y.handle);
      }
    const moving = [...m.bodies.filter((b) => !fixed.has(b.id)).map((b) => byId.get(b.id)!), ...carriers];
    if (moving.length) {
      let r = 0;
      for (const b of m.bodies) for (const sh of shapesOf.get(b.id)!) {
        const bb = shapeBounds(sh);
        r = Math.max(r, Math.hypot(Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)), Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z))));
      }
      // frozen = fixed (created dynamic first so their mass properties are computed)
      for (const b of moving) b.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      this.frozen.push({ bodies: moving, friction: modelFriction, gears: modelGears, gearFriction: modelGearFriction, welds: modelWelds, x: origin.x, z: origin.z, rM: mmToM(r) });
    }
  }

  private wake(f: Simulation["frozen"][number]) {
    for (const b of f.bodies) this.unfreeze(b);
    this.frictionJoints.push(...f.friction);
    this.gears.push(...f.gears);
    this.gearFriction.push(...f.gearFriction);
    this.welds.push(...f.welds);
  }

  private unfreeze(b: RAPIER.RigidBody) {
    b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    b.recomputeMassPropertiesFromColliders();
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * A hinge between two bodies. An axle in round holes can also slide: hole side ─slide joint
   * (stops + friction)─ carrier ─hinge─ axle side, where the carrier is a small hidden body.
   * Returns the carrier, if any.
   */
  private addHinge(j: FreeJointSpec, byId: Map<string, RAPIER.RigidBody>, friction: FrictionJoint[], wake: boolean): RAPIER.RigidBody | undefined {
    const anchor = { x: mmToM(j.anchorMm.x), y: mmToM(j.anchorMm.y), z: mmToM(j.anchorMm.z) };
    const A = byId.get(j.a)!, B = byId.get(j.b)!;
    if (!j.slide) {
      const joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(anchor, anchor, j.axis), A, B, wake) as RAPIER.RevoluteImpulseJoint;
      joint.setContactsEnabled(false);
      this.addJointFriction(joint, A, B, j, friction);
      return undefined;
    }
    const axleSide = j.slide.body === j.a ? A : B, holeSide = axleSide === A ? B : A;
    // the carrier sits where the bodies' frames are (all bodies share the build frame)
    const t = holeSide.translation(), q = holeSide.rotation();
    const carrier = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(t.x, t.y, t.z).setRotation(q).setAdditionalMassProperties(0.001, anchor, { x: 1e-8, y: 1e-8, z: 1e-8 }, { x: 0, y: 0, z: 0, w: 1 }));
    const slide = this.world.createImpulseJoint(RAPIER.JointData.prismatic(anchor, anchor, j.axis), holeSide, carrier, wake) as RAPIER.PrismaticImpulseJoint;
    slide.setContactsEnabled(false);
    slide.setLimits(mmToM(j.slide.minMm), mmToM(j.slide.maxMm));
    this.addJointFriction(slide, holeSide, carrier, { axis: j.axis, frictionNm: j.slide.frictionN }, friction, "slide");
    const hinge = this.world.createImpulseJoint(RAPIER.JointData.revolute(anchor, anchor, j.axis), carrier, axleSide, wake) as RAPIER.RevoluteImpulseJoint;
    hinge.setContactsEnabled(false);
    this.addJointFriction(hinge, carrier, axleSide, j, friction, "turn", holeSide);
    // no contacts between the axle and the hole side either
    const off = this.world.createImpulseJoint(RAPIER.JointData.generic(anchor, anchor, { x: 1, y: 0, z: 0 }, 0 as RAPIER.JointAxesMask), holeSide, axleSide, wake);
    off.setContactsEnabled(false);
    return carrier;
  }

  /**
   * Coulomb friction for a hinge (friction pins grip, frictionless pins barely): a position motor
   * holds the current angle with its torque capped at the joint's friction torque. Below that
   * load the joint stays put; above it, it slips and the hold point follows (see updateFriction).
   */
  private addJointFriction(joint: RAPIER.RevoluteImpulseJoint | RAPIER.PrismaticImpulseJoint, a: RAPIER.RigidBody, b: RAPIER.RigidBody, j: { axis: Vec3; friction?: boolean; frictionNm?: number }, list = this.frictionJoints, kind: "turn" | "slide" = "turn", frame?: RAPIER.RigidBody) {
    // (hinges that gears turn on are handed over to the gear solver: see takeGearFriction)
    // turn: torque (N·m); slide: force (N)
    const torque = j.frictionNm ?? (j.friction ? 0.006 : 0);
    if (torque <= 0) return;
    const k = torque / (kind === "slide" ? FRICTION_HOLD_M : FRICTION_HOLD_RAD); // full friction at that deflection
    joint.configureMotorModel(RAPIER.MotorModel.ForceBased); // max force in N·m, not acceleration
    joint.configureMotorPosition(0, k, k * 0.005);
    joint.setMotorMaxForce(torque);
    list.push({ joint, a, b, axis: j.axis, k, hold: 0, slip: torque / k, torque, kind, frame });
  }

  /** Let slipping friction joints keep their new angle instead of springing back. */
  private updateFriction() {
    for (const f of this.frictionJoints) {
      if (f.a.isSleeping() && f.b.isSleeping()) continue;
      const angle = f.kind === "slide" ? slideOffset(f.a, f.b, f.axis) : hingeAngle(f.a, f.b, f.axis);
      let d = f.hold - angle;
      if (f.kind === "turn") d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) <= f.slip) continue;
      f.hold = angle + Math.sign(d) * f.slip;
      f.joint.configureMotorPosition(f.hold, f.k, f.k * 0.005);
    }
  }

  /** Unfreeze all mission models (tests). */
  unfreezeModels() {
    for (const f of this.frozen) this.wake(f);
    this.frozen = [];
  }

  /** Unfreeze every mission model the robot has come close to (all its moving parts at once). */
  private wakeModels() {
    const p = this.hubBody.translation();
    const reach = mmToM(Math.hypot(this.robot.footprintMm.w, this.robot.footprintMm.l) / 2 + 60);
    this.frozen = this.frozen.filter((f) => {
      if (Math.hypot(p.x - f.x, p.z - f.z) > f.rM + reach) return true;
      this.wake(f);
      return false;
    });
  }

  /** Never generate contacts between these two colliders. */
  private excludePair(a: number, b: number) {
    for (const [p, q] of [[a, b], [b, a]]) {
      let set = this.excluded.get(p);
      if (!set) {
        this.excluded.set(p, (set = new Set()));
        this.world.getCollider(p).setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
      }
      set.add(q);
    }
  }

  private buildRobot(start: StartPose) {
    const m = this.robot;
    const origin = matToWorld({ x: start.xMm, y: start.yMm }, this.matPlacement, 0);
    const rot = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, degToRad(start.headingDeg));
    const byId = new Map<string, RAPIER.RigidBody>();
    for (const b of m.bodies) {
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y + 0.0005, origin.z)
        .setRotation(rot)
        .setCanSleep(false);
      if (b.extraInertia) {
        const a = b.extraInertia.axis;
        desc.setAdditionalMassProperties(0, { x: 0, y: 0, z: 0 }, { x: Math.abs(a.x) * b.extraInertia.kgm2, y: Math.abs(a.y) * b.extraInertia.kgm2, z: Math.abs(a.z) * b.extraInertia.kgm2 }, { x: 0, y: 0, z: 0, w: 1 });
      }
      const body = this.world.createRigidBody(desc);
      byId.set(b.id, body);
      const vols = b.shapes.map(shapeVolume);
      const vt = vols.reduce((s, x) => s + x, 0) || 1;
      b.shapes.forEach((s, i) => {
        const cd = colliderDesc(s)
          .setMass(s.massKg ?? (b.massKg * vols[i]) / vt)
          .setFriction(FRICTION[s.material ?? "plastic"])
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
          .setRestitution(0.05)
          .setCollisionGroups(groups(G_ROBOT, 0xffff & ~G_ROBOT));
        const c = this.world.createCollider(cd, body);
        this.colliderColor.set(c.handle, parseHexColor(s.color));
      });
      this.bodies.push({ id: b.id, body, kind: "robot" });
      this.scene.push({ id: b.id, kind: "robot", shapes: b.shapes });
    }
    for (const j of m.motors) {
      const housing = byId.get(j.housing)!, output = byId.get(j.output)!;
      const a = { x: mmToM(j.anchorMm.x), y: mmToM(j.anchorMm.y), z: mmToM(j.anchorMm.z) };
      const joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(a, a, j.axisOut), housing, output, true);
      joint.setContactsEnabled(false);
      this.motors.set(j.port, { ctl: new MotorController(j.motor), housing, output, axisLocal: j.axisOut, angleDeg: 0 });
    }
    for (const j of m.freeJoints) this.addHinge(j, byId, this.frictionJoints, true);
    const robotGears = (m.gears ?? []).map((g) => gearConstraint(g, byId));
    this.gears.push(...robotGears);
    this.gearFriction.push(...takeGearFriction(robotGears, this.frictionJoints));
    for (const s of m.sensors) {
      this.sensors.set(s.port, {
        type: s.type,
        body: byId.get(s.body)!,
        posM: { x: mmToM(s.posMm.x), y: mmToM(s.posMm.y), z: mmToM(s.posMm.z) },
        dir: s.dir,
      });
    }
    return { hubBody: byId.get(m.hub.body)!, hubRot: m.hub.rot };
  }

  // ---- stepping ----------------------------------------------------------------
  /** Advance exactly one tick (1 ms). */
  tick() {
    const t = this.timeMs / 1000;
    for (const m of this.motors.values()) {
      const qh = toQ(m.housing.rotation());
      const axisW = rotate(qh, m.axisLocal);
      const wRel = dot(toV(m.output.angvel()), axisW) - dot(toV(m.housing.angvel()), axisW);
      const speedDps = -radToDeg(wRel); // clockwise looking at the output face = negative about axisOut
      m.angleDeg += speedDps * DT;
      m.ctl.update(t, m.angleDeg, speedDps);
      const tau = m.ctl.torque(speedDps);
      const imp = tau * DT;
      m.output.applyTorqueImpulse({ x: -axisW.x * imp, y: -axisW.y * imp, z: -axisW.z * imp }, true);
      m.housing.applyTorqueImpulse({ x: axisW.x * imp, y: axisW.y * imp, z: axisW.z * imp }, true);
    }
    if (this.frozen.length && this.timeMs % 5 === 0) this.wakeModels();
    if (this.frictionJoints.length) this.updateFriction();
    if (this.gears.length || this.welds.length) solveConstraints(this.gears, this.gearFriction, this.welds);
    // (Rapier only runs the contact hooks when an event queue is passed too)
    if (this.excluded.size) this.world.step(this.events, this.hooks);
    else this.world.step();
    if (this.gears.length) trackGearError(this.gears);
    this.timeMs += 1;
    // IMU specific force (accelerometer): a - g, in world frame.
    const v = toV(this.hubBody.linvel());
    this.hubAccel = {
      x: (v.x - this.prevHubVel.x) / DT,
      y: (v.y - this.prevHubVel.y) / DT + 9.81,
      z: (v.z - this.prevHubVel.z) / DT,
    };
    this.prevHubVel = v;
    this.hub.update(this.timeMs);
  }

  stepMs(ms: number) {
    for (let i = 0; i < ms; i++) this.tick();
  }

  // ---- transforms for rendering ----------------------------------------------------
  /** Flat array [x,y,z,qx,qy,qz,qw] per entry of `bodies` (metres). */
  transforms(out?: Float32Array): Float32Array {
    const a = out ?? new Float32Array(this.bodies.length * 7);
    this.bodies.forEach(({ body }, i) => {
      const p = body.translation(), q = body.rotation();
      a.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], i * 7);
    });
    return a;
  }

  /** Robot pose in the mat frame (mm, heading deg CCW from north). */
  robotPose() {
    const b = this.hubBody;
    const p = worldToMat(toV(b.translation()), this.matPlacement);
    const f = rotate(toQ(b.rotation()), { x: 0, y: 0, z: -1 });
    return { xMm: p.x, yMm: p.y, headingDeg: radToDeg(Math.atan2(-f.x, -f.z)) };
  }

  // ---- devices -------------------------------------------------------------------
  deviceType(port: Port): "motor" | SensorType | null {
    if (this.motors.has(port)) return "motor";
    return this.sensors.get(port)?.type ?? null;
  }

  motor(port: Port): MotorController | null {
    return this.motors.get(port)?.ctl ?? null;
  }

  private sensorRay(s: SensorBinding) {
    const q = toQ(s.body.rotation());
    const origin = add(toV(s.body.translation()), rotate(q, s.posM));
    const dir = rotate(q, s.dir);
    return { origin, dir };
  }

  private castFromRobot(origin: Vec3, dir: Vec3, maxM: number) {
    const ray = new RAPIER.Ray(origin, dir);
    return this.world.castRay(ray, maxM, true, undefined, groups(G_QUERY, G_FIELD | G_MODEL));
  }

  colorSensor(port: Port) {
    const s = this.sensors.get(port)!;
    const { origin, dir } = this.sensorRay(s);
    const hit = this.castFromRobot(origin, dir, 0.08);
    if (!hit) return colorReading(null, Infinity, this.cal);
    const hMm = mToMm(hit.timeOfImpact);
    const p = add(origin, { x: dir.x * hit.timeOfImpact, y: dir.y * hit.timeOfImpact, z: dir.z * hit.timeOfImpact });
    let c: RGB | null;
    if (hit.collider.handle === this.surfaceHandle) {
      const mp = worldToMat(p, this.matPlacement);
      const ms = this.season.mat.sizeMm;
      if (this.mat && mp.x >= 0 && mp.y >= 0 && mp.x <= ms.w && mp.y <= ms.h) c = sampleMat(this.mat, this.matPxPerMm, mp.x, mp.y, spotRadiusMm(hMm), ms.h);
      else if (!this.mat && mp.x >= 0 && mp.y >= 0 && mp.x <= ms.w && mp.y <= ms.h) c = { r: 0.95, g: 0.95, b: 0.95 };
      else c = parseHexColor("#caa472"); // bare plywood
    } else {
      c = this.colliderColor.get(hit.collider.handle) ?? { r: 0.5, g: 0.5, b: 0.5 };
    }
    return colorReading(c, hMm, this.cal);
  }

  /** Distance in mm, or -1 when nothing valid is in range (40..2000 mm). */
  distanceSensor(port: Port): number {
    const s = this.sensors.get(port)!;
    const { origin, dir } = this.sensorRay(s);
    // Narrow cone: centre ray plus 4 rays at ~6 degrees.
    const up = Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const side = normalize(cross3(dir, up));
    const up2 = cross3(side, dir);
    const k = Math.tan(degToRad(6));
    let best = Infinity;
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = normalize(add(dir, add(scale3(side, a * k), scale3(up2, b * k))));
      const hit = this.castFromRobot(origin, d, 2.0);
      if (hit && hit.timeOfImpact < best) best = hit.timeOfImpact;
    }
    const mm = mToMm(best);
    return Number.isFinite(mm) && mm >= 40 && mm <= 2000 ? Math.round(mm) : -1;
  }

  // ---- IMU -----------------------------------------------------------------------
  private hubQuat(): Quat {
    const q = toQ(this.hubBody.rotation());
    // body rotation * mount rotation
    const m = this.hubRot;
    return {
      w: q.w * m.w - q.x * m.x - q.y * m.y - q.z * m.z,
      x: q.w * m.x + q.x * m.w + q.y * m.z - q.z * m.y,
      y: q.w * m.y - q.x * m.z + q.y * m.w + q.z * m.x,
      z: q.w * m.z + q.x * m.y - q.y * m.x + q.z * m.w,
    };
  }

  /** Continuous heading of the hub (deg, CCW positive seen from above). */
  private rawYaw(): number {
    const f = rotate(this.hubQuat(), { x: 0, y: 0, z: -1 });
    return radToDeg(Math.atan2(-f.x, -f.z));
  }

  /** (yaw, pitch, roll) in decidegrees. Yaw: CCW positive (verify against a real hub). */
  tiltAngles(): [number, number, number] {
    const q = this.hubQuat();
    const f = rotate(q, { x: 0, y: 0, z: -1 });
    const r = rotate(q, { x: 1, y: 0, z: 0 });
    const yaw = wrapDeg(this.rawYaw() - this.yawOffsetDeg);
    const pitch = radToDeg(Math.asin(Math.max(-1, Math.min(1, f.y))));
    const roll = radToDeg(Math.asin(Math.max(-1, Math.min(1, -r.y))));
    return [Math.round(yaw * 10), Math.round(pitch * 10), Math.round(roll * 10)];
  }

  resetYaw(angleDeci: number) {
    this.yawOffsetDeg = this.rawYaw() - angleDeci / 10;
  }

  /** Angular velocity in hub frame, decidegrees/s (x, y, z). */
  angularVelocity(): [number, number, number] {
    const q = this.hubQuat();
    const w = toV(this.hubBody.angvel());
    const inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const l = rotate(inv, w);
    // Hub axes: x right, y forward, z up (matrix face).
    return [Math.round(radToDeg(l.x) * 10), Math.round(radToDeg(-l.z) * 10), Math.round(radToDeg(l.y) * 10)];
  }

  /** Acceleration in hub frame, milli-g (x, y, z). */
  acceleration(): [number, number, number] {
    const q = this.hubQuat();
    const inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const l = rotate(inv, this.hubAccel);
    const g = 9.81 / 1000;
    return [Math.round(l.x / g), Math.round(-l.z / g), Math.round(l.y / g)];
  }

  quaternion(): [number, number, number, number] {
    const q = this.hubQuat();
    return [q.w, q.x, q.y, q.z];
  }

  /** Which hub face points up: TOP 0, FRONT 1, RIGHT 2, BOTTOM 3, BACK 4, LEFT 5. */
  upFace(): number {
    const q = this.hubQuat();
    const inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const up = rotate(inv, { x: 0, y: 1, z: 0 });
    const cands: [number, number][] = [[0, up.y], [3, -up.y], [1, -up.z], [4, up.z], [2, up.x], [5, -up.x]];
    cands.sort((a, b) => b[1] - a[1]);
    return cands[0][0];
  }

  stable(): boolean {
    const w = toV(this.hubBody.angvel());
    return Math.hypot(w.x, w.y, w.z) < 0.05 && this.upFace() === 0;
  }
}

// ---- gears ----------------------------------------------------------------------------------------
interface FrictionJoint {
  joint: RAPIER.RevoluteImpulseJoint | RAPIER.PrismaticImpulseJoint; a: RAPIER.RigidBody; b: RAPIER.RigidBody; axis: Vec3;
  k: number; hold: number; slip: number; torque: number; kind: "turn" | "slide";
  /** for a sliding axle's hinge: the body with the hole (what gears count as the gear's holder) */
  frame?: RAPIER.RigidBody;
}
/** Hinge friction solved by the gear solver: holds the angle `hold`, slips above `torque`. */
interface FrictionRow { a: RAPIER.RigidBody; b: RAPIER.RigidBody; axis: Vec3; torque: number; hold: number }

/** How far body b has slid relative to a along `axis` (a's frame; both share the build frame), m. */
function slideOffset(a: RAPIER.RigidBody, b: RAPIER.RigidBody, axis: Vec3): number {
  const pa = a.translation(), pb = b.translation();
  const d = rotate(conj(toQ(a.rotation())), { x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z });
  return d.x * axis.x + d.y * axis.y + d.z * axis.z;
}
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Angle of body b relative to a about `axis` (a's frame; both bodies share the build frame). */
function hingeAngle(a: RAPIER.RigidBody, b: RAPIER.RigidBody, axis: Vec3): number {
  const qa = toQ(a.rotation()), qb = toQ(b.rotation());
  const r = { w: qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z, x: qa.w * qb.x - qa.x * qb.w - qa.y * qb.z + qa.z * qb.y, y: qa.w * qb.y + qa.x * qb.z - qa.y * qb.w - qa.z * qb.x, z: qa.w * qb.z - qa.x * qb.y + qa.y * qb.x - qa.z * qb.w };
  return 2 * Math.atan2(r.x * axis.x + r.y * axis.y + r.z * axis.z, r.w);
}

/**
 * The hinges gears turn on: their friction moves from Rapier's joint motor (which would fight
 * the gear impulses inside the physics step) into the gear solver.
 */
function takeGearFriction(gears: GearConstraint[], friction: FrictionJoint[]): FrictionRow[] {
  const rows: FrictionRow[] = [];
  const pairs = new Set<string>();
  const key = (x: RAPIER.RigidBody, y: RAPIER.RigidBody) => [x.handle, y.handle].sort().join("|");
  for (const g of gears) { pairs.add(key(g.a, g.fa)); pairs.add(key(g.b, g.fb)); }
  for (let i = friction.length - 1; i >= 0; i--) {
    const f = friction[i];
    if (f.kind !== "turn" || !(pairs.has(key(f.a, f.b)) || (f.frame && pairs.has(key(f.frame, f.b))))) continue;
    friction.splice(i, 1);
    f.joint.setMotorMaxForce(0);
    rows.push({ a: f.a, b: f.b, axis: f.axis, torque: f.torque, hold: 0 });
  }
  return rows;
}

interface GearConstraint {
  a: RAPIER.RigidBody; fa: RAPIER.RigidBody; ja: Vec3;
  b: RAPIER.RigidBody; fb: RAPIER.RigidBody; jb: Vec3;
  /** accumulated tooth mismatch (m), corrected gradually */
  err: number;
  /** max impulse per tick at gear a (N·m·s), from a torque limit */
  maxImp: number;
}

function gearConstraint(g: GearSpec, byId: Map<string, RAPIER.RigidBody>): GearConstraint {
  const mv = (v: Vec3) => ({ x: mmToM(v.x), y: mmToM(v.y), z: mmToM(v.z) });
  const ja = mv(g.ja), ra = Math.hypot(ja.x, ja.y, ja.z) || 1;
  return { a: byId.get(g.a)!, fa: byId.get(g.fa)!, ja, b: byId.get(g.b)!, fb: byId.get(g.fb)!, jb: mv(g.jb), err: 0, maxImp: g.maxTorqueNm ? (g.maxTorqueNm * DT) / ra : Infinity };
}

/**
 * Gear meshes as velocity constraints: the teeth of both gears move at the same speed where they
 * touch, (ωa − ωfa)·Ja = (ωb − ωfb)·Jb, with J the lever vectors turned with each gear's holder.
 * Solved with impulses before every physics step (a few passes for gear trains), plus a small
 * correction of the accumulated tooth mismatch so the gears stay in step.
 */
/** After the physics step: how far the teeth drifted apart (corrected over the next ticks). */
function trackGearError(gears: GearConstraint[]) {
  for (const g of gears) {
    if (!g.a.isDynamic() && !g.b.isDynamic()) continue;
    const Ja = rotate(toQ(g.fa.rotation()), g.ja), Jb = rotate(toQ(g.fb.rotation()), g.jb);
    const w = (b: RAPIER.RigidBody) => toV(b.angvel());
    g.err += (dot(w(g.a), Ja) - dot(w(g.fa), Ja) - dot(w(g.b), Jb) + dot(w(g.fb), Jb)) * DT;
  }
}

/**
 * A breakable hold: a game piece stays attached to what it sits on (friction, a clip, a bar) until
 * something pulls on it harder than `breakN`; then it comes off for good.
 */
interface Weld {
  a: RAPIER.RigidBody; b: RAPIER.RigidBody;
  /** the hold point in each body's own frame (m) and b's rotation relative to a when made */
  pa: Vec3; pb: Vec3; q0: Quat;
  breakN: number;
  broken: boolean;
}

function weldConstraint(w: WeldSpec, byId: Map<string, RAPIER.RigidBody>): Weld {
  const A = byId.get(w.a)!, B = byId.get(w.b)!;
  const P = { x: mmToM(w.pointMm.x), y: mmToM(w.pointMm.y), z: mmToM(w.pointMm.z) };
  // (bodies of one model share the build frame: the point is the same in both)
  return { a: A, b: B, pa: P, pb: P, q0: { x: 0, y: 0, z: 0, w: 1 }, breakN: w.breakN, broken: false };
}

/**
 * Constraints solved with impulses before each physics step, all together (a few passes):
 * gear meshes, the friction of the hinges gears turn on, and breakable holds.
 * A row is Σ (v_body·lin + ω_body·ang) + bias = 0 with the impulse clamped to ±limit.
 */
function solveConstraints(gears: GearConstraint[], friction: FrictionRow[], welds: Weld[]) {
  const inv = (b: RAPIER.RigidBody, v: Vec3): Vec3 => {
    if (!b.isDynamic()) return { x: 0, y: 0, z: 0 };
    const e = b.effectiveWorldInvInertia().elements; // m11 m12 m13 m22 m23 m33
    return { x: e[0] * v.x + e[1] * v.y + e[2] * v.z, y: e[1] * v.x + e[3] * v.y + e[4] * v.z, z: e[2] * v.x + e[4] * v.y + e[5] * v.z };
  };
  const invMass = (b: RAPIER.RigidBody) => (b.isDynamic() && b.mass() > 0 ? 1 / b.mass() : 0);
  interface Term { b: RAPIER.RigidBody; lin?: Vec3; ang: Vec3 }
  interface Row { terms: Term[]; bias: number; limit: number; acc: number; onSlip?: () => void; group?: Weld }
  const zero = { x: 0, y: 0, z: 0 };
  const add = (p: Vec3, q: Vec3, s: number) => ({ x: p.x + q.x * s, y: p.y + q.y * s, z: p.z + q.z * s });
  const crossV = (p: Vec3, q: Vec3) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
  /** angular-only row from (body, vector, sign) triples; bodies may repeat */
  const angRow = (pairs: [RAPIER.RigidBody, Vec3, number][], bias: number, limit: number, onSlip?: () => void): Row => {
    const m = new Map<RAPIER.RigidBody, Vec3>();
    for (const [b, v, sgn] of pairs) m.set(b, add(m.get(b) ?? zero, v, sgn));
    return { terms: [...m].map(([b, ang]) => ({ b, ang })), bias, limit, acc: 0, onSlip };
  };
  const rows: Row[] = [];
  for (const g of gears) {
    if (!g.a.isDynamic() && !g.b.isDynamic()) continue;
    const Ja = rotate(toQ(g.fa.rotation()), g.ja), Jb = rotate(toQ(g.fb.rotation()), g.jb);
    rows.push(angRow([[g.a, Ja, 1], [g.fa, Ja, -1], [g.b, Jb, -1], [g.fb, Jb, 1]], (0.2 * g.err) / DT, g.maxImp, () => (g.err = 0)));
  }
  for (const f of friction) {
    if (!f.a.isDynamic() && !f.b.isDynamic()) continue;
    const J = rotate(toQ(f.a.rotation()), f.axis);
    const angle = hingeAngle(f.a, f.b, f.axis);
    let d = angle - f.hold;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rows.push(angRow([[f.b, J, 1], [f.a, J, -1]], (0.2 * d) / DT, f.torque * DT, () => (f.hold = angle)));
  }
  for (const w of welds) {
    if (w.broken || (!w.a.isDynamic() && !w.b.isDynamic())) continue;
    const qa = toQ(w.a.rotation()), qb = toQ(w.b.rotation());
    const ta = toV(w.a.translation()), tb = toV(w.b.translation());
    const PA = add(ta, rotate(qa, w.pa), 1), PB = add(tb, rotate(qb, w.pb), 1);
    const rA = add(PA, toV(w.a.worldCom()), -1), rB = add(PB, toV(w.b.worldCom()), -1);
    const e = add(PA, PB, -1);
    const limF = w.breakN * DT, limT = w.breakN * 0.05 * DT; // torque: the force at 5 cm
    for (const n of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
      rows.push({ terms: [{ b: w.a, lin: n, ang: crossV(rA, n) }, { b: w.b, lin: add(zero, n, -1), ang: add(zero, crossV(rB, n), -1) }], bias: (0.2 * dot(e, n)) / DT, limit: limF, acc: 0, group: w });
    }
    // rotation error: b relative to a, compared with when it was made (small-angle vector, world)
    const rel = qmul(conj(qa), qb), err = qmul(rel, conj(w.q0));
    const s = err.w < 0 ? -2 : 2;
    const th = rotate(qa, { x: err.x * s, y: err.y * s, z: err.z * s });
    for (const n of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
      rows.push({ terms: [{ b: w.b, ang: n }, { b: w.a, ang: add(zero, n, -1) }], bias: (0.2 * dot(th, n)) / DT, limit: limT, acc: 0, group: w });
    }
  }
  for (let pass = 0; pass < 8; pass++)
    for (const r of rows) {
      if (r.group?.broken) continue;
      let cdot = 0, k = 0;
      for (const t of r.terms) {
        cdot += dot(toV(t.b.angvel()), t.ang);
        k += dot(t.ang, inv(t.b, t.ang));
        if (t.lin) {
          cdot += dot(toV(t.b.linvel()), t.lin);
          k += invMass(t.b) * dot(t.lin, t.lin);
        }
      }
      if (k < 1e-15) continue;
      let lambda = -(cdot + r.bias) / k;
      const acc = Math.max(-r.limit, Math.min(r.limit, r.acc + lambda));
      if (Math.abs(r.acc + lambda) > r.limit && pass === 7) r.onSlip?.();
      lambda = acc - r.acc;
      r.acc = acc;
      for (const t of r.terms) {
        if (!t.b.isDynamic()) continue;
        t.b.applyTorqueImpulse({ x: t.ang.x * lambda, y: t.ang.y * lambda, z: t.ang.z * lambda }, true);
        if (t.lin) t.b.applyImpulse({ x: t.lin.x * lambda, y: t.lin.y * lambda, z: t.lin.z * lambda }, true);
      }
    }
  // a hold that had to push with all it has gives way
  for (const r of rows) if (r.group && !r.group.broken && Math.abs(r.acc) >= r.limit * 0.999) r.group.broken = true;
}

const qmul = (a: Quat, b: Quat): Quat => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });

function colliderDesc(s: ShapeSpec): RAPIER.ColliderDesc {
  const p = { x: mmToM(s.posMm.x), y: mmToM(s.posMm.y), z: mmToM(s.posMm.z) };
  switch (s.kind) {
    case "box": {
      const d = RAPIER.ColliderDesc.cuboid(mmToM(s.sizeMm.x) / 2, mmToM(s.sizeMm.y) / 2, mmToM(s.sizeMm.z) / 2).setTranslation(p.x, p.y, p.z);
      if (s.rot) d.setRotation(s.rot);
      return d;
    }
    case "cylinder": {
      const d = RAPIER.ColliderDesc.cylinder(mmToM(s.lengthMm) / 2, mmToM(s.radiusMm)).setTranslation(p.x, p.y, p.z);
      // Rapier cylinders are along +y.
      if (s.rot) d.setRotation(s.rot);
      else if (s.axis === "x") d.setRotation(quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2));
      else if (s.axis === "z") d.setRotation(quatFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2));
      return d;
    }
    case "sphere":
      return RAPIER.ColliderDesc.ball(mmToM(s.radiusMm)).setTranslation(p.x, p.y, p.z);
  }
}

function shapeVolume(s: ShapeSpec): number {
  switch (s.kind) {
    case "box": return s.sizeMm.x * s.sizeMm.y * s.sizeMm.z;
    case "cylinder": return Math.PI * s.radiusMm * s.radiusMm * s.lengthMm;
    case "sphere": return (4 / 3) * Math.PI * s.radiusMm ** 3;
  }
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
