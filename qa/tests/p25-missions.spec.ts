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

test("P25 admin explains automatic mission expiry without technical-only labels",async({page})=>{
  await login(page);
  await page.getByRole("button",{name:/Administración/}).click();
  await page.getByRole("button",{name:/Misiones/}).click();

  await expect(page.getByRole("heading",{name:"Misiones automáticas"})).toBeVisible({timeout:20_000});
  await expect(page.getByText("Zona horaria",{exact:true})).toBeVisible();
  await expect(page.getByText("Ejecución automática",{exact:true})).toBeVisible();
  await expect(page.getByText(/Cada 15 min/)).toBeVisible();

  const firstRule=page.locator("details.admin-rule").first();
  await firstRule.locator("summary").click();
  const failureSelect=firstRule.getByText("Al vencer",{exact:true}).locator("..").locator("select");
  await expect(failureSelect).toBeVisible();

  const labels=await failureSelect.locator("option").allTextContents();
  expect(labels).toContain("Marcar no realizada");
  expect(labels).toContain("Caducar");
  expect(labels).toContain("Repetir");
});
