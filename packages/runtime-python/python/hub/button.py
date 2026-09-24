import _sim
from _spike import _int

LEFT = 1
RIGHT = 2


def pressed(button):
    return _sim.call('buttonPressed', _int(button))
