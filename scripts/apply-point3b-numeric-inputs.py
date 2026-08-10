from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def replace_all_checked(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} occurrences, found {count}")
    return text.replace(old, new)


# ---------------------------------------------------------------------------
# app/cya-app.tsx
# ---------------------------------------------------------------------------
path = ROOT / "app/cya-app.tsx"
text = path.read_text()

anchor = '''function authError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials")) return "El email o la contraseña no son correctos.";
  if (value.includes("email not confirmed")) return "Confirma primero tu email para entrar.";
  if (value.includes("too many requests")) return "Demasiados intentos seguidos. Espera un momento y vuelve a probar.";
  return message || "No se ha podido iniciar sesión.";
}
'''
helper = anchor + '''
function integerFieldValue(value: FormDataEntryValue | null, min: number, max: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (!/^\\d+$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function decimalFieldValue(value: FormDataEntryValue | null, min = 0, max = 10000000) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(",", ".");
  if (!/^\\d+(?:\\.\\d{0,2})?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}
'''
text = replace_once(text, anchor, helper, "insert cya numeric helpers")

old = '''    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const duration = Number(form.get("hours") || 0) * 60 + Number(form.get("minutes") || 0), scheduled = String(form.get("scheduled_at") || ""), style = Number(form.get("style_term_id") || 0);
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (!scheduled || duration <= 0 || !style) return setError("Indica fecha, hora, duración y estilo.");
'''
new = '''    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const hours = integerFieldValue(form.get("hours"), 0, 8), minutes = integerFieldValue(form.get("minutes"), 0, 59);
    const scheduled = String(form.get("scheduled_at") || ""), style = Number(form.get("style_term_id") || 0);
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (hours === null || minutes === null) return setError("Indica horas y minutos válidos.");
    const duration = hours * 60 + minutes;
    if (!scheduled || duration <= 0 || !style) return setError("Indica fecha, hora, duración y estilo.");
'''
text = replace_once(text, old, new, "manual class numeric validation")

old = '''        <label className="field"><span>Horas</span><input name="hours" type="number" min="0" max="8" defaultValue="1" /></label><label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue="0" /></label>'''
new = '''        <label className="field"><span>Horas</span><input name="hours" type="text" inputMode="numeric" pattern="[0-8]" defaultValue="1" /></label><label className="field"><span>Minutos</span><input name="minutes" type="text" inputMode="numeric" pattern="[0-5]?[0-9]" defaultValue="" /></label>'''
text = replace_once(text, old, new, "manual class numeric inputs")

old = '''    const hours = Number(form.get("hours") || 0), minutes = Number(form.get("minutes") || 0), duration = hours * 60 + minutes;
    const scheduled = String(form.get("scheduled_at") || "");
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (!scheduled || duration <= 0) return setError("Indica fecha, hora y duración.");
'''
new = '''    const hours = integerFieldValue(form.get("hours"), 0, 8), minutes = integerFieldValue(form.get("minutes"), 0, 59);
    const scheduled = String(form.get("scheduled_at") || "");
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (hours === null || minutes === null) return setError("Indica horas y minutos válidos.");
    const duration = hours * 60 + minutes;
    if (!scheduled || duration <= 0) return setError("Indica fecha, hora y duración.");
'''
text = replace_once(text, old, new, "schedule numeric validation")

text = replace_once(
    text,
    '''        <label className="field"><span>Horas</span><input name="hours" type="number" min="0" max="8" defaultValue="1" /></label>\n        <label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue="0" /></label>''',
    '''        <label className="field"><span>Horas</span><input name="hours" type="text" inputMode="numeric" pattern="[0-8]" defaultValue="1" /></label>\n        <label className="field"><span>Minutos</span><input name="minutes" type="text" inputMode="numeric" pattern="[0-5]?[0-9]" defaultValue="" /></label>''',
    "schedule numeric inputs",
)

old = '''    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const duration = Number(form.get("hours") || 0) * 60 + Number(form.get("minutes") || 0);
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (duration <= 0) return setError("El bono necesita una duración mayor que cero.");
    setBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", {
      p_student_ids: type === "pair" ? [first, second] : [first], p_modality: type, p_minutes: duration,
      p_price_cents: Math.round(Number(form.get("price") || 0) * 100), p_label: String(form.get("label") || "").trim() || null,
'''
new = '''    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const hours = integerFieldValue(form.get("hours"), 0, 1000), minutes = integerFieldValue(form.get("minutes"), 0, 59), price = decimalFieldValue(form.get("price"));
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (hours === null || minutes === null) return setError("Indica horas y minutos válidos.");
    if (price === null) return setError("Indica un importe válido.");
    const duration = hours * 60 + minutes;
    if (duration <= 0) return setError("El bono necesita una duración mayor que cero.");
    setBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", {
      p_student_ids: type === "pair" ? [first, second] : [first], p_modality: type, p_minutes: duration,
      p_price_cents: Math.round(price * 100), p_label: String(form.get("label") || "").trim() || null,
'''
text = replace_once(text, old, new, "credit numeric validation")

