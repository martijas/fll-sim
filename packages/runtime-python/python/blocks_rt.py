# Runtime for SPIKE Word Blocks programs compiled to Python (see packages/runtime-blocks).
# Implements Scratch semantics: hat-block stacks run as concurrent tasks, edge-triggered hats,
# broadcasts, stop blocks, loose typing; and SPIKE block defaults (motor speed 75 %,
# movement speed 50 %, 17.6 cm per wheel rotation, stop = brake).
import _sim
import math
import random
from _spike import Cmd, Sleep, Until

PORTS = 'ABCDEF'
_FAR = 1 << 30


class StopProgram(Exception):
    pass


# ---------------------------------------------------------------------------- values
def num(v):
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, (int, float)):
        return v
    try:
        s = str(v).strip()
        if s == '':
            return 0
        f = float(s)
        i = int(f)
        return i if f == i and 'e' not in s.lower() and '.' not in s else f
    except (ValueError, TypeError):
        return 0


def tostr(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return str(v)


def truthy(v):
    if isinstance(v, str):
        return v.lower() not in ('', '0', 'false')
    return bool(v)


def _isnum(v):
    try:
        float(str(v))
        return str(v).strip() != ''
    except ValueError:
        return False


def cmp(a, b):
    if _isnum(a) and _isnum(b):
        x, y = float(str(a)), float(str(b))
        return (x > y) - (x < y)
    x, y = tostr(a).lower(), tostr(b).lower()
    return (x > y) - (x < y)


def eq(a, b):
    return cmp(a, b) == 0


def lt(a, b):
    return cmp(a, b) < 0


def gt(a, b):
    return cmp(a, b) > 0


def add(a, b):
    return num(a) + num(b)


def sub(a, b):
    return num(a) - num(b)


def mul(a, b):
    return num(a) * num(b)


def div(a, b):
    b = num(b)
    if b == 0:
        a = num(a)
        return float('inf') if a > 0 else float('-inf') if a < 0 else float('nan')
    return num(a) / b


def mod(a, b):
    b = num(b)
    if b == 0:
        return float('nan')
    return num(a) % b


def rnd(a, b):
    lo, hi = num(a), num(b)
    if lo > hi:
        lo, hi = hi, lo
    if isinstance(lo, int) and isinstance(hi, int) and '.' not in str(a) + str(b):
        return random.randint(lo, hi)
    return lo + random.random() * (hi - lo)


def round_(v):
    return int(math.floor(num(v) + 0.5))


def mathop(op, v):
    x = num(v)
    r = math.radians
    ops = {
        'abs': lambda: abs(x), 'floor': lambda: math.floor(x), 'ceiling': lambda: math.ceil(x),
        'sqrt': lambda: math.sqrt(x), 'sin': lambda: round(math.sin(r(x)), 10), 'cos': lambda: round(math.cos(r(x)), 10),
        'tan': lambda: math.tan(r(x)), 'asin': lambda: math.degrees(math.asin(x)), 'acos': lambda: math.degrees(math.acos(x)),
        'atan': lambda: math.degrees(math.atan(x)), 'ln': lambda: math.log(x), 'log': lambda: math.log(x) / math.log(10),
        'e ^': lambda: math.exp(x), '10 ^': lambda: 10 ** x,
    }
    try:
        return ops.get(op, lambda: x)()
    except (ValueError, OverflowError):
        return float('nan')


def join(a, b):
    return tostr(a) + tostr(b)


def letter_of(i, s):
    s = tostr(s)
    i = int(num(i))
    return s[i - 1] if 1 <= i <= len(s) else ''


def contains(s, sub_):
    return tostr(sub_).lower() in tostr(s).lower()


def between(v, lo, hi):
    return num(lo) <= num(v) <= num(hi)


def change_var(V, name, by):
    V[name] = num(V.get(name, 0)) + num(by)


# ---------------------------------------------------------------------------- lists (1-indexed)
def _idx(L, i, extra=0):
    if tostr(i) == 'last':
        return len(L) - 1 + extra
    if tostr(i) == 'random':
        return random.randint(0, max(0, len(L) - 1 + extra))
    return int(num(i)) - 1


def list_add(L, v):
    L.append(v)


def list_delete(L, i):
    if tostr(i) == 'all':
        L.clear()
        return
    k = _idx(L, i)
    if 0 <= k < len(L):
        L.pop(k)


def list_insert(L, i, v):
    k = _idx(L, i, 1)
    if 0 <= k <= len(L):
        L.insert(k, v)


def list_replace(L, i, v):
    k = _idx(L, i)
    if 0 <= k < len(L):
        L[k] = v


def list_item(L, i):
    k = _idx(L, i)
    return L[k] if 0 <= k < len(L) else ''


def list_index(L, v):
    for k, x in enumerate(L):
        if eq(x, v):
            return k + 1
    return 0


def list_contains(L, v):
    return list_index(L, v) > 0


def list_str(L):
    if all(len(tostr(x)) == 1 for x in L):
        return ''.join(tostr(x) for x in L)
    return ' '.join(tostr(x) for x in L)


# ---------------------------------------------------------------------------- scheduler
class Task:
    __slots__ = ('fn', 'key', 'coro', 'w', 'done')

    def __init__(self, fn, key):
        self.fn = fn
        self.key = key
        self.coro = fn()
        self.w = None
        self.done = False


_tasks = []
_starts = []
_watchers = []  # [cond, fn, key, prev]
_receivers = {}  # message -> [(fn, key)]
_current = None


def on_start(fn):
    _starts.append(fn)


def on_condition(cond, fn):
    # Edge-triggered hat: starts `fn` when `cond()` becomes true (not re-triggered while true).
    _watchers.append([cond, fn, 'w%d' % len(_watchers), True])


def on_broadcast(message, fn):
    _receivers.setdefault(tostr(message).lower(), []).append((fn, 'b%d_%s' % (len(_receivers), message)))


def _running(key):
    for t in _tasks:
        if t.key == key and not t.done:
            return t
    return None


def _spawn(fn, key, restart):
    t = _running(key)
    if t:
        if not restart:
            return t
        t.done = True
        _tasks.remove(t)
    t = Task(fn, key)
    _tasks.append(t)
    return t


def broadcast(message):
    return [_spawn(fn, key, True) for fn, key in _receivers.get(tostr(message).lower(), [])]


class _AllDone:
    def __init__(self, tasks):
        self.tasks = tasks

    def __iter__(self):
        while any(not t.done for t in self.tasks):
            yield self

    __await__ = __iter__


def broadcast_wait(message):
    return _AllDone(broadcast(message))


def stop_other_stacks():
    for t in _tasks:
        if t is not _current:
            t.done = True
    _watchers.clear()


def stop_all():
    raise StopProgram()


def tick():
    return Sleep(0)


def wait_s(s):
    return Sleep(int(max(0, num(s)) * 1000 + 0.5))


def until(cond):
    return Until(cond, 0)


def _ready(w):
    if w is None:
        return True
    tw = type(w)
    if tw is Cmd:
        return _sim.st(w.id) != 1
    if tw is Sleep:
        return _sim.now() >= w.until
    if tw is Until:
        return w.done()
    if tw is _AllDone:
        return all(t.done for t in w.tasks)
    return True


def run():
    global _current
    _sim.call('timerReset')
    for fn in _starts:
        _spawn(fn, 'start%d' % id(fn), False)
    for w in _watchers:
        w[3] = bool(w[0]())  # a condition already true at start does not fire
    try:
        while _tasks or _watchers:
            for t in list(_tasks):
                if t.done:
                    continue
                if _ready(t.w):
                    _current = t
                    try:
                        t.w = t.coro.send(None)
                    except StopIteration:
                        t.done = True
                    _current = None
            for t in [t for t in _tasks if t.done]:
                _tasks.remove(t)
            for w in _watchers:
                cur = bool(w[0]())
                if cur and not w[3]:
                    _spawn(w[1], w[2], False)
                w[3] = cur
            deadline = _FAR
            ids = []
            poll = bool(_watchers)
            for t in _tasks:
                tw = type(t.w)
                if tw is Sleep:
                    deadline = min(deadline, t.w.until)
                elif tw is Cmd:
                    ids.append(t.w.id)
                else:
                    poll = True
            if not _tasks and not _watchers:
                break
            now = _sim.now()
            if poll or deadline <= now:
                _sim.wait(now + 1, '')
            else:
                _sim.wait(deadline, ','.join([str(i) for i in ids]))
    except StopProgram:
        pass


# ---------------------------------------------------------------------------- hardware state
_speed = {}  # port -> %
_stop = {}  # port -> motor stop constant
_acc = {}  # port -> (acc, dec) deg/s^2
_move_pair = [0, 1]
_move_speed = 50
_move_stop = 1
_move_acc = (1800, 1800)
_cm_per_rot = 17.6
_paired = False
_matrix_brightness = 100
_timer_offset = [0]
_MAX = {65: 660, 75: 1110, 76: 1050, 48: 1110, 49: 1050}


def ports(spec):
    s = tostr(spec).upper()
    return [PORTS.index(c) for c in s if c in PORTS]


def port(spec):
    p = ports(spec)
    return p[0] if p else 0


def _max(p):
    return _MAX.get(_sim.call('deviceId', p), 1000)


def _need_motor(p):
    if _sim.dk(p) != 'motor':
        raise OSError(19)


def _dps(p, pct):
    return int(max(-100, min(100, num(pct))) * _max(p) / 100)


def set_motor_speed(spec, pct):
    for p in ports(spec):
        _speed[p] = max(-100, min(100, num(pct)))


def set_stop_method(spec, method):
    m = {'coast': 0, 'brake': 1, 'hold': 2}.get(tostr(method).lower(), num(method))
    for p in ports(spec):
        _stop[p] = int(m)


def set_motor_acceleration(spec, value):
    a = _acc_value(value, 4000)
    for p in ports(spec):
        _acc[p] = a


def _acc_value(value, medium):
    s = tostr(value).lower()
    if s == 'fast':
        return (10000, 10000)
    if s == 'slow':
        return (1000, 1000)
    if s == 'medium' or s == '':
        return (medium, medium)
    parts = s.split()
    if len(parts) == 2:
        return (int(num(parts[0])), int(num(parts[1])))
    v = int(num(s))
    return (v, v)


def _dir(direction):
    d = tostr(direction).lower()
    return -1 if d in ('counterclockwise', 'ccw', 'back', 'backward', 'backwards', '-1') else 1


class _All:
    def __init__(self, cmds):
        self.cmds = cmds

    def __iter__(self):
        for c in self.cmds:
            yield from c
        return 0

    __await__ = __iter__


def motor_turn_for(spec, direction, value, unit):
    cmds = []
    for p in ports(spec):
        _need_motor(p)
        v = _dps(p, _speed.get(p, 75)) * _dir(direction)
        acc, dec = _acc.get(p, (4000, 4000))
        u = tostr(unit).lower()
        amount = num(value)
        if u == 'seconds':
            cmds.append(Cmd(_sim.call('runForTime', p, int(amount * 1000), v, _stop.get(p, 1), acc, dec)))
        else:
            deg = amount * 360 if u == 'rotations' else amount
            cmds.append(Cmd(_sim.call('runForDegrees', p, int(round(deg)), v, _stop.get(p, 1), acc, dec)))
    return _All(cmds)


def motor_go_to_position(spec, direction, position):
    cmds = []
    d = {'shortest': 2, 'clockwise': 0, 'counterclockwise': 1}.get(tostr(direction).lower(), 2)
    for p in ports(spec):
        _need_motor(p)
        acc, dec = _acc.get(p, (4000, 4000))
        cmds.append(Cmd(_sim.call('runToAbsolutePosition', p, int(num(position)) % 360, abs(_dps(p, _speed.get(p, 75))), d, _stop.get(p, 1), acc, dec)))
    return _All(cmds)


def motor_go_to_relative(spec, position, pct):
    cmds = []
    for p in ports(spec):
        _need_motor(p)
        acc, dec = _acc.get(p, (4000, 4000))
        cmds.append(Cmd(_sim.call('runToRelativePosition', p, int(num(position)), abs(_dps(p, pct)), _stop.get(p, 1), acc, dec)))
    return _All(cmds)


def motor_start(spec, direction):
    for p in ports(spec):
        _need_motor(p)
        _sim.call('motorRun', p, _dps(p, _speed.get(p, 75)) * _dir(direction), _acc.get(p, (4000, 4000))[0])


def motor_start_power(spec, pct):
    for p in ports(spec):
        _need_motor(p)
        _sim.call('motorSetDutyCycle', p, int(max(-100, min(100, num(pct))) * 100))


def motor_stop(spec):
    for p in ports(spec):
        _need_motor(p)
        _sim.call('motorStop', p, _stop.get(p, 1))


def motor_set_relative(spec, value):
    for p in ports(spec):
        _need_motor(p)
        _sim.call('motorResetRelativePosition', p, int(num(value)))


def motor_position(spec):
    p = port(spec)
    _need_motor(p)
    return _sim.call('motorAbsolutePosition', p) % 360


def motor_relative(spec):
    p = port(spec)
    _need_motor(p)
    return _sim.call('motorRelativePosition', p)


def motor_speed(spec):
    p = port(spec)
    _need_motor(p)
    return int(round(_sim.call('motorVelocity', p) * 100 / _max(p)))


def motor_power(spec):
    p = port(spec)
    _need_motor(p)
    return int(round(_sim.call('motorDutyCycle', p) / 100))


# ---- movement
def set_movement_pair(spec):
    global _paired
    ps = ports(spec)
    if len(ps) >= 2:
        _move_pair[0], _move_pair[1] = ps[0], ps[1]
    _paired = False


def _pair():
    global _paired
    if not _paired:
        _need_motor(_move_pair[0])
        _need_motor(_move_pair[1])
        _sim.call('pair', 2, _move_pair[0], _move_pair[1])
        _paired = True
    return 2


def set_movement_speed(pct):
    global _move_speed
    _move_speed = max(-100, min(100, num(pct)))


def set_movement_stop(method):
    global _move_stop
    _move_stop = {'coast': 0, 'brake': 1, 'hold': 2}.get(tostr(method).lower(), int(num(method)))


def set_movement_acceleration(value):
    global _move_acc
    _move_acc = _acc_value(value, 1800)


def set_distance(value, unit):
    global _cm_per_rot
    v = num(value)
    _cm_per_rot = v * 2.54 if tostr(unit).lower() in ('in', 'inches') else v


def _steer_for(direction):
    d = tostr(direction).lower()
    if d == 'clockwise':
        return 100, 1
    if d == 'counterclockwise':
        return -100, 1
    if d in ('back', 'backward', 'backwards'):
        return 0, -1
    return 0, 1


def _move_amount(value, unit):
    u = tostr(unit).lower()
    v = num(value)
    if u == 'cm':
        return ('deg', v / _cm_per_rot * 360)
    if u in ('in', 'inches'):
        return ('deg', v * 2.54 / _cm_per_rot * 360)
    if u == 'rotations':
        return ('deg', v * 360)
    if u == 'seconds':
        return ('ms', v * 1000)
    return ('deg', v)


def _pair_speed():
    return _dps(_move_pair[1], _move_speed)


def move(direction, value, unit):
    steering, sign = _steer_for(direction)
    return steer(steering, value, unit, sign)


def steer(steering, value, unit, sign=1):
    pr = _pair()
    kind, amount = _move_amount(value, unit)
    v = _pair_speed() * sign
    s = int(max(-100, min(100, num(steering))))
    if kind == 'ms':
        return Cmd(_sim.call('pairMoveForTime', pr, int(amount), s, v, _move_stop, _move_acc[0], _move_acc[1]))
    deg = int(round(amount))
    if deg < 0:
        deg, v = -deg, -v
    return Cmd(_sim.call('pairMoveForDegrees', pr, deg, s, v, _move_stop, _move_acc[0], _move_acc[1]))


def start_move(direction):
    steering, sign = _steer_for(direction)
    start_steer(steering, sign)


def start_steer(steering, sign=1):
    _sim.call('pairMove', _pair(), int(max(-100, min(100, num(steering)))), _pair_speed() * sign, _move_acc[0])


def start_dual_speed(left, right):
    pr = _pair()
    _sim.call('pairMoveTank', pr, _dps(_move_pair[0], left), _dps(_move_pair[1], right), _move_acc[0])


def stop_move():
    _sim.call('pairStop', _pair(), _move_stop)


# ---- sensors
def _need(p, kind):
    if _sim.dk(p) != kind:
        raise OSError(19)
    return p


def color(spec):
    return _sim.call('colorSensorColor', _need(port(spec), 'color'))


def is_color(spec, value):
    return color(spec) == int(num(value))


def reflection(spec):
    return _sim.call('colorSensorReflection', _need(port(spec), 'color'))


def raw_color(spec, channel):
    r = tuple(_sim.call('colorSensorRgbi', _need(port(spec), 'color')))
    i = {'red': 0, 'green': 1, 'blue': 2}.get(tostr(channel).lower(), 0)
    return int(r[i] * 255 // 1024)


def compare(a, comparator, b):
    c = tostr(comparator).lower()
    if c in ('<', 'closer than', 'less than'):
        return lt(a, b)
    if c in ('>', 'further than', 'farther than', 'greater than'):
        return gt(a, b)
    return eq(a, b)


def distance(spec, unit='cm'):
    mm = _sim.call('distance', _need(port(spec), 'distance'))
    if mm < 0:
        return -1
    u = tostr(unit).lower()
    if u in ('in', 'inches'):
        return round(mm / 25.4, 1)
    if u == '%':
        return int(min(100, mm / 20))
    return round(mm / 10, 1)


def force(spec, unit='newton'):
    dn = _sim.call('forceValue', _need(port(spec), 'force'))
    return dn if tostr(unit).lower() == '%' else dn / 10


def is_pressed(spec, option):
    n = force(spec)
    o = tostr(option).lower()
    if o == 'released':
        return n == 0
    if o in ('hardpressed', 'hard pressed', 'hard-pressed'):
        return n >= 5
    return n > 0


def _tilt():
    return tuple(_sim.call('tiltAngles'))


def orientation_axis(axis):
    # Word Blocks report degrees; yaw is clockwise-positive (opposite sign to Python's tilt_angles()).
    y, p, r = _tilt()
    a = tostr(axis).lower()
    if a == 'pitch':
        return p // 10
    if a == 'roll':
        return r // 10
    return -y // 10


def reset_yaw():
    _sim.call('resetYaw', 0)


def is_tilted(direction):
    y, p, r = _tilt()
    d = tostr(direction).lower()
    lim = 150
    return {'forward': p < -lim, 'backward': p > lim, 'left': r > lim, 'right': r < -lim, 'any': abs(p) > lim or abs(r) > lim}.get(d, False)


_FACES = {'top': 0, 'front': 1, 'rightside': 2, 'right': 2, 'bottom': 3, 'back': 4, 'leftside': 5, 'left': 5}


def hub_orientation():
    return _sim.call('upFace')


def is_orientation(face):
    f = tostr(face).lower().replace(' ', '')
    return hub_orientation() == _FACES.get(f, int(num(f)) if _isnum(f) else -1)


def button_is(button, event):
    b = 1 if tostr(button).lower() == 'left' else 2
    pressed = _sim.call('buttonPressed', b) > 0
    return pressed if tostr(event).lower() == 'pressed' else not pressed


def timer():
    return (_sim.call('timerMs')) / 1000


def reset_timer():
    _sim.call('timerReset')


def acceleration(axis):
    a = tuple(_sim.call('acceleration'))
    return a['xyz'.index(tostr(axis).lower()[0])] if tostr(axis).lower()[:1] in 'xyz' else 0


def angular_velocity(axis):
    a = tuple(_sim.call('angularVelocity'))
    return a['xyz'.index(tostr(axis).lower()[0])] // 10 if tostr(axis).lower()[:1] in 'xyz' else 0


# ---- lights / sound
def _pixels(pattern, brightness=None):
    s = tostr(pattern)
    b = _matrix_brightness if brightness is None else brightness
    px = []
    for ch in s[:25]:
        d = int(ch) if ch.isdigit() else 0
        px.append(int(d * b / 9) if d else 0)
    while len(px) < 25:
        px.append(0)
    return ','.join([str(v) for v in px])


def matrix_on(pattern):
    _sim.call('lmShow', _pixels(pattern))


def matrix_on_for(pattern, seconds):
    _sim.call('lmShow', _pixels(pattern))
    return _MatrixOff(Sleep(int(num(seconds) * 1000)))


class _MatrixOff:
    def __init__(self, s):
        self.s = s

    def __iter__(self):
        yield from self.s
        _sim.call('lmClear')

    __await__ = __iter__


def matrix_write(text):
    return Cmd(_sim.call('lmWrite', tostr(text), _matrix_brightness, 500))


def matrix_off():
    _sim.call('lmClear')


def matrix_brightness(v):
    global _matrix_brightness
    _matrix_brightness = int(max(0, min(100, num(v))))


def matrix_set_pixel(x, y, brightness):
    _sim.call('lmSetPixel', int(num(x)) - 1, int(num(y)) - 1, int(max(0, min(100, num(brightness)))))


def matrix_rotate(direction):
    o = _sim.call('lmGetOrientation')
    _sim.call('lmSetOrientation', o + (1 if tostr(direction).lower() == 'clockwise' else -1))


def matrix_orientation(value):
    m = {'upright': 0, 'up': 0, 'right': 1, 'upsidedown': 2, 'upside down': 2, 'down': 2, 'left': 3}
    _sim.call('lmSetOrientation', m.get(tostr(value).lower(), int(num(value)) if _isnum(value) else 0))


def center_light(c):
    _sim.call('lightColor', 0, int(num(c)))


def distance_lights(spec, pattern):
    p = _need(port(spec), 'distance')
    vals = [int(v) for v in tostr(pattern).split()] if ' ' in tostr(pattern) else [int(num(tostr(pattern)))] * 4
    _sim.call('distanceShow', p, ','.join([str(v) for v in (vals + [0, 0, 0, 0])[:4]]))


def _midi_hz(note):
    return int(440 * 2 ** ((num(note) - 69) / 12))


def beep_for(note, seconds):
    return Cmd(_sim.call('beep', _midi_hz(note), int(num(seconds) * 1000), 100, 1))


def beep(note):
    _sim.call('beep', _midi_hz(note), 1000000, 100, 1)


def stop_sound():
    _sim.call('soundStop')


def app(kind, *args):
    _sim.app(kind, '\x1f'.join([tostr(a) for a in args]))
