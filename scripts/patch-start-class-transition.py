from pathlib import Path

path = Path('app/cya-app.tsx')
text = path.read_text()

old_refresh = '''  const refreshLive = useCallback(async () => { await Promise.all([loadOperations(),loadTeaching(),loadMarketing()]); }, [loadOperations,loadTeaching,loadMarketing]);'''
new_refresh = '''  const refreshLive = useCallback(async () => {
    await loadOperations();
    try { await loadTeaching(); }
    catch (error) { setToast(error instanceof Error ? error.message : "La clase está abierta, pero no se pudo actualizar la enseñanza."); }
  }, [loadOperations,loadTeaching]);'''
if old_refresh in text:
    text = text.replace(old_refresh, new_refresh, 1)
elif new_refresh not in text:
    raise SystemExit('refreshLive anchor not found')

old_begin = '''  async function begin() { if (!db) return; setBusy(true); setError(""); const result=await db.rpc("start_class",{p_class_id:item.id}); if (result.error) { setError(result.error.message); setBusy(false); return; } await refresh(); notify("Clase abierta."); setBusy(false); }'''
new_begin = '''  async function begin() {
    if (!db || busy) return;
    setBusy(true); setError("");
    try {
      const result=await db.rpc("start_class",{p_class_id:item.id});
      if (result.error) throw result.error;
      await refresh();
      notify("Clase abierta.");
    } catch (cause) {
      const message=typeof cause === "object" && cause && "message" in cause ? String(cause.message) : "No se pudo iniciar la clase.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }'''
if old_begin in text:
    text = text.replace(old_begin, new_begin, 1)
elif new_begin not in text:
    raise SystemExit('ClassPreparationStage.begin anchor not found')

path.write_text(text)
