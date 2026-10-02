"""Vídeo de apresentação independente, usando os sprites atuais do jogo."""
from pathlib import Path
import json
import math
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '_tmp_video_tools'))
import imageio_ffmpeg

W, H, FPS, DURATION = 1280, 720, 30, 8
GREEN = (116, 232, 133)
BG = Image.open(ROOT / 'art-source/stages/datacenter-arena.png').convert('RGB').resize((W, H), Image.Resampling.LANCZOS)
BG = Image.blend(BG, Image.new('RGB', (W, H), (5, 12, 24)), .26).convert('RGBA')
FONT = 'C:/Windows/Fonts/arialbd.ttf'
FONTS = {size: ImageFont.truetype(FONT, size) for size in (16, 19, 22, 28, 36, 52, 66)}
SPRITES = {}


def frames(name, group, row, scale=1.55, flip=False):
    sheet = Image.open(ROOT / f'public/assets/characters/{name}/{name}-v5-{group}.webp').convert('RGBA')
    result = []
    for col in range(6):
        image = sheet.crop((col * 320, row * 256, (col + 1) * 320, (row + 1) * 256))
        if flip:
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        result.append(image.resize((round(320 * scale), round(256 * scale)), Image.Resampling.NEAREST))
    return result


SPRITES['idle'] = frames('monteiro', 'locomotion', 0)
SPRITES['special'] = frames('monteiro', 'special', 0)
SPRITES['victory'] = frames('monteiro', 'special', 3)
SPRITES['rui-idle'] = frames('rui', 'locomotion', 0, 1.55, True)
SPRITES['rui-hurt'] = frames('rui', 'damage', 0, 1.55, True)


