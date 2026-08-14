import { readFileSync, writeFileSync } from "node:fs";
const path="db/migrations/v76_bz_points_rewards.sql";
let source=readFileSync(path,"utf8");
const before="create trigger bz_people_registration after insert or update of auth_user_id,active,updated_at on public.people";
const after="create trigger bz_people_registration after insert or update of auth_user_id,active on public.people";
if(!source.includes(before) || source.indexOf(before)!==source.lastIndexOf(before)) throw new Error("Expected registration trigger fragment exactly once");
source=source.replace(before,after);
writeFileSync(path,source);