text = replace_once(
    text,
    '''        <label className="field"><span>Horas *</span><input name="hours" type="number" min="0" max="1000" defaultValue="5" /></label><label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue="0" /></label>\n        <label className="field"><span>Importe (€)</span><input name="price" type="number" min="0" step="0.01" defaultValue="0" /></label>''',
    '''        <label className="field"><span>Horas *</span><input name="hours" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="5" /></label><label className="field"><span>Minutos</span><input name="minutes" type="text" inputMode="numeric" pattern="[0-5]?[0-9]" defaultValue="" /></label>\n        <label className="field"><span>Importe (€)</span><input name="price" type="text" inputMode="decimal" pattern="[0-9]*([,.][0-9]{0,2})?" defaultValue="" /></label>''',
    "credit numeric inputs",
)

path.write_text(text)


# ---------------------------------------------------------------------------
# app/admin-view.tsx
# ---------------------------------------------------------------------------
path = ROOT / "app/admin-view.tsx"
text = path.read_text()

anchor = '''function readableError(message: string) {
  if (message.includes("permission") || message.includes("permiso")) return "Tu cuenta no tiene permiso real para realizar ese cambio.";
  return message;
}
'''
helper = anchor + '''
function boundedInteger(value: string, min: number, max: number) {
  const raw = value.trim();
  if (!/^\\d+$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : null;
}
'''
text = replace_once(text, anchor, helper, "insert admin numeric helper")

replacements = [
    (
        '''<input type="number" min="1" max="50" defaultValue={data.engine.max_daily} onBlur={(event) => updateRow("mission_engine_settings", "singleton", true, { max_daily: Number(event.target.value) }, "engine-max")} />''',
        '''<input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={data.engine.max_daily} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 1, 50); if (value === null) { event.currentTarget.value = String(data.engine?.max_daily ?? 1); notify("Indica un número entre 1 y 50."); return; } void updateRow("mission_engine_settings", "singleton", true, { max_daily: value }, "engine-max"); }} />''',
        "admin engine max",
    ),
    (
        '''<input type="number" min="1" max="480" defaultValue={rule.estimated_duration_minutes} onBlur={(event) => updateRow("mission_rules", "rule_key", rule.rule_key, { estimated_duration_minutes: Number(event.target.value) }, `mission-duration-${rule.rule_key}`)} />''',
        '''<input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.estimated_duration_minutes} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 1, 480); if (value === null) { event.currentTarget.value = String(rule.estimated_duration_minutes); notify("Indica una duración entre 1 y 480 minutos."); return; } void updateRow("mission_rules", "rule_key", rule.rule_key, { estimated_duration_minutes: value }, `mission-duration-${rule.rule_key}`); }} />''',
        "admin mission duration",
    ),
    (
        '''<input type="number" min="1" max="20" defaultValue={rule.max_daily} onBlur={(event) => updateRow("mission_rules", "rule_key", rule.rule_key, { max_daily: Number(event.target.value) }, `mission-max-${rule.rule_key}`)} />''',
        '''<input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.max_daily} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 1, 20); if (value === null) { event.currentTarget.value = String(rule.max_daily); notify("Indica un número entre 1 y 20."); return; } void updateRow("mission_rules", "rule_key", rule.rule_key, { max_daily: value }, `mission-max-${rule.rule_key}`); }} />''',
        "admin mission max",
    ),
    (
        '''<input type="number" min="0" max="10080" defaultValue={rule.anticipation_minutes} onBlur={(event) => updateRow("notification_rules", "event_key", rule.event_key, { anticipation_minutes: Number(event.target.value) }, `notification-time-${rule.event_key}`)} />''',
        '''<input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.anticipation_minutes} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 0, 10080); if (value === null) { event.currentTarget.value = String(rule.anticipation_minutes); notify("Indica una anticipación entre 0 y 10080 minutos."); return; } void updateRow("notification_rules", "event_key", rule.event_key, { anticipation_minutes: value }, `notification-time-${rule.event_key}`); }} />''',
        "admin notification anticipation",
    ),
]
for old, new, label in replacements:
    text = replace_once(text, old, new, label)
path.write_text(text)


# ---------------------------------------------------------------------------
# app/marketing-view-legacy.tsx
# ---------------------------------------------------------------------------
path = ROOT / "app/marketing-view-legacy.tsx"
text = path.read_text()

anchor = '''function euros(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}
'''
helper = anchor + '''
function decimalFormNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}
'''
text = replace_once(text, anchor, helper, "insert marketing decimal helper")

