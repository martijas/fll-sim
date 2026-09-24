import _sim
from _spike import _int, _need


def distance(port):
    return _sim.call('distance', _need(port, 'distance'))


def clear(port):
    _sim.call('distanceShow', _need(port, 'distance'), '0,0,0,0')


def get_pixel(port, x, y):
    return _sim.call('distanceGetPixel', _need(port, 'distance'), _int(x), _int(y))


def set_pixel(port, x, y, intensity):
    _sim.call('distanceSetPixel', _need(port, 'distance'), _int(x), _int(y), _int(intensity))


def show(port, pixels):
    _sim.call('distanceShow', _need(port, 'distance'), ','.join([str(_int(p)) for p in pixels]))
