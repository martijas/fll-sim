from app._ui import post, Done


def play(sound_name, volume=100, pitch=0, pan=0):
    post('sound.play', sound_name, volume, pitch, pan)
    return Done()


def set_attributes(volume, pitch, pan):
    post('sound.attrs', volume, pitch, pan)


def stop():
    post('sound.stop')
