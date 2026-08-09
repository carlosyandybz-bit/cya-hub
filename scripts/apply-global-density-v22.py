from pathlib import Path

student = Path('app/student-detail.module.css')
media = Path('app/teaching-media-editor.module.css')

student_extra = r'''

/* v22 · densidad móvil: conservar legibilidad reduciendo altura innecesaria */
@media(max-width:820px){
.backdrop{align-items:stretch;padding:0}.modal{width:100vw;height:100dvh;max-height:none;border:0;border-radius:0}.header{gap:10px;padding:calc(10px + env(safe-area-inset-top)) 12px 48px}.hero{gap:9px}.avatar{width:42px;height:42px}.avatar svg{width:25px}.hero h2{margin:2px 0 4px;font-size:18px}.heroMeta{gap:4px}.heroMeta>span{min-height:23px;padding:0 7px}.actions{right:10px;top:calc(58px + env(safe-area-inset-top));left:10px;gap:5px}.actions>button:not(.close){min-height:32px;padding:0 9px}.close{width:38px;height:38px}.tabs{gap:3px;padding:5px 6px}.tabs button{min-height:34px;padding:0 10px}.body{padding:8px 9px calc(18px + env(safe-area-inset-bottom))}.stack{gap:9px}.issueBox{border-radius:14px}.issueBox header{padding:10px}.issueBox>div button{min-height:38px;padding:0 10px}.metrics{gap:6px}.metrics article{min-height:76px;gap:5px;padding:10px;border-radius:13px}.sectionCard{padding:10px;border-radius:14px}.sectionHead{margin-bottom:8px}.sectionHead h3{margin-top:2px}.danceGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.danceGrid>div{padding:9px}.notesGrid{grid-template-columns:1fr;gap:8px}.recentGrid,.evalGrid,.dataGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.notesGrid article{padding:10px;border-radius:13px}.longText{margin-top:8px;padding-top:8px}.compactList button{min-height:43px;padding:6px 0}.learningList{gap:5px}.learningList summary{min-height:50px;padding:8px 9px}.learningBody{padding:9px}.radar{gap:8px}.radar svg{max-width:220px}.radar figcaption{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.radar figcaption span{padding-bottom:4px}.historyList>div{padding:7px 0}.classList{gap:5px}.classList article{grid-template-columns:32px minmax(0,1fr) auto;gap:7px;padding:8px}.classIcon{width:32px;height:32px}.classList article>button,.classList article>.statusPill{grid-column:auto;width:auto}.creditGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.creditGrid article{padding:9px}.creditGrid article>b{margin-top:9px}.readGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.readGrid>div{padding:8px}
}
@media(max-width:430px){.header{padding-bottom:48px}.heroMeta>span{font-size:11.5px}.recentGrid,.evalGrid,.dataGrid,.danceGrid,.creditGrid,.readGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.classList article{grid-template-columns:30px minmax(0,1fr)}.classList article>button,.classList article>.statusPill{grid-column:2;width:max-content}}
'''

media_extra = r'''

/* v22 · editor multimedia compacto y táctil */
@media(max-width:620px){
.editor{gap:10px;padding:10px;border-radius:15px}.editorHead{gap:7px}.editorHead h3{margin:3px 0 3px}.summary{min-width:52px;padding:7px}.coverSection{grid-template-columns:112px minmax(0,1fr);gap:9px}.coverInfo span{margin-top:4px;line-height:1.35}.coverInfo small{margin-top:4px}.uploadActions{gap:6px}.uploadButton,.secondaryButton{min-height:42px;padding:0 9px}.manualRow{gap:6px}.manualRow select,.manualRow input,.manualRow button{min-height:40px}.items{gap:7px}.item{grid-template-columns:96px minmax(0,1fr);gap:8px;padding:8px;border-radius:12px}.itemFields{gap:6px}.itemFields label>span{margin-bottom:3px}.itemFields input{min-height:40px}.itemFlags{gap:4px}.itemFlags button,.frameButton{min-height:33px;padding:0 7px}.itemOrder{gap:4px}.itemOrder button{width:32px;height:32px}.emptyState{min-height:96px}.frameModal{gap:9px;padding:12px 12px calc(16px + env(safe-area-inset-bottom))}.frameModal>header strong{margin-top:2px}.timeline{gap:7px}.primary{min-height:42px}
}
'''

for path, extra, marker in [
    (student, student_extra, 'v22 · densidad móvil'),
    (media, media_extra, 'v22 · editor multimedia'),
]:
    text = path.read_text()
    if marker not in text:
        path.write_text(text.rstrip() + extra + '\n')
