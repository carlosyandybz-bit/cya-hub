import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  return source.replace(needle, replacement);
}

function patchFile(path, mutator) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutator(before);
  if (after === before) throw new Error(`${path}: patch produced no changes`);
  fs.writeFileSync(path, after);
  console.log(`patched ${path}`);
}

patchFile('app/cya-app.tsx', (source) => {
  const needle = `  const refreshMarketing = useCallback(async () => { await Promise.all([loadMarketing(),loadStudents()]); }, [loadMarketing,loadStudents]);\n  useEffect(() => {\n    let alive = true;`;
  const replacement = `  const refreshMarketing = useCallback(async () => { await Promise.all([loadMarketing(),loadStudents()]); }, [loadMarketing,loadStudents]);\n  const refreshAllPortalData = useCallback(async () => {\n    await Promise.all([loadStudents(), loadOperations(), loadTeaching(), loadMarketing(), loadNotificationCount()]);\n  }, [loadStudents, loadOperations, loadTeaching, loadMarketing, loadNotificationCount]);\n  useEffect(() => {\n    const onPullRefresh = (event: Event) => {\n      const promise = refreshAllPortalData().catch((error) => {\n        setToast(error instanceof Error ? error.message : \"No se pudieron actualizar los datos.\");\n      });\n      const detail = (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail;\n      detail?.waitUntil?.(promise);\n    };\n    window.addEventListener(\"cya:refresh\", onPullRefresh);\n    return () => window.removeEventListener(\"cya:refresh\", onPullRefresh);\n  }, [refreshAllPortalData]);\n  useEffect(() => {\n    let alive = true;`;
  return replaceOnce(source, needle, replacement, 'StaffApp refresh bridge');
});

patchFile('app/student-portal-prf.tsx', (source) => {
  const needle = `  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);\n  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(\"\"), 3500); return () => clearTimeout(timer); }, [toast]);`;
  const replacement = `  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);\n  useEffect(() => {\n    const onPullRefresh = (event: Event) => {\n      const promise = load();\n      const detail = (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail;\n      detail?.waitUntil?.(promise);\n    };\n    window.addEventListener(\"cya:refresh\", onPullRefresh);\n    return () => window.removeEventListener(\"cya:refresh\", onPullRefresh);\n  }, [load]);\n  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(\"\"), 3500); return () => clearTimeout(timer); }, [toast]);`;
  return replaceOnce(source, needle, replacement, 'Student portal refresh bridge');
});
