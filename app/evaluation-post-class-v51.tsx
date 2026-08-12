"use client";

import { useEffect, useRef } from "react";
import { EvaluationPostClassGate } from "./evaluation-post-class";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

type PendingClass = {
  id:number;
  class_participants:Array<{ person_id:number }>;
};

type EvaluationSession = {
  class_id:number|null;
  person_id:number;
  evaluation_kind:string;
  status:string;
};

const staffRoles=new Set(["admin","teacher_admin","teacher"]);

/**
 * v51 compatibility coordinator.
 *
 * The post-class UI historically decided whether a review was pending by
 * looking at every evaluation session attached to the class. Since the guided
 * initial evaluation is also attached to that class, a completed `initial`
 * session could be mistaken for the completed post-class `class` review.
 *
 * The v51 database contract now permits both session kinds for the same
 * class/person/context. This coordinator idempotently asks the database to
 * prepare the `class` review for administratively finished classes before the
 * existing gate evaluates them. The RPC remains the authority and rejects any
 * class that is not eligible.
 */
export function EvaluationPostClassGateV51() {
  const attempted=useRef(new Set<string>());

  useEffect(() => {
    let cancelled=false;
    let interval:number|undefined;
    let bootstrapInterval:number|undefined;

    const preparePendingReviews=async () => {
      const client=getRuntimeSupabaseClient();
      if (!client || cancelled) return false;

      const sessionResult=await client.auth.getSession();
      const userId=sessionResult.data.session?.user.id;
      if (!userId || cancelled) return false;

      const roleResult=await client.from("app_member_roles")
        .select("role,active")
        .eq("user_id",userId)
        .eq("active",true);
      if (roleResult.error || cancelled) return false;

      const roles=(roleResult.data ?? []).map((row) => String(row.role));
      if (!roles.some((role) => staffRoles.has(role))) return true;

      const classResult=await client.from("classes")
        .select("id,class_participants(person_id)")
        .eq("status","finished")
        .not("administrative_finished_at","is",null)
        .is("pedagogy_closed_at",null)
        .order("administrative_finished_at",{ascending:true})
        .limit(10);
      if (classResult.error || cancelled) return true;

      const classes=(classResult.data ?? []) as unknown as PendingClass[];
      if (!classes.length) return true;

      const classIds=classes.map((item) => item.id);
      const evaluationResult=await client.from("evaluation_sessions")
        .select("class_id,person_id,evaluation_kind,status")
        .in("class_id",classIds);
      if (evaluationResult.error || cancelled) return true;

      const sessions=(evaluationResult.data ?? []) as EvaluationSession[];
      let created=false;

      for (const item of classes) {
        for (const participant of item.class_participants) {
          const key=`${item.id}:${participant.person_id}`;
          const classReview=sessions.find((session) =>
            session.class_id===item.id &&
            session.person_id===participant.person_id &&
            session.evaluation_kind==="class"
          );
          if (classReview || attempted.current.has(key)) continue;

          attempted.current.add(key);
          const result=await client.rpc("prepare_post_class_evaluations",{
            p_class_id:item.id,
            p_person_id:participant.person_id,
          });
          if (!result.error) created=true;
          else console.warn("CYA post-class review preparation skipped",{
            classId:item.id,
            personId:participant.person_id,
            message:result.error.message,
          });
        }
      }

      if (created && !cancelled) {
        document.dispatchEvent(new Event("visibilitychange"));
      }
      return true;
    };

    const bootstrap=async () => {
      const resolved=await preparePendingReviews();
      if (!resolved || cancelled) return;
      if (bootstrapInterval!==undefined) window.clearInterval(bootstrapInterval);
      interval=window.setInterval(() => void preparePendingReviews(),15000);
    };

    void bootstrap();
    bootstrapInterval=window.setInterval(() => void bootstrap(),1000);
    const onVisibility=() => {
      if (document.visibilityState==="visible") void preparePendingReviews();
    };
    document.addEventListener("visibilitychange",onVisibility);

    return () => {
      cancelled=true;
      if (interval!==undefined) window.clearInterval(interval);
      if (bootstrapInterval!==undefined) window.clearInterval(bootstrapInterval);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[]);

  return <EvaluationPostClassGate/>;
}
