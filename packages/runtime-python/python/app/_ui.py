import _sim


def post(kind, *args):
    _sim.app(kind, '\x1f'.join([str(a) for a in args]))


def query(kind, *args):
    return _sim.appq(kind, '\x1f'.join([str(a) for a in args]))


class Done:
    def __iter__(self):
        return self.value
        yield

    __await__ = __iter__

    def __init__(self, value=None):
        self.value = value
