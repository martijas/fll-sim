# Shared helpers for the simulated SPIKE Prime modules.
import _sim

RUNNING = 1


def _int(x, name='value'):
    # The hub's C modules only accept ints (MicroPython raises this exact error for floats).
    if isinstance(x, bool):
        return int(x)
    if isinstance(x, int):
        return x
    if isinstance(x, float):
        raise TypeError("can't convert float to int")
    raise TypeError("can't convert %s to int" % type(x).__name__)


def _port(p):
    p = _int(p)
    if p < 0 or p > 5:
        raise ValueError('invalid port')
    return p


def _need(p, kind):
    p = _port(p)
    k = _sim.dk(p)
    if k != kind:
        raise OSError(19)
    return p


class Cmd:
    """Awaitable for a command already started on the hub; resolves to its status."""
    __slots__ = ('id',)

    def __init__(self, i):
        self.id = i

    def __iter__(self):
        while True:
            s = _sim.st(self.id)
            if s != RUNNING:
                return s
            yield self

    __await__ = __iter__


class Sleep:
    __slots__ = ('until',)

    def __init__(self, ms):
        self.until = _sim.now() + max(0, _int(ms))

    def __iter__(self):
        while _sim.now() < self.until:
            yield self

    __await__ = __iter__


class Until:
    __slots__ = ('fn', 'until')

    def __init__(self, fn, timeout):
        self.fn = fn
        self.until = _sim.now() + timeout if timeout > 0 else -1

    def done(self):
        if self.fn():
            return True
        return self.until >= 0 and _sim.now() >= self.until

    def __iter__(self):
        while not self.done():
            yield self

    __await__ = __iter__


def tup(js):
    return tuple(js)
