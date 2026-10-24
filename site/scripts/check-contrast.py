import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / 'ui/style.css').read_text().splitlines()

def tokens(line):
    values = dict(re.findall(r'--([\w-]+):(#[0-9a-f]{3,6})(?=[;}])', line))
    return {key: value if len(value) == 7 else '#' + ''.join(c * 2 for c in value[1:]) for key, value in values.items()}

def luminance(color):
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in rgb]
    return sum(value * weight for value, weight in zip(linear, [.2126, .7152, .0722]))

light = tokens(lines[1])
dark = {**light, **tokens(lines[2])}
pairs = [('text', 'panel', 4.5), ('muted', 'panel', 4.5), ('muted', 'bg', 4.5), ('accent', 'panel', 4.5), ('on-accent', 'accent', 4.5), ('negative', 'negative-soft', 4.5), ('positive', 'positive-soft', 4.5), ('gold', 'gold-soft', 4.5), ('control', 'panel', 3)]
report = []
for name, theme in [('light', light), ('dark', dark)]:
    for foreground, background, minimum in pairs:
        low, high = sorted([luminance(theme[foreground]), luminance(theme[background])])
        ratio = (high + .05) / (low + .05)
        report.append(dict(theme=name, text=foreground, background=background, ratio=round(ratio, 2), minimum=minimum))
        assert ratio >= minimum, f'{name}: {foreground}/{background} fails ({ratio:.2f})'
(root / '.taste-skill/contrast.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'{len(report)} theme token contrast pairs passed.')
