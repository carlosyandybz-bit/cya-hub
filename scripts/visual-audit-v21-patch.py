from pathlib import Path

student_css = Path("app/student-detail.module.css")
text = student_css.read_text()
for old, new in [
    ("font-size:7px", "font-size:10.5px"),
    ("font-size:8px", "font-size:11px"),
    ("font-size:9px", "font-size:11.5px"),
    ("font-size:10px", "font-size:12.5px"),
    ("font-size:11px", "font-size:13px"),
    ("font-size:12px", "font-size:13.5px"),
]:
    text = text.replace(old, new)
student_css.write_text(text)

app = Path("app/cya-app.tsx")
text = app.read_text()
text = text.replace('fontSize:9, fontWeight:800, textTransform:"uppercase"', 'fontSize:11, fontWeight:800, textTransform:"uppercase"')
text = text.replace('fontSize:10 }}>{relationLabels', 'fontSize:12.5 }}>{relationLabels')
text = text.replace('fontSize:11, textAlign:"right"', 'fontSize:13, textAlign:"right"')
app.write_text(text)