def clamp(x):
    return max(0., min(1., x))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def text(image, value, y, size, color=(255, 255, 255), opacity=1., center=True, x=None):
    layer = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(layer)
    bbox = draw.textbbox((0, 0), value, font=FONTS[size])
    pos = ((W - bbox[2]) // 2 if center else x, y)
    draw.text(pos, value, font=FONTS[size], fill=(*color, round(255 * clamp(opacity))),
              stroke_width=2, stroke_fill=(4, 10, 22, round(210 * clamp(opacity))))
    image.alpha_composite(layer)


def sprite(image, pose, index, x, alpha=1.):
    asset = SPRITES[pose][index % 6]
    if alpha < 1:
        asset = asset.copy()
        asset.putalpha(asset.getchannel('A').point(lambda p: round(p * alpha)))
    image.alpha_composite(asset, (round(x - asset.width / 2), round(622 - 248 * 1.55)))


def special_phase(t, start, stretch):
    q = (t - start) / stretch
    # Preparation, extension/impact, then recovery. Hold the contact pose.
    bounds = (.13, .27, .48, .85, 1.02, 1.18)
    for i, end in enumerate(bounds):
        if q < end:
            return i, q
    return None, q


def compose(t):
    scene = BG.copy()
    effects = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(effects)
    rival_alpha = 1 - smooth((t - 6.15) / .45)
    for x, a in ((355, 1), (855, rival_alpha)):
        d.ellipse((x - 110, 606, x + 110, 636), fill=(0, 3, 8, round(155 * a)))
    scene.alpha_composite(effects)

    first = special_phase(t, 1.65, 1.)
    second = special_phase(t, 4.0, 1.65)
    active = first if 1.65 <= t < 2.83 else second if 4.0 <= t < 5.95 else (None, 0)
    index, q = active
    pose = 'special' if index is not None else 'idle'
    idx = index if index is not None else int(t * 8) % 6
    if t >= 6.2:
        pose, idx = 'victory', min(5, int((t - 6.2) * 5))
    sprite(scene, pose, idx, 355)
    hit = index == 3
    hit_age = max(0, q - .48)
    rival_x = 855 + (22 * smooth(hit_age / .28) if hit else 0)
    contact = hit and hit_age >= .12
    sprite(scene, 'rui-hurt' if contact else 'rui-idle', min(5, int(hit_age * 14)) if contact else int(t * 8) % 6, rival_x, rival_alpha)

    fx = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(fx)
    if index == 2:
        pulse = 1 + .12 * math.sin(t * 28)
        draw.ellipse((395 - 25 * pulse, 449 - 25 * pulse, 395 + 25 * pulse, 449 + 25 * pulse), outline=(116, 255, 150, 185), width=3)
    if hit:
        extension = 1 - (1 - clamp(hit_age / .16)) ** 3
        extent = 312 * extension
        # Continue from the connector already drawn in the original sprite.
        points = [(537 + extent * i / 40, 490 - 70 * extension * i / 40 - math.sin(i / 40 * math.tau) * 23) for i in range(41)]
        glow = Image.new('RGBA', (W, H))
        gd = ImageDraw.Draw(glow)
        gd.line(points, fill=(37, 255, 130, 180), width=24)
        scene.alpha_composite(glow.filter(ImageFilter.GaussianBlur(13)))
        draw.line(points, fill=(30, 172, 91, 255), width=11)
        draw.line(points, fill=(39, 248, 115, 255), width=7)
        draw.line(points, fill=(234, 255, 237, 255), width=2)
        ex, ey = points[-1]
        draw.rounded_rectangle((ex - 10, ey - 8, ex + 10, ey + 8), radius=2, fill=(234, 255, 237, 255), outline=(24, 179, 92, 255), width=3)
        if hit_age > .1:
            for j in range(26):
                angle = j * 2.399
                dist = 15 + ((hit_age * 160 + j * 7) % 95)
                px, py = 849 + math.cos(angle) * dist, 420 + math.sin(angle) * dist
                draw.rectangle((px, py, px + 3 + j % 4, py + 3 + j % 4), fill=(*(GREEN if j % 2 else (236, 255, 240)), 220))
            # Brief contact flash, then a lingering ring in the slow-motion shot.
            radius = 22 + hit_age * 160
            a = round(200 * (1 - clamp(hit_age / .65)))
            draw.ellipse((849 - radius, 420 - radius, 849 + radius, 420 + radius), outline=(163, 255, 189, a), width=3)
    scene.alpha_composite(fx)

    shade = Image.new('RGBA', (W, H))
    sd = ImageDraw.Draw(shade)
    sd.rectangle((0, 0, W, 158), fill=(3, 10, 22, 160))
    sd.rectangle((0, 660, W, H), fill=(3, 10, 22, 220))
    sd.line((50, 158, W - 50, 158), fill=(*GREEN, 170), width=2)
    sd.line((50, 660, W - 50, 660), fill=(*GREEN, 170), width=2)
    scene.alpha_composite(shade)
    intro = 1 - smooth((t - 1.35) / .35)
    closing = smooth((t - 6.0) / .45)
    if intro > 0:
        text(scene, 'MONTEIRO', 35, 66, opacity=intro * smooth(t / .3))
        text(scene, 'DEPLOY  /  INFRAESTRUTURA', 113, 19, GREEN, intro)
    title_alpha = min(1 - intro, 1)
    if title_alpha > 0:
        text(scene, 'CABO DE REDE', 48, 52, GREEN, title_alpha)
        text(scene, 'MONTEIRO  /  GOLPE ESPECIAL', 115, 19, opacity=title_alpha)
    if 3.6 <= t < 6.05:
        text(scene, 'REPLAY  /  CÂMERA LENTA', 680, 19, GREEN, smooth((t - 3.6) / .2))
    elif closing > 0:
        text(scene, 'AQUI A ESTRUTURA AGUENTA.', 677, 22, GREEN, closing)
    else:
        text(scene, 'CTRL ALT FIGHTER', 680, 19, opacity=.85)
    # Subtle film fade, keeping all title and action frames visible.
    fade = 1 - min(smooth(t / .24), 1 - smooth((t - 7.75) / .25))
    if fade > 0:
        scene.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, round(255 * fade))))
    return scene.convert('RGB')


