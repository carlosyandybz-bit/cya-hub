"use client";

import { useEffect } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

const staffRoles = new Set(["admin", "teacher_admin", "teacher"]);

type PendingClass = {
  id: number;
  class_participants: Array<{ person_id: number }>;
};

/**
 * Ensures a finished class has its dedicated post-class (`evaluation_kind = class`)
 * review session. The visible gate remains responsible for rendering/completing it.
 *
 * This deliberately does not treat a completed initial evaluation as the review.
 * The RPC is idempotent and locks the class row, so concurrent gate/preparer calls
 * converge on the same class-kind session rather than creating duplicates.
 */
export function EvaluationPostClassPreparer() {
  useEffect(() => {
    let cancelled = false;
    let running = false;

    const inspect = async () => {
      if (cancelled || running || document.visibilityState !== "visible") return;
      const client = getRuntimeSupabaseClient();
      if (!client) return;
      running = true;

      try {
        const sessionResult = await client.auth.getSession();
        const userId = sessionResult.data.session?.user.id;
        if (!userId || cancelled) return;

        const roleResult = await client
          .from("app_member_roles")
          .select("role,active")
          .eq("user_id", userId)
          .eq("active", true);
        if (roleResult.error || cancelled) return;
        const isStaff = (roleResult.data ?? []).some((row) => staffRoles.has(String(row.role)));
        if (!isStaff) return;

        const classResult = await client
          .from("classes")
          .select("id,class_participants(person_id)")
          .eq("status", "finished")
          .not("administrative_finished_at", "is", null)
          .is("pedagogy_closed_at", null)
          .order("administrative_finished_at", { ascending: true })
          .limit(10);
        if (classResult.error || cancelled) return;

        for (const item of (classResult.data ?? []) as unknown as PendingClass[]) {
          for (const participant of item.class_participants ?? []) {
            if (cancelled) return;
            const existing = await client
              .from("evaluation_sessions")
              .select("id,status")
              .eq("class_id", item.id)
              .eq("person_id", participant.person_id)
              .eq("evaluation_kind", "class")
              .order("id", { ascending: false })
              .limit(1);
            if (existing.error || (existing.data ?? []).length) continue;

            const prepared = await client.rpc("prepare_post_class_evaluations", {
              p_class_id: item.id,
              p_person_id: participant.person_id,
            });
            if (prepared.error) {
              // Initial evaluation may legitimately be incomplete. The visible gate
              // surfaces actionable errors when the teacher reaches that class.
              console.warn("Post-class review preparation deferred", {
                classId: item.id,
                personId: participant.person_id,
                message: prepared.error.message,
              });
            }
          }
        }
      } finally {
        running = false;
      }
    };

    void inspect();
    const timer = window.setInterval(() => void inspect(), 30_000);
    const onVisibility = () => void inspect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
