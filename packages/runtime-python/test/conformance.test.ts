// Runs example programs from docs.txt (SPIKE Prime Python guide) and checks the observable
// behaviour the documentation describes.
import { describe, expect, it } from "vitest";
import season from "../../../seasons/2026-27/season.json";
import { Simulation, SpikeApi, makeDriveBase, type SeasonConfig } from "@fll-sim/sim";
import { runPython, settle } from "../src";
import { loadPythonFiles, micropythonWasmPath } from "../src/node";

const files = loadPythonFiles();
const wasmUrl = micropythonWasmPath();

async function run(source: string, opts: { timeLimitMs?: number; trace?: (api: SpikeApi) => void } = {}) {
  const sim = await Simulation.create({ season: season as SeasonConfig, robot: makeDriveBase({ attachmentPorts: ["E", "F"], distancePort: "D", colorPorts: [{ port: "C", xMm: 0, zMm: -88 }] }), start: { xMm: 1000, yMm: 300, headingDeg: 0 } });
  sim.stepMs(200);
  const t0 = sim.timeMs;
  const api = new SpikeApi(sim);
  const out: string[] = [];
  const res = await runPython({ api, files, source, wasmUrl, timeLimitMs: opts.timeLimitMs ?? 60000, hooks: { stdout: (l) => out.push(l), onTick: () => opts.trace?.(api) } });
  return { sim, api, out, res, t0 };
}

