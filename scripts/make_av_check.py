"""Makes the audio/video check clips (static/videos/av_check_*.mp4).

Each clip SHOWS one word on screen and a voice SAYS a different word. Participants type both words, which shows
that they can see the video and hear its sound (Dr. Roy's review, 2026-11-04).
The words are listed in AV_CHECKS in static/js/task.js; keep the two lists the same.

Needs macOS `say`, Pillow and ffmpeg (on PATH, or FFMPEG=/path/to/ffmpeg):
    python3 scripts/make_av_check.py
"""
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

CLIPS = [  # (file, word shown, word spoken)
    ('av_check_1.mp4', 'APPLE', 'garden'),
    ('av_check_2.mp4', 'PENCIL', 'river'),
]
VOICE = 'Samantha'
W, H = 1280, 720
OUT = os.path.join(os.path.dirname(__file__), '..', 'static', 'videos')
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def frame(word, path):
    img = Image.new('RGB', (W, H), (20, 33, 61))
    d = ImageDraw.Draw(img)
    small = ImageFont.truetype(FONT_BOLD, 34)
    big = ImageFont.truetype(FONT_BOLD, 150)
    d.text((W / 2, 110), 'Remember the word you SEE', font=small, fill=(201, 210, 230), anchor='mm')
    d.rounded_rectangle((W / 2 - 420, H / 2 - 150, W / 2 + 420, H / 2 + 150), radius=36, fill=(255, 255, 255))
    d.text((W / 2, H / 2), word, font=big, fill=(20, 33, 61), anchor='mm')
    d.text((W / 2, H - 100), 'and the word you HEAR', font=small, fill=(201, 210, 230), anchor='mm')
    img.save(path)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        for name, shown, spoken in CLIPS:
            png, aiff = os.path.join(tmp, 'f.png'), os.path.join(tmp, 'v.aiff')
            frame(shown, png)
            text = f'[[slnc 700]] Please remember the word: {spoken}. [[slnc 500]] Again, the word is: {spoken}. [[slnc 900]]'
            subprocess.run(['say', '-v', VOICE, '-o', aiff, text], check=True)
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', png, '-i', aiff,
                            '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
                            '-shortest', '-movflags', '+faststart', os.path.join(OUT, name)], check=True)
            print('wrote', name, f'(shows {shown}, says {spoken})')


if __name__ == '__main__':
    main()
