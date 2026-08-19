-- Applied to CYA Hub staging. Extends crm_person_explorer_v with questionnaire and dance dimensions.
-- Manual CRM interest classifications override interests inferred from the student's latest onboarding submission.
-- The view exposes declared dance data and evaluated dance data separately so self-reported level can never replace staff evaluation.

-- See database migration history for the canonical applied DDL. This repository migration marker documents the staged schema change.
select 1;
