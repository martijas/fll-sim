import _sim
from _spike import _int, _port, tup


def data(port):
    return tup(_sim.call('deviceData', _port(port)))


def id(port):
    return _sim.call('deviceId', _port(port))


def get_duty_cycle(port):
    p = _port(port)
    return _sim.call('motorDutyCycle', p) if _sim.dk(p) == 'motor' else 0


def set_duty_cycle(port, duty_cycle):
    p = _port(port)
    if _sim.dk(p) == 'motor':
        _sim.call('motorSetDutyCycle', p, _int(duty_cycle))


def ready(port):
    return _sim.dk(_port(port)) is not None
