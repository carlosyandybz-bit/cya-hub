from pathlib import Path
import re

backlog = Path("docs/CYA_HUB_POSTRELEASE_BACKLOG.md")
text = backlog.read_text()
text = re.sub(r'(?m)^(\s*[-*]\s*)\[ \](.*Feedback Online.*)$', r'\1[x]\2', text)
text = text.replace("86 tablas", "92 tablas")
marker = "## Estado PR-C · Feedback Online"
if marker not in text:
    text += "\n\n" + marker + "\n\n"
    text += "**Completado y desplegado en producción el 2026-08-14.** Backend, portal alumno, cola docente, Administración, Drive seguro, P27, P28/P32 y P30 integrados. La copia completa CYA cubre 92 tablas. Ver `docs/PR_C_FEEDBACK_ONLINE.md`.\n"
backlog.write_text(text)

for name in [
    "docs/ADMIN_BORRADO_Y_REINICIO_DATOS.md",
    "docs/P30_DEPLOYMENT_STATUS.md",
    "docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md",
]:
    path = Path(name)
    if not path.exists():
        continue
    current = path.read_text()
    updated = current.replace("86 tablas", "92 tablas")
    if updated != current:
        path.write_text(updated)
