"""Makes "How Nova works" clips (static/videos/instr_mode_{low,mid}_nova.mp4) from instr_mode_{low,mid}.mp4.

The mode clips were cut from the training video, where the robot has the plain white top of the example robot.
On the "How Nova works" page the robot must look like Nova (light-blue top, as in Nova's delivery clips), so the
white top plate is painted Nova blue, keeping the shading. In these clips the plate is the only bright, grey-white
thing in the lower part of the picture (the floor is at most ~145 of 255), so only those pixels change.
The narration audio is copied unchanged; task.js uses the cues of the original clip.

Needs numpy and ffmpeg (on PATH, or FFMPEG=/path/to/ffmpeg):
    python3 scripts/make_nova_mode_clips.py
"""
import os
import subprocess

import numpy as np

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
VIDEOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'videos')
W, H, FPS = 1280, 720, 30
NOVA = np.array([94, 191, 254], dtype=np.float32)   # Nova's top plate in its delivery clips (at plate brightness 222)
PLATE = 222.0                                        # brightness of the white plate in the mode clips
TOP = 350                                            # only the lower part of the picture (the robot is there)


def paint(frame):
    f = frame.astype(np.float32)
    low = f[TOP:]
    mx, mn = low.max(axis=2), low.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    # weight 0 below brightness 170 (floor, robot body), 1 from 210 up; grey-white pixels only
    w = np.clip((mx - 170) / 40, 0, 1) * (sat < 0.18)
    blue = np.clip(NOVA[None, None, :] * (mx / PLATE)[..., None], 0, 255)
    f[TOP:] = low * (1 - w[..., None]) + blue * w[..., None]
    return f.astype(np.uint8)


def main():
    for mode in ('low', 'mid'):
        src = os.path.join(VIDEOS, f'instr_mode_{mode}.mp4')
        out = os.path.join(VIDEOS, f'instr_mode_{mode}_nova.mp4')
        dec = subprocess.Popen([FFMPEG, '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                               stdout=subprocess.PIPE)
        enc = subprocess.Popen([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                                '-r', str(FPS), '-i', '-', '-i', src, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264',
                                '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
                                '-movflags', '+faststart', '-shortest', out], stdin=subprocess.PIPE)
        n = 0
        while True:
            buf = dec.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break
            enc.stdin.write(paint(np.frombuffer(buf, np.uint8).reshape(H, W, 3)).tobytes())
            n += 1
        enc.stdin.close()
        enc.wait()
        dec.wait()
        print('wrote', os.path.basename(out), n, 'frames')


if __name__ == '__main__':
    main()
