"""Render the full JUBAKU cut from plan_full.json.

Two stages so a 280-shot timeline does not become one giant filtergraph:
  1. trim every shot to a normalised temp clip (1280x720, 30 fps, yuv420p)
  2. concat them and mux the song
"""
import json, os, subprocess, sys, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
JUB = os.environ.get('JUB_DIR') or os.path.join(ROOT, '..')
CLIPS = os.environ.get('JUB_CLIPS') or os.path.join(JUB, 'video')
SONG = os.environ.get('JUB_SONG') or os.path.join(JUB, 'audio', 'track.mp3')
PLAN = os.path.join(ROOT, 'plan_full.json')
WORK = os.environ.get('JUB_WORK') or os.path.join(ROOT, '..', '..', 'tmp', 'shots')
OUT = os.environ.get('JUB_OUT') or os.path.join(ROOT, '..', '..', 'exports_full')
FPS = 30
W, H = 1280, 720

FF = shutil.which('ffmpeg') or r'C:\Users\pujan\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe'
_bindir = os.path.dirname(FF)
FP = os.path.join(_bindir, 'ffprobe.exe' if os.path.exists(os.path.join(_bindir, 'ffprobe.exe')) else 'ffprobe')


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-2000:])
    return r


def probe_dur(path):
    return float(run([FP, '-v', 'error', '-select_streams', 'v:0',
                      '-show_entries', 'stream=duration', '-of', 'csv=p=0', path]).stdout.strip())


def render(plan, out_path, only=None):
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    shots = [s for s in plan['shots'] if only is None or s['section'] in only]

    listing = []
    for n, s in enumerate(shots):
        dst = os.path.join(WORK, f'{n:04d}.mp4')
        dur = s['t_out'] - s['t_in']
        if s['src'] == '__approved__':
            src = os.path.join(CLIPS, 'jubaku_test_v2_720p.mp4')
            ss = s['src_start']
        else:
            src = plan['sources'].get(s['src'])
            if not src:
                raise SystemExit(f'missing source {s["src"]}')
            src = os.path.join(CLIPS, src)
            ss = s['src_start']
        # keep the read inside the source clip
        src_dur = probe_dur(src)
        ss = max(0.0, min(ss, max(0.0, src_dur - dur - 0.05)))
        run([FF, '-y', '-loglevel', 'error', '-ss', f'{ss:.3f}', '-t', f'{dur:.3f}',
             '-i', src,
             '-vf', f'fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,'
                    f'crop={W}:{H},setsar=1,format=yuv420p',
             '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', dst])
        listing.append(dst)
        if (n + 1) % 25 == 0:
            print(f'  trimmed {n+1}/{len(shots)}', flush=True)

    lst = os.path.join(WORK, 'list.txt')
    with open(lst, 'w', encoding='utf-8') as f:
        for p in listing:
            f.write("file '%s'\n" % p.replace('\\', '/'))

    t0 = shots[0]['t_in']
    t1 = shots[-1]['t_out']
    print(f'concat {len(listing)} shots -> {out_path} ({t1-t0:.2f}s)', flush=True)
    run([FF, '-y', '-loglevel', 'error',
         '-f', 'concat', '-safe', '0', '-i', lst,
         '-ss', f'{t0:.3f}', '-t', f'{t1-t0:.3f}', '-i', SONG,
         '-map', '0:v', '-map', '1:a',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
         '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
         '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '44100',
         '-movflags', '+faststart', '-shortest', out_path])
    print('done', out_path, round(probe_dur(out_path), 2), 's')


if __name__ == '__main__':
    plan = json.load(open(PLAN, encoding='utf-8'))
    only = sys.argv[2:] or None
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'jubaku-full.mp4')
    render(plan, out, only)
