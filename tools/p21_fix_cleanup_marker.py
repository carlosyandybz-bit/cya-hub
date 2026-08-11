from pathlib import Path

path = Path('tools/p21_apply_live_cleanup.py')
text = path.read_text()
old = "app = sub_once(app, r'\\nfunction ManualStartClass\\(.*?\\nfunction localDateTime', '\\nfunction localDateTime', 'remove ManualStartClass')"
new = "app = sub_once(app, r'\\nfunction ManualStartClass\\(.*?\\nfunction FinishClassModal', '\\nfunction FinishClassModal', 'remove ManualStartClass')"
if text.count(old) != 1:
    raise SystemExit(f'cleanup boundary marker expected once, got {text.count(old)}')
path.write_text(text.replace(old, new, 1))
print('P21 cleanup boundary corrected')
