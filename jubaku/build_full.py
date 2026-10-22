"""Build the full-song JUBAKU plan (plan_full.json) from the verified 144 BPM grid.

Sections come from the detected RMS boundaries; every cut lands on a downbeat or
a beat. Shot sources are limited to clips that actually exist on disk, so the
plan is renderable without generating anything.
"""
import json, os, random, subprocess

BPM = 144
BEAT = 60 / BPM            # 0.416667
BAR = 4 * BEAT             # 1.666667
ANCHOR = 62.183            # downbeat k=0
ROOT = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.environ.get('JUB_CLIPS') or os.path.join(ROOT, '..', 'video')

# hash-named clips resolved from contact sheets (see FLOW.md / story bible)
HASH = {
    'grok_eyes':   '093e4fbbdf38b180a95a38347c33fb25fcd245ceb3e0ae2ad9a4b7af4a8c694b',
    'castle':      '0c1d460d9cc8c78bf3502c778f1515b181150fd15abed0069ee7cd256de0b786',
    'knot_green':  '15d2aebc53026d4d41b946a08296716a733130655da7bd5a8bd8aaca1e2f1785',
    'boardroom':   '3192ccd426c39d8635c3fbc01832d19fb81ea5830ccd0cc9f180c36e9026f538',
    'ritual':      '3b462469be31ecd81dfc5ce0063394128dee4eacaf3897313cda8ac79118a5ff',
    'builder_walk':'b663d05faa52b2a0ffc5c0020f053d0af69db5605722d929065060f92ae3db79',
    'claude':      '79f6c02d6d309d5fda788d7ca1ab471dda9340a2de57278d344e59b6801feec6',
    'ritual2':     'c1f78e21e243b6a9f9f13b08fa4f9ed9360ec77a44e45fd2bcab721fce41a870',
    'nous_neck':   'c3c29b632182ddb61742da65dc89c6cbdd4bce2552df756e3b6e8c9612ffceb5',
    'schoolroom':  '269a85fa668321451e690fb85b79eb7b75a51fc18126fe7c72a075122c831922',
    'grok_void':   '281e6e2b7a9ad74f14c8f15f7355c9c359d85b93f4c5f4689993dcc52ad836c7',
}

# clips that exist, with their duration
AVAIL = {}
for name, h in HASH.items():
    p = os.path.join(CLIPS, h + '.mp4')
    if os.path.exists(p):
        AVAIL[name] = p
for n in ['la', 'ink', 'cel', '3d', 'sing_subway', 'sing_hall', 'nous_sing',
          'nous_lineup', 'nous_backtoback', 'nous_headturn', 'nous_hermes_caduceus',
          'lunge_openai', 'lunge_deepseek', 'builder_headbang',
          'style_switch_test', 'transition_sampler']:
    p = os.path.join(CLIPS, n + '.mp4')
    if os.path.exists(p):
        AVAIL[n] = p

DUR = {}
for _n, _p in AVAIL.items():
    DUR[_n] = float(subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=duration', '-of', 'csv=p=0', _p],
        capture_output=True, text=True, check=True).stdout.strip())