# Money parsing accepts both comma and dot from mobile decimal keyboards.
for old, new, expected, label in [
    ('Math.round(Number(form.get("quoted_amount") || 0) * 100)', 'Math.round(decimalFormNumber(form.get("quoted_amount")) * 100)', 1, "quoted amount parser"),
    ('Math.round(Number(f.get("price")||0)*100)', 'Math.round(decimalFormNumber(f.get("price"))*100)', 2, "marketing price parsers"),
    ('Math.round(Number(f.get("budget")||0)*100)', 'Math.round(decimalFormNumber(f.get("budget"))*100)', 1, "campaign budget parser"),
    ('Math.round(Number(f.get("spend")||0)*100)', 'Math.round(decimalFormNumber(f.get("spend"))*100)', 1, "metrics spend parser"),
    ('Math.round(Number(f.get("revenue")||0)*100)', 'Math.round(decimalFormNumber(f.get("revenue"))*100)', 1, "metrics revenue parser"),
]:
    text = replace_all_checked(text, old, new, expected, label)

# Replace every remaining number input with a mobile-friendly text field.
def convert_number_input(match: re.Match[str]) -> str:
    tag = match.group(0)
    decimal = 'step="0.01"' in tag
    tag = tag.replace('type="number"', 'type="text"')
    tag = re.sub(r'\smin="[^"]*"', '', tag)
    tag = re.sub(r'\smax="[^"]*"', '', tag)
    tag = re.sub(r'\sstep="[^"]*"', '', tag)
    if decimal:
        tag = tag.replace('type="text"', 'type="text" inputMode="decimal" pattern="[0-9]*([,.][0-9]{0,2})?"', 1)
    else:
        tag = tag.replace('type="text"', 'type="text" inputMode="numeric" pattern="[0-9]*"', 1)
    return tag

before = len(re.findall(r'<input\b[^>]*type="number"[^>]*/?>', text))
if before != 12:
    raise SystemExit(f"marketing number input audit: expected 12, found {before}")
text = re.sub(r'<input\b[^>]*type="number"[^>]*/?>', convert_number_input, text)

# Do not force zero into fresh numeric fields. Existing stored zeroes can still be shown when editing.
text = text.replace('defaultValue={current?.spend_cents?current.spend_cents/100:0}', 'defaultValue={current ? current.spend_cents / 100 : ""}')
text = text.replace('defaultValue={current?.impressions??0}', 'defaultValue={current ? current.impressions : ""}')
text = text.replace('defaultValue={current?.reach??0}', 'defaultValue={current ? current.reach : ""}')
text = text.replace('defaultValue={current?.clicks??0}', 'defaultValue={current ? current.clicks : ""}')
text = text.replace('defaultValue={current?.inquiries??0}', 'defaultValue={current ? current.inquiries : ""}')
text = text.replace('defaultValue={current?.bookings??0}', 'defaultValue={current ? current.bookings : ""}')
text = text.replace('defaultValue={current?.revenue_cents?current.revenue_cents/100:0}', 'defaultValue={current ? current.revenue_cents / 100 : ""}')
text = text.replace('defaultValue={item?item.price_cents/100:0}', 'defaultValue={item ? item.price_cents / 100 : ""}')
text = text.replace('defaultValue={hours}/>', 'defaultValue={item ? hours : ""}/>')
text = text.replace('defaultValue={minutes}/>', 'defaultValue={item ? minutes : ""}/>')

# Minutes must still be validated as 0..59 after changing away from type=number.
old = '''function RateEditor({ db, item, close, saved }: { db: SupabaseClient; item: MarketingRate | null; close: () => void; saved: (message: string) => Promise<void> }) {
  const[busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);setBusy(true);const hours=Number(f.get("hours")||0),minutes=Number(f.get("minutes")||0),duration=hours*60+minutes;const r=await db.rpc("save_marketing_rate",'''
new = '''function RateEditor({ db, item, close, saved }: { db: SupabaseClient; item: MarketingRate | null; close: () => void; saved: (message: string) => Promise<void> }) {
  const[busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);const hours=Number(f.get("hours")||0),minutes=Number(f.get("minutes")||0);if(!Number.isSafeInteger(hours)||hours<0||!Number.isSafeInteger(minutes)||minutes<0||minutes>59){setError("Indica horas y minutos válidos.");return;}setBusy(true);const duration=hours*60+minutes;const r=await db.rpc("save_marketing_rate",'''
text = replace_once(text, old, new, "rate range validation")

path.write_text(text)

# Global safety: Point 3B removes browser number controls from app TSX.
remaining = []
for tsx in (ROOT / "app").rglob("*.tsx"):
    content = tsx.read_text()
    if 'type="number"' in content:
        remaining.append(str(tsx.relative_to(ROOT)))
if remaining:
    raise SystemExit("type=number remains in: " + ", ".join(remaining))

print("Point 3B numeric input patch applied successfully")
