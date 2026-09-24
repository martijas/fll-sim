import _sim
from . import port, button, light, light_matrix, motion_sensor, sound


def device_uuid():
    return 'SIM-0000-0000-0000'


def hardware_id():
    return 'SIMHUB'


def power_off():
    _sim.call('powerOff')
    return 0


def temperature():
    return _sim.call('temperature')