def soundtrack():
    sr = 48000
    t = np.arange(sr * DURATION) / sr
    rng = np.random.default_rng(12)
    noise = rng.normal(0, 1, len(t))
    audio = .017 * np.sin(math.tau * 55 * t) + .012 * np.sin(math.tau * 82.4 * t)
    for start, stretch in ((1.65, 1.), (4., 1.65)):
        u = t - start
        charge = ((u >= 0) & (u < .48 * stretch)) * np.sin(np.pi * np.clip(u / (.48 * stretch), 0, 1)) ** 2
        audio += .035 * np.sin(math.tau * (190 * u + 750 * u * u)) * charge
        launch = t - (start + .48 * stretch)
        env = np.where(launch >= 0, np.exp(-np.maximum(launch, 0) / (.21 * stretch)), 0)
        audio += env * (.13 * noise + .17 * np.sin(math.tau * (140 * launch - 55 * launch * launch)))
        click = t - (start + .61 * stretch)
        hit = np.where(click >= 0, np.exp(-np.maximum(click, 0) / .12), 0)
        audio += hit * (.16 * noise + .24 * np.sin(math.tau * 68 * click))
    fade = np.minimum(np.clip(t / .35, 0, 1), np.clip((DURATION - t) / .5, 0, 1))
    audio *= fade
    peak = np.max(np.abs(audio))
    if peak > .9:
        audio *= .9 / peak
    pcm = (audio * 32767).astype('<i2')
    with wave.open(str(OUT / 'power-soundtrack.wav'), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(pcm.tobytes())


def main():
    soundtrack()
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    video = OUT / 'monteiro-cabo-de-rede.mp4'
    command = [ffmpeg, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', str(OUT / 'power-soundtrack.wav'),
               '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
               '-b:a', '160k', '-movflags', '+faststart', '-t', str(DURATION), str(video)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    for frame in range(FPS * DURATION):
        process.stdin.write(compose(frame / FPS).tobytes())
        if frame % FPS == 0:
            print(f'Render: {frame // FPS + 1}/{DURATION}', flush=True)
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError('Falha na exportação do MP4')
    compose(2.35).save(OUT / 'poster.jpg', quality=94)
    times = [.8, 1.92, 2.2, 2.5, 4.3, 4.85, 5.35, 6.8]
    contact = Image.new('RGB', (1280, 360), '#071020')
    for i, moment in enumerate(times):
        thumb = compose(moment).resize((320, 180), Image.Resampling.LANCZOS)
        ImageDraw.Draw(thumb).text((6, 162), f'{moment:.2f}s', fill='white')
        contact.paste(thumb, ((i % 4) * 320, (i // 4) * 180))
    contact.save(OUT / 'contact-sheet.jpg', quality=95)
    info = {'title': 'Monteiro — Cabo de Rede', 'durationSeconds': DURATION, 'width': W, 'height': H,
            'fps': FPS, 'audio': 'Efeitos de carga, lançamento e impacto sintetizados; sem fala.',
            'status': 'Vídeo independente, não implementado no jogo.',
            'sourceArt': ['public/assets/characters/monteiro/monteiro-v5-special.webp',
                          'public/assets/characters/monteiro/monteiro-v5-locomotion.webp',
                          'public/assets/characters/rui/rui-v5-damage.webp', 'art-source/stages/datacenter-arena.png'],
            'storyboard': ['0–1,65s: apresentação de Monteiro', '1,65–2,83s: Cabo de Rede e impacto',
                           '3,6–5,95s: repetição em câmera lenta', '6,2–8s: pose final e frase do personagem']}
    (OUT / 'manifest.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(video, flush=True)


if __name__ == '__main__':
    main()
