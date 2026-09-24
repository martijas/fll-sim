import _sim
from _spike import _need, tup


def color(port):
    return _sim.call('colorSensorColor', _need(port, 'color'))


def reflection(port):
    return _sim.call('colorSensorReflection', _need(port, 'color'))


def rgbi(port):
    return tup(_sim.call('colorSensorRgbi', _need(port, 'color')))
