import _sim
from _spike import _int, tup

TAPPED = 0
DOUBLE_TAPPED = 1
SHAKEN = 2
FALLING = 3
UNKNOWN = -1

TOP = 0
FRONT = 1
RIGHT = 2
BOTTOM = 3
BACK = 4
LEFT = 5

_yaw_face = TOP
_taps = 0


def acceleration(raw_unfiltered=False):
    return tup(_sim.call('acceleration'))


def angular_velocity(raw_unfiltered=False):
    return tup(_sim.call('angularVelocity'))


def gesture():
    return UNKNOWN


def get_yaw_face():
    return _yaw_face


def set_yaw_face(up):
    global _yaw_face
    _yaw_face = _int(up)
    return True


def quaternion():
    return tup(_sim.call('quaternion'))


def reset_tap_count():
    global _taps
    _taps = 0


def reset_yaw(angle):
    _sim.call('resetYaw', _int(angle))


def stable():
    return _sim.call('stable')


def tap_count():
    return _taps


def tilt_angles():
    return tup(_sim.call('tiltAngles'))


def up_face():
    return _sim.call('upFace')
