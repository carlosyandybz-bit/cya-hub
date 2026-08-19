"use client";

import { ClipboardCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextEvaluationPanel } from "./context-evaluation-panel-p0f";
import { getRuntimeSupabaseClient } from "./supabase-runtime";
import styles from "./student-master-evaluation-access.module.css";

type Target = { host: Element; name: string };
type Person = { id: number; display_name: string };

function nodeText(node: Element | null) {
  return node?.textContent?.trim() ?? "";
}

function findMasterTarget(): Target | null {
  const title = document.getElementById("student-master-title");
  if (!title) return null;
  const dialog = title.closest('[role="dialog"][aria-modal="true"]');
  const header = title.closest("header");
  if (!dialog || !header) return null;
  const host = Array.from(header.querySelectorAll("div")).find((item) => {
    const buttons = Array.from(item.querySelectorAll(":scope > button"));
    return buttons.some((button) => /programar/i.test(nodeText(button))) && buttons.some((button) => /bono/i.test(nodeText(button)));
  });
  return host ? { host, name: nodeText(title) } : null;
}

async function resolvePerson(client: SupabaseClient, displayName: string): Promise<Person> {
  const result = await client.from("people").select("id,display_name").eq("display_name", displayName).eq("active", true).limit(3);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as Person[];
  if (rows.length !== 1) {
    throw new Error(rows.length ? "Hay varias personas con este mismo nombre. Abre una ficha inequívoca antes de evaluar." : "No se ha podido resolver el alumno de esta ficha.");
  }
  return rows[0];
}

export function StudentMasterEvaluationAccess() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setClient(getRuntimeSupabaseClient());
    const scan = () => setTarget(findMasterTarget());
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open || !client || !target) return;
    let alive = true;
    setLoading(true);
    setError("");
    void resolvePerson(client, target.name)
      .then((resolved) => { if (alive) setPerson(resolved); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "No se ha podido abrir la evaluación."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [client, open, target]);

  if (!target) return null;

  const trigger = createPortal(
    <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Evaluar alumno">
      <ClipboardCheck /> <span>Evaluar</span>
    </button>,
    target.host,
  );

  if (!open) return trigger;

  const modal = createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="student-master-evaluation-title">
        <header className={styles.header}>
          <div>
            <span>Ficha maestra · Evaluación del alumno</span>
            <h2 id="student-master-evaluation-title">Evaluar</h2>
            <p>{person?.display_name ?? target.name}</p>
          </div>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Cerrar evaluación"><X /></button>
        </header>
        <div className={styles.content}>
          {loading ? <p className={styles.state}>Cargando evaluación…</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {!loading && !error && client && person ? (
            <ContextEvaluationPanel
              client={client}
              personId={person.id}
              personName={person.display_name}
              classId={null}
            />
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );

  return <>{trigger}{modal}</>;
}
