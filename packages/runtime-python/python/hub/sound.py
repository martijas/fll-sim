import _sim
from _spike import Cmd, _int

ANY = -2
DEFAULT = -1
WAVEFORM_SINE = 1
WAVEFORM_SAWTOOTH = 3
WAVEFORM_SQUARE = 2
WAVEFORM_TRIANGLE = 1


def beep(freq=440, duration=500, volume=100, *, attack=0, decay=0, sustain=100, release=0, transition=10, waveform=WAVEFORM_SINE, channel=DEFAULT):
    return Cmd(_sim.call('beep', _int(freq), _int(duration), _int(volume), _int(waveform)))


def stop():
    _sim.call('soundStop')


def volume(volume):
    _sim.call('soundVolume', _int(volume))
