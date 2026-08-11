from pathlib import Path
import re

# 1) Alumnado: replace the handwritten student identity form with the versioned runtime.
p=Path('app/person-identity-editor.tsx')
s=p.read_text()
if 'from "./runtime-form"' not in s:
    s=s.replace('import { CheckCircle2, Plus, X } from "lucide-react";','import { Plus, X } from "lucide-react";\nimport { RuntimeForm } from "./runtime-form";')
if 'RuntimeForm client={client} formKey="student_personal"' not in s:
    start=s.index('export function StudentIdentityEditor')
    end=s.index('type QuickProvisionalStudentModalProps')
    replacement='''export function StudentIdentityEditor({ client, person, close, saved }: StudentIdentityEditorProps) {
  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="person-editor-title">
      <header className="modal-head"><div><p className="eyebrow">Alumnado</p><h2 id="person-editor-title">Editar ficha</h2></div><button type="button" className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
      <div className="modal-body">
        <RuntimeForm client={client} formKey="student_personal" personId={person.id} mode="edit" submitLabel="Guardar ficha" onSaved={async () => { await saved(); close(); }} />
        <p className="modal-intro">Los datos conocidos se editan en su fuente real. El envío conserva la versión utilizada, pero no duplica nombre, teléfono, objetivos ni otros hechos canónicos.</p>
      </div>
    </section>
  </div>;
}

'''
    s=s[:start]+replacement+s[end:]
p.write_text(s)

# 2) Administración: delegate Forms to the dedicated immutable-version library.
p=Path('app/admin-view.tsx')
s=p.read_text()
if 'from "./admin-form-library"' not in s:
    s=s.replace('import { AdminDataTransfer } from "./admin-data-transfer";','import { AdminDataTransfer } from "./admin-data-transfer";\nimport { AdminFormLibrary } from "./admin-form-library";')
if '<AdminFormLibrary client={client} notify={notify} />' not in s:
    pattern=r'  function formsSection\(\) \{.*?\n  \}\n\n  function teachingSection\(\) \{'
    replacement='''  function formsSection() {
    return <AdminFormLibrary client={client} notify={notify} />;
  }

  function teachingSection() {'''
    s,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
    if n!=1:
        raise SystemExit('Could not replace formsSection')
p.write_text(s)

# 3) SQL corrections found by static review before the production dry-run.
p=Path('supabase/v48_p20_form_engine.sql')
s=p.read_text()
s=s.replace("jsonb_build_object('form_key',v_form.form_key,'version',v_version.version_number,'person_id',v_target,'canonical_fields',jsonb_object_keys(v_canonical_updates))",
            "jsonb_build_object('form_key',v_form.form_key,'version',v_version.version_number,'person_id',v_target,'canonical_fields',to_jsonb(array(select jsonb_object_keys(v_canonical_updates))))")
s=s.replace("select ff.*,fv.status into v_field,v_status from public.form_fields ff join public.form_versions fv on fv.id=ff.form_version_id where ff.id=p_field_id for update of ff;",
            "select ff,fv.status into v_field,v_status from public.form_fields ff join public.form_versions fv on fv.id=ff.form_version_id where ff.id=p_field_id for update of ff;")
s=s.replace("perform v_text::date;","perform cast(v_text as date);")
p.write_text(s)
