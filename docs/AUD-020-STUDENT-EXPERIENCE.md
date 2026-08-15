# AUD-020 — Student experience redesign

This branch implements the approved P36 objective-first redesign for the student portal and the teacher's student master detail without changing Supabase schema, permissions, class flow, or canonical data sources.

## Invariants

- Student portal remains limited by the existing P22 snapshot/RLS contract.
- Teacher-only CRM, internal notes, incidents, and administrative controls remain outside the student portal.
- Existing PR-F1/PR-F2 navigation semantics stay intact.
- No duplicate student data model or alternate notification/mission engine is introduced.
- Mobile contracts: 390/430 px, effective targets >=44 px, no horizontal overflow, safe-area compatible.
- Desktop contract: 1280 px remains contained and usable.
- `prefers-reduced-motion` disables non-essential motion.

## Visual hierarchy

Student: greeting → `AHORA` → class preparation → compact progress/missions/BZ summary → secondary feedback/content/activity.

Teacher: four goal areas (`Ahora`, `Aprendizaje`, `Historial`, `Perfil`) with compact local views and a full-screen mobile operational sheet.
