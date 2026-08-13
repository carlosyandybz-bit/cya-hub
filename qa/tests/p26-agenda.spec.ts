import { expect, test } from "@playwright/test";

function credentials(){
  const email=process.env.QA_ADMIN_EMAIL, password=process.env.QA_ADMIN_PASSWORD;
  if(!email||!password) throw new Error("admin QA credentials are missing");
  return {email,password};
}

async function login(page:import("@playwright/test").Page){
  const {email,password}=credentials();
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:/^Entrar$/}).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({timeout:20_000});
}

test("P26 Agenda exposes Google Calendar safely without requiring OAuth secrets in CI",async({page})=>{
  await login(page);
  await page.getByRole("button",{name:/Agenda completa/}).click();
  await expect(page.getByRole("heading",{name:"Calendario CYA"})).toBeVisible({timeout:20_000});
  await expect(page.getByText("Google Calendar",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Día"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Semana"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Mes"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Lista"})).toBeVisible();
  const connect=page.getByRole("button",{name:/Conectar Google Calendar/});
  await expect(connect).toBeVisible();
  await expect(page.getByText("El servidor todavía no tiene disponible el cliente OAuth de Google Calendar.",{exact:true})).toBeVisible({timeout:20_000});
  await expect(connect).toBeDisabled();
});

test("P26 Administration uses one real Google Calendar integration card",async({page})=>{
  await login(page);
  await page.getByRole("button",{name:/Administración/}).click();
  await page.getByRole("button",{name:/Integraciones/}).click();
  await expect(page.getByRole("heading",{name:"Integraciones"})).toBeVisible({timeout:20_000});
  await expect(page.getByText("Google Calendar",{exact:true})).toHaveCount(1);
  await expect(page.getByText("Sincronización de agenda",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/Conectar Google Calendar/})).toBeDisabled();
});