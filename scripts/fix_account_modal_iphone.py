from pathlib import Path

path = Path('app/account-menu.module.css')
text = path.read_text()

old = '.backdrop{position:fixed;z-index:1300;inset:0;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom));background:#1d17314d;backdrop-filter:blur(8px)}.dialog{width:min(560px,100%);max-height:calc(100dvh - 36px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid #e5e0ea;border-radius:24px;background:#fff;box-shadow:0 30px 90px #241b4630}'
new = '.backdrop{position:fixed;z-index:1300;inset:0;display:grid;align-items:start;justify-items:center;overflow-y:auto;overscroll-behavior:contain;padding:max(14px,env(safe-area-inset-top)) 16px max(14px,env(safe-area-inset-bottom));background:#1d17314d;backdrop-filter:blur(8px)}.dialog{width:min(560px,100%);max-height:calc(100svh - max(28px,env(safe-area-inset-top) + env(safe-area-inset-bottom) + 18px));margin-block:auto;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid #e5e0ea;border-radius:24px;background:#fff;box-shadow:0 30px 90px #241b4630}'
if text.count(old) != 1:
    raise SystemExit(f'base dialog block mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

old_mobile = '@media(max-width:900px){.menuHeader{position:fixed;top:calc(62px + env(safe-area-inset-top));right:10px}.dialog{width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - max(32px,env(safe-area-inset-top) + env(safe-area-inset-bottom) + 20px));border-radius:22px}'
new_mobile = '@media(max-width:900px){.menuHeader{position:fixed;top:calc(62px + env(safe-area-inset-top));right:10px}.backdrop{padding-top:max(12px,env(safe-area-inset-top));padding-bottom:max(12px,env(safe-area-inset-bottom))}.dialog{width:min(520px,calc(100vw - 24px));max-height:calc(100svh - max(24px,env(safe-area-inset-top) + env(safe-area-inset-bottom) + 16px));border-radius:22px}'
if text.count(old_mobile) != 1:
    raise SystemExit(f'mobile dialog block mismatch: {text.count(old_mobile)}')
text = text.replace(old_mobile, new_mobile, 1)

# Keep the title/close control visible even if future content changes make the body longer.
old_header = '.dialogHeader{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid #ece8f0;background:#fff}'
new_header = '.dialogHeader{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid #ece8f0;background:#fff}'
if text.count(old_header) != 1:
    raise SystemExit(f'dialog header block mismatch: {text.count(old_header)}')
text = text.replace(old_header, new_header, 1)

path.write_text(text)
