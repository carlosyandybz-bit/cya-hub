from pathlib import Path

path = Path('tools/p21_apply_progressive_setup.py')
text = path.read_text()
old = "app,count=pattern.subn(replacement,app,count=1)"
new = "app,count=pattern.subn(lambda _match: replacement,app,count=1)"
if text.count(old) != 1:
    raise SystemExit(f'progressive helper replacement marker expected once, got {text.count(old)}')
path.write_text(text.replace(old, new, 1))
print('P21.3 progressive helper replacement fixed')
