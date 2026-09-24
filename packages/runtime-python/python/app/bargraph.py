from app._ui import post, query, Done


def change(color, value):
    post('bar.change', color, value)


def clear_all():
    post('bar.clear_all')


def get_value(color):
    return Done(query('bar.get', color))


def hide():
    post('bar.hide')


def set_value(color, value):
    post('bar.set', color, value)


def show(fullscreen):
    post('bar.show', fullscreen)
