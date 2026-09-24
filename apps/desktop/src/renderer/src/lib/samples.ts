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