# section table: (name, start, end, style, palette)
SECTIONS = [
    ('intro',       0.418,   5.387, 'INK',  ['ink', 'nous_neck', 'castle']),
    ('build',       5.387,  22.036, 'LA',   ['la', 'builder_walk', 'castle', '3d', 'grok_eyes', 'claude']),
    ('verse1',     22.036,  52.129, 'RT',   ['builder_headbang', 'builder_walk', 'sing_subway', 'boardroom',
                                             'ink', 'nous_neck', 'nous_sing', 'knot_green']),
    ('prechorus1', 52.129,  62.183, 'INK',  ['ink', 'nous_neck', 'nous_backtoback', 'nous_headturn', 'la']),
    ('chorus1',    62.183,  85.635, 'LA',   ['__approved__']),
    ('verse2',     85.635, 127.478, '3D',   ['lunge_openai', 'lunge_deepseek', 'grok_eyes', 'claude',
                                             'castle', '3d', 'boardroom', 'ritual', 'schoolroom',
                                             'grok_void', 'knot_green', 'builder_headbang']),
    ('prechorus2',127.478, 134.188, 'LA',   ['nous_lineup', 'nous_backtoback', 'nous_headturn', 'la']),
    ('chorus2',   134.188, 181.023, 'CEL',  ['cel', 'nous_hermes_caduceus', 'lunge_deepseek', 'grok_eyes',
                                             'sing_hall', 'nous_sing', 'nous_lineup', 'lunge_openai']),
    ('break1',    181.023, 182.695, 'HOLD', ['ritual2']),
    ('bridge',    182.695, 196.046, 'GL',   ['transition_sampler', 'style_switch_test', 'boardroom',
                                             'grok_eyes', 'claude', 'nous_neck']),
    ('break2',    196.046, 199.367, 'INK',  ['ink']),
    ('final',     199.367, 242.347, 'ALL',  ['la', 'cel', 'ink', '3d', 'sing_hall', 'nous_sing',
                                             'nous_lineup', 'nous_hermes_caduceus', 'grok_eyes',
                                             'claude', 'castle', 'lunge_deepseek', 'lunge_openai',
                                             'builder_headbang', 'sing_subway']),
    ('outro',     242.347, 248.480, 'LA',   ['la', 'sing_hall', 'nous_sing', 'ink']),
]

# beats-per-shot grammar per section
GRAMMAR = {
    'intro':       [8, 4],
    'build':       [4, 2, 4, 2, 2, 4],
    'verse1':      [4, 2, 2, 4, 2, 2, 4, 2],
    'prechorus1':  [2, 2, 2, 2],
    'chorus1':     [],
    'verse2':      [2, 2, 1, 2, 2, 1],
    'prechorus2':  [2, 2, 2, 2],
    'chorus2':     [2, 1, 2, 1, 2, 2, 1],
    'break1':      [8],
    'bridge':      [2, 2, 1, 2, 2, 1],
    'break2':      [4],
    'final':       [2, 1, 2, 1, 2, 2, 1, 2],
    'outro':       [4, 4, 8],
}


def build():
    rng = random.Random(20261022)
    shots, idx = [], 0
    for name, t0, t1, style, palette in SECTIONS:
        if palette == ['__approved__']:
            # splice the approved chorus render (starts at 58.839)
            shots.append({
                'i': idx, 'section': name, 'style': 'LA', 'src': '__approved__',
                't_in': round(t0, 3), 't_out': round(t1, 3),
                'src_start': round(t0 - 58.839, 3), 'beats': 0,
                'transition': 'cut', 'singing': True,
            })
            idx += 1
            continue

        grammar = GRAMMAR[name]
        t = t0
        g = 0
        p = 0
        while t < t1 - 1e-6:
            beats = grammar[g % len(grammar)]
            g += 1
            end = min(t + beats * BEAT, t1)
            if t1 - end < BEAT * 0.75:      # absorb a short tail into this shot
                end = t1
            src = palette[p % len(palette)]
            p += 1
            if src not in AVAIL:
                src = palette[0]
            # pick a window that fits inside the source clip
            want = end - t + 0.3
            max_start = max(0.0, DUR[src] - want)
            src_start = round(rng.uniform(0, max_start), 3) if max_start > 0 else 0.0
            shots.append({
                'i': idx, 'section': name, 'style': style, 'src': src,
                't_in': round(t, 3), 't_out': round(end, 3),
                'src_start': src_start, 'beats': beats,
                'transition': 'cut', 'singing': style in ('LA', 'RT'),
            })
            idx += 1
            t = end
    return shots


if __name__ == '__main__':
    shots = build()
    plan = {
        'bpm': BPM, 'beat': round(BEAT, 6), 'bar': round(BAR, 6), 'anchor': ANCHOR,
        'seg': [0.418, 248.480],
        'sections': [{'name': n, 't_in': round(a, 3), 't_out': round(b, 3), 'style': s}
                     for n, a, b, s, _ in SECTIONS],
        'sources': {k: os.path.basename(v) for k, v in sorted(AVAIL.items())},
        'shots': shots,
    }
    out = os.path.join(ROOT, 'plan_full.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(plan, f, indent=1, ensure_ascii=False)
    print('wrote', out, len(shots), 'shots')
    from collections import Counter
    print(Counter(s['section'] for s in shots))
    print('sources used:', len({s['src'] for s in shots}))
