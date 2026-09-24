import _sim
from _spike import Cmd, _int, _need

READY = 0
RUNNING = 1
STALLED = 2
CANCELED = 3
CANCELLED = 3
ERROR = 4
DISCONNECTED = 5

COAST = 0
BRAKE = 1
HOLD = 2
CONTINUE = 3
SMART_COAST = 4
SMART_BRAKE = 5

CLOCKWISE = 0
COUNTERCLOCKWISE = 1
SHORTEST_PATH = 2
LONGEST_PATH = 3


def _m(port):
    return _need(port, 'motor')


def absolute_position(port):
    return _sim.call('motorAbsolutePosition', _m(port))


def relative_position(port):
    return _sim.call('motorRelativePosition', _m(port))


def reset_relative_position(port, position):
    _sim.call('motorResetRelativePosition', _m(port), _int(position))


def velocity(port):
    return _sim.call('motorVelocity', _m(port))


def get_duty_cycle(port):
    return _sim.call('motorDutyCycle', _m(port))


def set_duty_cycle(port, pwm):
    _sim.call('motorSetDutyCycle', _m(port), _int(pwm))


def run(port, velocity, *, acceleration=1000):
    _sim.call('motorRun', _m(port), _int(velocity), _int(acceleration))


def run_for_degrees(port, degrees, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('runForDegrees', _m(port), _int(degrees), _int(velocity), _int(stop), _int(acceleration), _int(deceleration)))


def run_for_time(port, duration, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('runForTime', _m(port), _int(duration), _int(velocity), _int(stop), _int(acceleration), _int(deceleration)))


def run_to_absolute_position(port, position, velocity, *, direction=SHORTEST_PATH, stop=BRAKE, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('runToAbsolutePosition', _m(port), _int(position), _int(velocity), _int(direction), _int(stop), _int(acceleration), _int(deceleration)))


def run_to_relative_position(port, position, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('runToRelativePosition', _m(port), _int(position), _int(velocity), _int(stop), _int(acceleration), _int(deceleration)))


def stop(port, *, stop=BRAKE):
    _sim.call('motorStop', _m(port), _int(stop))
