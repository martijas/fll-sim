import _sim
from _spike import Cmd, _int, _need

PAIR_1 = 0
PAIR_2 = 1
PAIR_3 = 2

_paired = [False, False, False]


def _slot(pair):
    p = _int(pair)
    if p < 0 or p > 2:
        raise ValueError('invalid pair')
    if not _paired[p]:
        raise RuntimeError('pair is not paired')
    return p


def pair(pair, left_motor, right_motor):
    p = _int(pair)
    _need(left_motor, 'motor')
    _need(right_motor, 'motor')
    _sim.call('pair', p, left_motor, right_motor)
    _paired[p] = True


def unpair(pair):
    p = _int(pair)
    _sim.call('unpair', p)
    _paired[p] = False


def move(pair, steering, *, velocity=360, acceleration=1000):
    _sim.call('pairMove', _slot(pair), _int(steering), _int(velocity), _int(acceleration))


def move_tank(pair, left_velocity, right_velocity, *, acceleration=1000):
    _sim.call('pairMoveTank', _slot(pair), _int(left_velocity), _int(right_velocity), _int(acceleration))


def move_for_degrees(pair, degrees, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('pairMoveForDegrees', _slot(pair), _int(degrees), _int(steering), _int(velocity), _int(stop), _int(acceleration), _int(deceleration)))


def move_for_time(pair, duration, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('pairMoveForTime', _slot(pair), _int(duration), _int(steering), _int(velocity), _int(stop), _int(acceleration), _int(deceleration)))


def move_tank_for_degrees(pair, degrees, left_velocity, right_velocity, *, stop=1, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('pairMoveTankForDegrees', _slot(pair), _int(degrees), _int(left_velocity), _int(right_velocity), _int(stop), _int(acceleration), _int(deceleration)))


def move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=1, acceleration=1000, deceleration=1000):
    return Cmd(_sim.call('pairMoveTankForTime', _slot(pair), _int(left_velocity), _int(right_velocity), _int(duration), _int(stop), _int(acceleration), _int(deceleration)))


def stop(pair, *, stop=1):
    _sim.call('pairStop', _slot(pair), _int(stop))
