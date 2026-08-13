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

test("P27 administration shows the real automatic notification engine",async({page})=>{
  await login(page);
  await page.getByRole("button",{name:/Administración/}).click();
  await page.getByRole("button",{name:/Notificaciones/}).click();
  await expect(page.getByRole("heading",{name:"Motor de notificaciones"})).toBeVisible({timeout:20_000});
  await expect(page.getByRole("heading",{name:"Bandeja interna operativa"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Salud del motor"})).toBeVisible();
  await expect(page.getByText("Sin conexión verificada",{exact:true})).toHaveCount(2);
  await expect(page.getByText("Email",{exact:true})).toBeVisible();
  await expect(page.getByText("WhatsApp",{exact:true})).toBeVisible();
});

test("P27 notification rules expose quiet hours without claiming external delivery",async({page})=>{
  await login(page);
  await page.getByRole("button",{name:/Administración/}).click();
  await page.getByRole("button",{name:/Notificaciones/}).click();
  await expect(page.getByRole("heading",{name:"Reglas automáticas"})).toBeVisible({timeout:20_000});
  await expect(page.getByText("Silencio desde",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("Silencio hasta",{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/no generará un falso envío/i).first()).toBeVisible();
});
