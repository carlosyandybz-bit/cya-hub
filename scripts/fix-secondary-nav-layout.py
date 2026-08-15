from pathlib import Path

app = Path("app/cya-app.tsx")
text = app.read_text()
old = '''        <nav className="mobile-nav">{nav.map(([id, label, Icon]) => id === "live" ? <div className="mobile-nav-primary-group" key={id}>
          <button className={`${activeNav(id) ? "active" : ""} primary`} onClick={() => { setClassQuickMenuOpen(false); navigateView(id); }}><Icon /><span>{label}</span></button>
          <button type="button" className={`mobile-nav-secondary ${classQuickMenuOpen ? "open" : ""}`} aria-label="Más opciones de clase" aria-expanded={classQuickMenuOpen} onClick={() => setClassQuickMenuOpen((value) => !value)}><ChevronDown /></button>
        </div> : <button key={id} className={activeNav(id) ? "active" : ""} onClick={() => { setClassQuickMenuOpen(false); navigateView(id); }}><Icon /><span>{label}</span></button>)}</nav>'''
new = '''        <nav className="mobile-nav">
          {nav.map(([id, label, Icon]) => <button key={id} className={`${activeNav(id) ? "active" : ""} ${id === "live" ? "primary" : ""}`} onClick={() => { setClassQuickMenuOpen(false); navigateView(id); }}><Icon /><span>{label}</span></button>)}
          <button type="button" className={`mobile-nav-secondary ${classQuickMenuOpen ? "open" : ""}`} aria-label="Más opciones de clase" aria-expanded={classQuickMenuOpen} onClick={() => setClassQuickMenuOpen((value) => !value)}><ChevronDown /></button>
        </nav>'''
if old not in text:
    raise SystemExit("teacher secondary navigation wrapper anchor not found")
app.write_text(text.replace(old, new, 1))

css = Path("app/globals.css")
c = css.read_text()
c = c.replace('  .mobile-nav-primary-group { position:relative; min-width:0; display:grid; place-items:center; align-content:center; }\n  .mobile-nav-primary-group > .primary { width:100%; height:100%; }\n', '', 1)
old_pos = '''    top:-14px;
    right:-5px;
    width:44px;'''
new_pos = '''    top:-14px;
    left:calc(50% + 18px);
    width:44px;'''
if old_pos not in c:
    raise SystemExit("secondary positioning anchor not found")
css.write_text(c.replace(old_pos, new_pos, 1))

tests = Path("tests/postrelease-global-redesign.test.mjs")
t = tests.read_text()
t = t.replace('  assert.match(cyaApp, /mobile-nav-primary-group/);\n', '  assert.doesNotMatch(cyaApp, /mobile-nav-primary-group/);\n', 1)
t = t.replace('  assert.match(cyaApp, /mobile-nav-secondary/);\n', '  assert.match(cyaApp, /mobile-nav-secondary/);\n  assert.match(css, /left:calc\\(50% \\+ 18px\\)/);\n', 1)
tests.write_text(t)

Path("scripts/fix-secondary-nav-layout.py").unlink()
Path(".github/workflows/fix-secondary-nav-layout.yml").unlink()
