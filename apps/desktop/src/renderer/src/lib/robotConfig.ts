import type { DriveBaseOptions, Port } from "@fll-sim/sim";

export interface RobotConfig {
  name: string;
  leftPort: Port;
  rightPort: Port;
  driveMotor: "medium" | "large";
  wheelDiameterMm: number;
  trackWidthMm: number;
  colorPorts: Port[];
  distancePort: Port | "";
  attachmentPorts: Port[];
}

export const PRESETS: RobotConfig[] = [
  { name: "FLL Sim default", leftPort: "A", rightPort: "B", driveMotor: "medium", wheelDiameterMm: 56, trackWidthMm: 120, colorPorts: ["C", "D"], distancePort: "E", attachmentPorts: ["F"] },
  { name: "SPIKE guided mission (drive C+D, colour B, arm E)", leftPort: "C", rightPort: "D", driveMotor: "medium", wheelDiameterMm: 56, trackWidthMm: 112, colorPorts: ["B"], distancePort: "", attachmentPorts: ["E"] },
  { name: "Advanced Driving Base (drive A+E, colour C+D, arms B+F)", leftPort: "A", rightPort: "E", driveMotor: "medium", wheelDiameterMm: 56, trackWidthMm: 112, colorPorts: ["C", "D"], distancePort: "", attachmentPorts: ["B", "F"] },
];

const KEY = "fllsim.robot";

export function loadRobotConfig(): RobotConfig {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...PRESETS[0], ...JSON.parse(s) };
  } catch {
    /* storage unavailable */
  }
  return PRESETS[0];
}

export function saveRobotConfig(c: RobotConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** Ports used twice make the configuration invalid. */
export function configProblems(c: RobotConfig): string[] {
  const used = [c.leftPort, c.rightPort, ...c.colorPorts, ...(c.distancePort ? [c.distancePort] : []), ...c.attachmentPorts];
  const dup = used.filter((p, i) => used.indexOf(p) !== i);
  const out: string[] = [];
  if (dup.length) out.push(`Port${dup.length > 1 ? "s" : ""} ${[...new Set(dup)].join(", ")} used more than once`);
  if (c.leftPort === c.rightPort) out.push("Left and right drive motors must be on different ports");
  return out;
}

export function toDriveBaseOptions(c: RobotConfig): DriveBaseOptions {
  const n = c.colorPorts.length;
  const spacing = 48;
  return {
    leftPort: c.leftPort,
    rightPort: c.rightPort,
    driveMotor: c.driveMotor,
    wheelDiameterMm: c.wheelDiameterMm,
    trackWidthMm: c.trackWidthMm,
    colorPorts: c.colorPorts.map((port, i) => ({ port, xMm: (i - (n - 1) / 2) * spacing, zMm: -88 })),
    distancePort: c.distancePort || null,
    attachmentPorts: c.attachmentPorts.slice(0, 2),
  };
}
