from app._ui import post, query, Done


def clear(color):
    post('line.clear', color)


def clear_all():
    post('line.clear_all')


def _q(kind, color):
    v = query(kind, color)
    return Done(v)


def get_average(color):
    return _q('line.avg', color)


def get_last(color):
    return _q('line.last', color)


def get_max(color):
    return _q('line.max', color)


def get_min(color):
    return _q('line.min', color)


def hide():
    post('line.hide')


def plot(color, x, y):
    post('line.plot', color, x, y)


def show(fullscreen):
    post('line.show', fullscreen)
