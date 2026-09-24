# No 3x3 Color Matrix is modelled yet: every call raises ENODEV like an empty port.
from _spike import _need


def clear(port):
    _need(port, 'color_matrix')


def get_pixel(port, x, y):
    _need(port, 'color_matrix')


def set_pixel(port, x, y, pixel):
    _need(port, 'color_matrix')


def show(port, pixels):
    _need(port, 'color_matrix')
