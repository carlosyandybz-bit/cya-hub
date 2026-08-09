from pathlib import Path
import re

path = Path("app/cya-app.tsx")
text = path.read_text(encoding="utf-8")

home_import = 'import { HomeView } from "./home-view";\n'
student_import = 'import { StudentMasterDetail } from "./student-detail";\n'
if student_import not in text:
    if home_import not in text:
        raise SystemExit("HomeView import not found")
    text = text.replace(home_import, home_import + student_import, 1)

pattern = re.compile(r'\nfunction StudentDetail\(.*?\n}\n\n(?=function portalClassStatus)', re.S)
text, count = pattern.subn('\n', text, count=1)
if count != 1:
    raise SystemExit(f"Expected to remove one legacy StudentDetail, removed {count}")

old = '{selected ? <StudentDetail student={selected} terms={catalog} close={() => setSelected(null)} /> : null}{toast ? <div className="toast">{toast}</div> : null}'
new = '''{selected && db ? <StudentMasterDetail
      client={db}
      student={selected}
      terms={catalog}
      classes={classes}
      credits={credits}
      assignments={teachingAssignments}
      crmContact={crmContacts.find((contact) => contact.id === selected.id) ?? null}
      rates={marketingRates}
      close={() => setSelected(null)}
      schedule={() => { setSelected(null); setScheduleStudentId(selected.id); setScheduleOpen(true); }}
      addCredit={() => { setSelected(null); setCreditStudentId(selected.id); setCreditOpen(true); }}
      openClass={(id) => { setSelected(null); goLive(id); }}
    /> : null}{toast ? <div className="toast">{toast}</div> : null}'''
if old not in text:
    raise SystemExit("Legacy StudentDetail render call not found")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
