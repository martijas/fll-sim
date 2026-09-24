import _sim
from _spike import Cmd, Sleep, Until, _int

_FAR = 1 << 30


def sleep_ms(duration):
    return Sleep(duration)


def until(function, timeout=0):
    return Until(function, _int(timeout))


def _ready(w):
    if w is None:
        return True
    t = type(w)
    if t is Cmd:
        return _sim.st(w.id) != 1
    if t is Sleep:
        return _sim.now() >= w.until
    if t is Until:
        return w.done()
    return True


def run(*functions):
    tasks = [[f, None] for f in functions]
    while tasks:
        for t in list(tasks):
            if _ready(t[1]):
                try:
                    t[1] = t[0].send(None)
                except StopIteration:
                    tasks.remove(t)
        if not tasks:
            break
        # Block the simulation until something can make progress.
        deadline = _FAR
        ids = []
        poll = False
        for t in tasks:
            w = t[1]
            tw = type(w)
            if tw is Sleep:
                if w.until < deadline:
                    deadline = w.until
            elif tw is Cmd:
                ids.append(w.id)
            else:
                poll = True
        now = _sim.now()
        if poll or deadline <= now:
            _sim.wait(now + 1, '')
        else:
            _sim.wait(deadline, ','.join([str(i) for i in ids]))
