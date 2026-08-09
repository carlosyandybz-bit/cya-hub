from pathlib import Path

path = Path("app/cya-app.tsx")
text = path.read_text(encoding="utf-8")

text = text.replace("  Pencil, Play, Plus, Search, Sparkles, Tag, TrendingUp, UsersRound, Video,\n", "  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UsersRound, Video,\n", 1)

old = '''function drivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

'''
if old in text:
    text = text.replace(old, "", 1)

path.write_text(text, encoding="utf-8")
