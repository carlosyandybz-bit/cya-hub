from pathlib import Path

path = Path("app/student-detail.tsx")
text = path.read_text(encoding="utf-8")
old = '  const [error, setError] = useState("");\n'
new = '  const [error, setError] = useState("");\n  const [now] = useState(() => Date.now());\n'
if old not in text:
    raise SystemExit("student detail error state not found")
text = text.replace(old, new, 1)
text = text.replace('new Date(item.scheduled_start_at).getTime() >= Date.now()', 'new Date(item.scheduled_start_at).getTime() >= now', 1)
path.write_text(text, encoding="utf-8")