// Attachment motors are E and F on this test robot (A/B drive, C colour, D distance).
describe("SPIKE Python conformance (docs.txt examples)", () => {
  it("prints and handles basic Python", async () => {
    const { out, res } = await run("print('LEGO')\nif True:\n    print(123)\n");
    expect(res.ok).toBe(true);
    expect(out).toEqual(["LEGO", "123"]);
  });

  it("run_for_degrees without await starts immediately; both motors run concurrently", async () => {
    const src = `import motor\nfrom hub import port\nmotor.run_for_degrees(port.E, 360, 720)\nmotor.run_for_degrees(port.F, 360, 720)\n`;
    const { api, res, sim, t0 } = await run(src);
    expect(res.ok).toBe(true);
    expect(sim.timeMs - t0).toBeLessThan(5); // program itself returns immediately
    settle(api);
    expect(Math.abs(api.motorRelativePosition(4) - 360)).toBeLessThanOrEqual(5);
    expect(Math.abs(api.motorRelativePosition(5) - 360)).toBeLessThanOrEqual(5);
  });

  it("awaited commands run sequentially inside runloop", async () => {
    const src = `import motor, runloop, time
from hub import port
log = []
async def main():
    t = time.ticks_ms()
    await motor.run_for_degrees(port.E, 360, 720)
    log.append(time.ticks_ms() - t)
    await motor.run_for_degrees(port.F, 360, 720)
    log.append(time.ticks_ms() - t)
    print(log, motor.relative_position(port.E), motor.relative_position(port.F))
runloop.run(main())
`;
    const { out, res } = await run(src);
    expect(res.ok, res.error).toBe(true);
    const m = out[0].match(/\[(\d+), (\d+)\] (-?\d+) (-?\d+)/)!;
    const [a, b, pe, pf] = m.slice(1).map(Number);
    // 360 deg at 720 deg/s with 1000 deg/s^2 ramps: t = 0.72 + 0.36/0.72... ~ 1.2 s each
    expect(a).toBeGreaterThan(1000);
    expect(a).toBeLessThan(1500);
    expect(b - a).toBeGreaterThan(1000);
    expect(Math.abs(pe - 360)).toBeLessThanOrEqual(5);
    expect(Math.abs(pf - 360)).toBeLessThanOrEqual(5);
  });

  it("await returns the documented status constant", async () => {
    const src = `import motor, runloop\nfrom hub import port\nasync def main():\n    r = await motor.run_for_degrees(port.E, 90, 500)\n    print(r == motor.READY, r)\nrunloop.run(main())\n`;
    const { out } = await run(src);
    expect(out[0]).toBe("True 0");
  });

  it("time.sleep_ms blocks all coroutines; runloop.sleep_ms does not", async () => {
    const src = `import runloop, time
order = []
async def a():
    order.append('a1')
    time.sleep_ms(300)
    order.append('a2')
    await runloop.sleep_ms(1)
async def b():
    order.append('b1')
    await runloop.sleep_ms(100)
    order.append('b2')
runloop.run(a(), b())
print(order)
`;
    const { out } = await run(src);
    // a blocks for 300 ms before b even starts
    expect(out[0]).toBe("['a1', 'a2', 'b1', 'b2']");
    const src2 = src.replace("time.sleep_ms(300)", "await runloop.sleep_ms(300)");
    const r2 = await run(src2);
    expect(r2.out[0]).toBe("['a1', 'b1', 'b2', 'a2']");
  });

  it("global/local variables and for loop example (velocity 450->990)", async () => {
    const src = `import motor
import runloop
from hub import port
velocity = 450
async def main():
    global velocity
    degrees = 360
    for i in range(4):
        velocity = velocity + i*90
        await motor.run_for_degrees(port.E, degrees, velocity)
    await motor.run_for_degrees(port.F, degrees, velocity)
    print(velocity, motor.relative_position(port.E))
runloop.run(main())
`;
    const { out, res } = await run(src);
    expect(res.ok, res.error).toBe(true);
    const [v, pos] = out[0].split(" ").map(Number);
    expect(v).toBe(990);
    expect(Math.abs(pos - 1440)).toBeLessThanOrEqual(6);
  });

  it("floats are rejected like on the hub", async () => {
    const { res } = await run("import motor\nfrom hub import port\nmotor.run(port.E, 500.5)\n");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("TypeError: can't convert float to int");
    expect(res.errorLine).toBe(3);
  });

  it("using a port with nothing connected raises ENODEV with the line number", async () => {
    const { res } = await run("import force_sensor\nfrom hub import port\n\nprint(force_sensor.force(port.B))\n");
    // port B is a drive motor, not a force sensor
    expect(res.ok).toBe(false);
    expect(res.error).toContain("OSError: [Errno 19] ENODEV");
    expect(res.error).toContain('File "program.py", line 4');
  });

  it("tight polling loops still advance simulated time", async () => {
    const src = `import time, color_sensor\nfrom hub import port\nt = time.ticks_ms()\nn = 0\nwhile time.ticks_diff(time.ticks_ms(), t) < 500:\n    color_sensor.reflection(port.C)\n    n += 1\nprint(n)\n`;
    const { out, res } = await run(src);
    expect(res.ok, res.error).toBe(true);
    expect(Number(out[0])).toBeGreaterThan(1000);
  });

  it("motor_pair drives straight and runloop.until waits on a condition", async () => {
    const src = `import motor_pair, runloop, distance_sensor, color_sensor
from hub import port, motion_sensor
async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motion_sensor.reset_yaw(0)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 720, 0, velocity=500)
    print('yaw', motion_sensor.tilt_angles()[0])
    print('refl', color_sensor.reflection(port.C), 'dist', distance_sensor.distance(port.D))
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=300)
    await runloop.until(lambda: False, 400)
    motor_pair.stop(motor_pair.PAIR_1)
runloop.run(main())
`;
    const { out, res, sim } = await run(src);
    expect(res.ok, res.error).toBe(true);
    const yaw = Number(out[0].split(" ")[1]);
    expect(Math.abs(yaw)).toBeLessThan(20);
    const pose = sim.robotPose();
    // 720 deg = 351.9 mm, then 400 ms from rest at 300 deg/s (1000 deg/s^2) = 75 deg = 36.7 mm, then braking
    expect(pose.yMm).toBeGreaterThan(300 + 351.9 + 30);
    expect(pose.yMm).toBeLessThan(300 + 351.9 + 50);
    expect(out[1]).toMatch(/^refl \d+ dist -?\d+$/);
  });

  it("light matrix show_image and write (awaitable)", async () => {
    const src = `from hub import light_matrix\nimport runloop\nasync def main():\n    light_matrix.show_image(light_matrix.IMAGE_HAPPY)\n    print(light_matrix.get_pixel(1, 1))\n    await light_matrix.write('Hi')\n    print(light_matrix.get_pixel(2, 2))\nrunloop.run(main())\n`;
    const { out, res, sim, t0 } = await run(src);
    expect(res.ok, res.error).toBe(true);
    expect(out).toEqual(["100", "0"]);
    expect(sim.timeMs - t0).toBeGreaterThan(900);
  });

  it("stop limit aborts an infinite loop", async () => {
    const { res } = await run("import time\nwhile True:\n    time.sleep_ms(10)\n", { timeLimitMs: 2000 });
    expect(res.stopped).toBe(true);
  });

  it("gyro turn then straight move: stays synchronized (no swerve)", async () => {
    const src = `from hub import port, motion_sensor
import motor_pair, runloop
async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motion_sensor.reset_yaw(0)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 614, 0, velocity=500)
    motor_pair.move_tank(motor_pair.PAIR_1, 200, -200)
    while motion_sensor.tilt_angles()[0] > -900:
        await runloop.sleep_ms(5)
    motor_pair.stop(motor_pair.PAIR_1)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 400, 0, velocity=500)
runloop.run(main())
`;
    let maxDev = 0;
    const { sim, res } = await run(src, {
      trace: (api) => {
        const p = api.sim.robotPose();
        if (api.sim.timeMs > 3600) maxDev = Math.max(maxDev, Math.abs(p.headingDeg + 90));
      },
    });
    expect(res.ok, res.error).toBe(true);
    const p = sim.robotPose();
    // Start (1000, 300); 614 deg = 300 mm north; turn right; 400 deg = 195 mm east.
    console.log("end pose", p, "max heading deviation after turn", maxDev);
    expect(Math.abs(p.yMm - (300 + 300))).toBeLessThan(25);
    expect(Math.abs(p.xMm - (1000 + 195))).toBeLessThan(40);
    expect(maxDev).toBeLessThan(15);
  });
});
