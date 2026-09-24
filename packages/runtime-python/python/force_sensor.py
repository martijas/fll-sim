import _sim
from _spike import _need


def force(port):
    return _sim.call('forceValue', _need(port, 'force'))


def pressed(port):
    return force(port) > 0


def raw(port):
    return force(port) * 10
