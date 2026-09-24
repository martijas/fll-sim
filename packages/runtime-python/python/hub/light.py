import _sim
from _spike import _int

POWER = 0
CONNECT = 1


def color(light, color):
    _sim.call('lightColor', _int(light), _int(color))
