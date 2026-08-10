from pathlib import Path
import re

GLOBAL = Path('app/globals.css')
STUDENT = Path('app/student-detail.module.css')


def clamp_font_sizes(text: str, minimum: float = 11.5) -> str:
    pattern = re.compile(r'font-size:(\d+(?:\.\d+)?)px')
    def repl(match: re.Match[str]) -> str:
        value = float(match.group(1))
        return f'font-size:{minimum:g}px' if value < minimum else match.group(0)
    return pattern.sub(repl, text)


def replace_if_present(text: str, old: str, new: str) -> str:
    return text.replace(old, new) if old in text else text


global_css = GLOBAL.read_text()
student_css = STUDENT.read_text()

# 1) Remove the mobile bottom-sheet positioning that made forms grow from the bottom.
global_css = replace_if_present(
    global_css,
    '.backdrop { align-items:end; padding:8px; } .modal { max-height:calc(100dvh - 16px); border-radius:24px 24px 18px 18px; }',
    '.backdrop { place-items:center; align-items:center; padding:12px; } .modal { max-height:calc(100dvh - 24px); border-radius:22px; }',
)
student_css = replace_if_present(
    student_css,
    '.backdrop{align-items:end;padding:7px}.modal{max-height:calc(100dvh - 8px);border-radius:24px 24px 12px 12px}',
    '.backdrop{place-items:center;align-items:center;padding:12px}.modal{max-height:calc(100dvh - 24px);border-radius:24px}',
)
student_css = replace_if_present(
    student_css,
    '.backdrop{align-items:stretch;padding:0}.modal{width:100vw;height:100dvh;max-height:none;border:0;border-radius:0}',
    '.backdrop{place-items:center;align-items:center;padding:12px}.modal{width:min(94vw,720px);height:auto;max-height:calc(100dvh - 24px);border:1px solid #e7e2ef;border-radius:24px}',
)

# 2) Remove illegibly small labels. This is deliberately conservative: compact text may remain small,
#    but nothing in the two primary UI stylesheets is allowed below 11.5 px.
global_css = clamp_font_sizes(global_css)
student_css = clamp_font_sizes(student_css)

marker = '/* v23 · integridad visual y móvil */'
if marker in global_css:
    raise SystemExit('v23 visual integrity block already exists')

global_css += r'''

/* v23 · integridad visual y móvil */
html,body{max-width:100%;overflow-x:hidden}
body:has([role="dialog"]){overflow:hidden}
.backdrop{background:rgba(29,23,49,.32);backdrop-filter:blur(6px);overscroll-behavior:contain}
.modal{overscroll-behavior:contain}

@media(max-width:900px){
  .mobile-head{padding-top:env(safe-area-inset-top);min-height:calc(62px + env(safe-area-inset-top))}
  .main{padding-bottom:calc(112px + env(safe-area-inset-bottom))}
  .backdrop{place-items:center;align-items:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}
  .modal{width:min(94vw,520px);max-height:calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom));border-radius:22px}
  .modal.teaching-modal{width:min(94vw,680px)}
  .modal-head{padding:16px 17px}
  .modal-body{padding:16px 17px}
  button:not(.switch),summary,.btn,a.btn,.text-button,.check-grid label,.role-chip-list>label,.portal-media a,.existing-media a,.communication-media a{min-height:44px}
  .icon-btn,.close,.live-exit,.drive-remove,.mobile-back{width:44px;min-width:44px;height:44px;min-height:44px}
  .context-selector.compact button{min-width:44px;min-height:44px}
  .mobile-nav button{min-height:52px}
  .module-tabs button,.segmented button,.score-grid button,.student-assignment-list select,.guide-row select{min-height:44px}
  .student-row-actions .btn,.crm-row-actions .btn,.communication-recipient-actions .btn,.communication-batch-head .btn,.drive-folder-row .btn{min-height:44px}
  .main,.content,.page-head,.card,.student-row,.agenda-row,.marketing-workspace,.admin-panel{min-width:0;max-width:100%}
}

@media(max-width:560px){
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea{min-height:44px;font-size:16px!important}
  .field textarea{min-height:96px}
  .main{padding-right:12px;padding-left:12px}
  .mobile-nav{right:8px;left:8px;bottom:max(8px,env(safe-area-inset-bottom))}
  .mobile-nav button{font-size:11.5px}
  .backdrop{padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}
  .modal{width:min(94vw,520px);max-height:calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));border-radius:20px}
  .actions{flex-wrap:wrap}
}
'''

student_marker = '/* v23 · ficha centrada y táctil */'
if student_marker in student_css:
    raise SystemExit('v23 student visual integrity block already exists')

student_css += r'''

/* v23 · ficha centrada y táctil */
@media(max-width:820px){
  .backdrop{place-items:center;align-items:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));background:rgba(29,23,49,.34);backdrop-filter:blur(6px)}
  .modal{width:min(94vw,720px);height:auto;max-height:calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom));border:1px solid #e7e2ef;border-radius:24px;box-shadow:0 28px 80px #241b4638}
  .body{overscroll-behavior:contain;padding-bottom:max(12px,env(safe-area-inset-bottom))}
  .actions>button:not(.close),.close,.tabs button,.issueBox>div button,.sectionHead>button,.classList article>button{min-height:44px}
  .close{width:44px;height:44px;min-width:44px}
  .sectionHead>button{padding:0 11px}
}
@media(max-width:430px){
  .backdrop{padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}
  .modal{width:calc(100vw - 20px);max-height:calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));border-radius:20px}
}
'''

GLOBAL.write_text(global_css)
STUDENT.write_text(student_css)
