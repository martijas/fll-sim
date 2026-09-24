# Simulated `time`: sleeping blocks the whole program while simulated time passes.
import _sim


def sleep_ms(ms):
    _sim.step(int(ms))


def sleep_us(us):
    _sim.step(int(us) // 1000)


def sleep(s):
    _sim.step(int(s * 1000))


def ticks_ms():
    return _sim.now()


def ticks_us():
    return _sim.now() * 1000


def ticks_add(t, d):
    return t + d


def ticks_diff(a, b):
    return a - b


def time():
    return _sim.now() // 1000


def time_ns():
    return _sim.now() * 1000000
