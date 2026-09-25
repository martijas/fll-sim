import type { ScratchProject } from "@fll-sim/llsp3";
import { emptyProject, programTarget } from "@fll-sim/runtime-blocks";

export const DEFAULT_PROGRAM = `# FLL Sim — SPIKE Prime Python
# Robot: drive motors A (left) + B (right), colour sensors C + D (down), distance sensor E (front).
from hub import port, light_matrix, motion_sensor
import motor_pair
import runloop


async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motion_sensor.reset_yaw(0)
    light_matrix.show_image(light_matrix.IMAGE_HAPPY)

    # Drive forward 30 cm (56 mm wheel: 1 rotation = 175.9 mm)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 614, 0, velocity=500)

    # Turn right 90 degrees using the gyro
    motor_pair.move_tank(motor_pair.PAIR_1, 200, -200)
    while motion_sensor.tilt_angles()[0] > -900:
        await runloop.sleep_ms(5)
    motor_pair.stop(motor_pair.PAIR_1)

    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 400, 0, velocity=500)
    print('yaw:', motion_sensor.tilt_angles()[0] / 10)

runloop.run(main())
`;

/** A new Word Blocks project: set the drive motors (from the robot's ports) and move forward. */
export function starterBlocks(robot: { leftPort: string; rightPort: string }): ScratchProject {
  const p = emptyProject();
  const stmt = (opcode: string, parent: string, next: string | null, inputs: Record<string, unknown[]> = {}, fields: Record<string, unknown[]> = {}) =>
    ({ opcode, next, parent, inputs, fields, shadow: false, topLevel: false });
  const menu = (opcode: string, parent: string, value: string) =>
    ({ opcode, next: null, parent, inputs: {}, fields: { [`field_${opcode}`]: [value, null] }, shadow: true, topLevel: false });
  programTarget(p).blocks = {
    start: { opcode: "flipperevents_whenProgramStarts", next: "pair", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 60 },
    pair: stmt("flippermove_setMovementPair", "start", "speed", { PAIR: [1, "pairMenu"] }),
    pairMenu: menu("flippermove_movement-port-selector", "pair", robot.leftPort + robot.rightPort),
    speed: stmt("flippermove_movementSpeed", "pair", "move", { SPEED: [1, [4, "50"]] }),
    move: stmt("flippermove_move", "speed", null, { DIRECTION: [1, "dir"], VALUE: [1, [4, "20"]] }, { UNIT: ["cm", null] }),
    dir: menu("flippermove_custom-icon-direction", "move", "forward"),
  } as never;
  p.extensions = ["flipperevents", "flippermove"];
  return p;
}
