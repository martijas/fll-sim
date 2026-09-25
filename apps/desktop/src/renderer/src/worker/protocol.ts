import type { ColorCalibration, FieldModel, FieldSnapshot, HubEvent, RobotModel, SceneBody, SeasonConfig, StartPose } from "@fll-sim/sim";
import type { RunResult } from "@fll-sim/runtime-python";

/** Int32 slots in the shared control buffer. */
export const CTRL = { PAUSE: 0, SPEED_X100: 1, BTN_LEFT: 2, BTN_RIGHT: 3, WAKE: 4, STOP: 5, SIZE: 8 } as const;

export interface MatPayload { width: number; height: number; data: ArrayBuffer }

export type ToWorker =
  | { type: "init"; season: SeasonConfig; mat: MatPayload | null; robot: RobotModel; start: StartPose; ctrl: SharedArrayBuffer; fieldModels: FieldModel[]; footprints: boolean; colorCalibration?: ColorCalibration }
  | { type: "run"; source: string; timeLimitMs?: number }
  /** the mission models' state now (for automatic scoring) */
  | { type: "snapshot" }
  /** another robot (e.g. a tool changed) where the robot is now, or at `pose`; the field stays */
  | { type: "replaceRobot"; robot: RobotModel; pose?: StartPose };

export interface MotorTelemetry { port: string; relPos: number; absPos: number; speed: number; duty: number }
export interface SensorTelemetry { port: string; type: string; value: string }

export interface Frame {
  type: "frame";
  timeMs: number;
  transforms: Float32Array;
  pixels: number[];
  lights: Record<number, number>;
  pose: { xMm: number; yMm: number; headingDeg: number };
  yaw: number;
  motors: MotorTelemetry[];
  sensors: SensorTelemetry[];
  running: boolean;
}

export type FromWorker =
  | { type: "scene"; bodies: SceneBody[]; bodyIds: string[] }
  | Frame
  | { type: "stdout"; line: string }
  | { type: "hub"; events: HubEvent[] }
  | { type: "app"; kind: string; args: string[] }
  | { type: "done"; result: RunResult; snapshot: FieldSnapshot }
  | { type: "snapshot"; snapshot: FieldSnapshot }
  | { type: "fatal"; message: string };
