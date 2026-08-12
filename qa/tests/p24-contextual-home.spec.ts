import { expect, test } from "@playwright/test";
import { greetingForTimestamp, selectHomeFocus } from "../../app/p24-home-domain";
import type { Mission } from "../../app/v14-types";

const urgentMission: Mission = { id:900001, rule_key:"qa", mission_type:"main", state:"available", priority:"urgent", priority_score:100, title:"QA urgente", description:null, action_target:"home", due_at:null, estimated_duration_minutes:5, calendar_block:false };
const scheduled=(id:number, timestamp:number)=>({ id, status:"scheduled", scheduled_start_at:new Date(timestamp).toISOString(), pedagogy_closed_at:null });

function credentials(role:"teacher"|"admin"){
  const prefix=`QA_${role.toUpperCase()}`; const email=process.env[`${prefix}_EMAIL`], password=process.env[`${prefix}_PASSWORD`];
  if(!email||!password) throw new Error(`${role} QA credentials are missing`); return {email,password};
}
async function login(page:import("@playwright/test").Page, role:"teacher"|"admin"){
  const {email,password}=credentials(role); await page.goto("/",{waitUntil:"domcontentloaded"}); await page.locator('input[name="email"]').fill(email); await page.locator('input[name="password"]').fill(password); await page.getByRole("button",{name:/^Entrar$/}).click(); await expect(page.locator('input[name="email"]')).toBeHidden({timeout:20_000});
}

test("P24 exact 31/30 minute boundary outranks an urgent mission only at 30",()=>{
  const now=Date.parse("2026-08-12T18:00:00Z");
  const at31=selectHomeFocus([scheduled(1,now+31*60_000)],[urgentMission],now,"Europe/Madrid");
  expect(at31?.kind).toBe("mission");
  const at30=selectHomeFocus([scheduled(2,now+30*60_000)],[urgentMission],now,"Europe/Madrid");
  expect(at30?.kind).toBe("class"); expect(at30?.reason).toBe("within_30");
});

test("P24 active class always wins",()=>{
  const now=Date.parse("2026-08-12T18:00:00Z");
  const focus=selectHomeFocus([{id:3,status:"active",scheduled_start_at:new Date(now-60_000).toISOString()}],[urgentMission],now,"Europe/Madrid");
  expect(focus?.kind).toBe("class"); expect(focus?.reason).toBe("active");
});

test("P24 greeting follows Madrid morning afternoon and night boundaries",()=>{
  const boundaries={morning_start:"05:00",afternoon_start:"12:00",night_start:"20:00"};
  expect(greetingForTimestamp(Date.parse("2026-08-12T08:00:00Z"),"Europe/Madrid",boundaries)).toBe("Buenos días");
  expect(greetingForTimestamp(Date.parse("2026-08-12T13:00:00Z"),"Europe/Madrid",boundaries)).toBe("Buenas tardes");
  expect(greetingForTimestamp(Date.parse("2026-08-12T20:30:00Z"),"Europe/Madrid",boundaries)).toBe("Buenas noches");
});

test("P24 teacher home renders contextual day summary",async({page})=>{
  await login(page,"teacher");
  await expect(page.locator("h1")).toContainText(/Buenos días|Buenas tardes|Buenas noches/);
  await expect(page.getByLabel("Resumen del día")).toBeVisible();
  await expect(page.getByRole("heading",{name:/Agenda del día/})).toBeVisible();
});

test("P24 admin exposes daily quote management",async({page})=>{
  await login(page,"admin");
  await page.getByRole("button",{name:/Administración/}).click();
  await expect(page.getByRole("heading",{name:"Inicio · Frases diarias"})).toBeVisible({timeout:20_000});
  await expect(page.getByRole("button",{name:/Previsualizar/})).toBeVisible();
  await expect(page.getByText("Importar CSV")).toBeVisible();
});
