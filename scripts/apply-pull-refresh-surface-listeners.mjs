import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  return source.replace(needle, replacement);
}

function patch(path, needle, replacement, label) {
  const before = fs.readFileSync(path, 'utf8');
  const after = replaceOnce(before, needle, replacement, label);
  fs.writeFileSync(path, after);
  console.log(`patched ${path}`);
}

const listener = (loadName) => `\n  useEffect(() => {\n    const onPullRefresh = (event: Event) => {\n      const promise = ${loadName}();\n      const detail = (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail;\n      detail?.waitUntil?.(promise);\n    };\n    window.addEventListener(\"cya:refresh\", onPullRefresh);\n    return () => window.removeEventListener(\"cya:refresh\", onPullRefresh);\n  }, [${loadName}]);`;

patch(
  'app/home-view.tsx',
  `  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, dayKey]);`,
  `  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, dayKey]);${listener('load')}`,
  'Home refresh listener',
);

patch(
  'app/agenda-view.tsx',
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void load(), 0);\n    return () => clearTimeout(timer);\n  }, [load]);`,
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void load(), 0);\n    return () => clearTimeout(timer);\n  }, [load]);${listener('load')}`,
  'Agenda refresh listener',
);

patch(
  'app/notifications-view.tsx',
  `  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);`,
  `  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);${listener('load')}`,
  'Notifications refresh listener',
);

patch(
  'app/admin-view.tsx',
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void load(), 0);\n    return () => clearTimeout(timer);\n  }, [load]);`,
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void load(), 0);\n    return () => clearTimeout(timer);\n  }, [load]);${listener('load')}`,
  'Admin refresh listener',
);

patch(
  'app/academy-online-teacher.tsx',
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void load(), 0);\n    return () => window.clearTimeout(timer);\n  }, [load]);`,
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void load(), 0);\n    return () => window.clearTimeout(timer);\n  }, [load]);${listener('load')}`,
  'Academy refresh listener',
);

patch(
  'app/statistics-explorer.tsx',
  `  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);`,
  `  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);${listener('load')}`,
  'Statistics refresh listener',
);
