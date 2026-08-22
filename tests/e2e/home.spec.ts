import { test, expect } from "@playwright/test";

test("creates a room and shows its sharing controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Compartilhe sua tela/ })).toBeVisible();
  await page.getByRole("button", { name: "Criar sala privada" }).click();
  await expect(page.getByRole("heading", { name: "Compartilhe sua tela" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar tela" })).toBeVisible();
  await expect(page.getByText(/Participantes/)).toBeVisible();
});

test("allows a second browser to join and appear in the participant list", async ({ browser, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala privada" }).click();
  await expect(page.getByRole("heading", { name: "Compartilhe sua tela" })).toBeVisible();
  const invite = page.url().replace(/\?.*$/, "");
  const second = await browser.newPage();
  await second.goto(invite);
  await second.getByPlaceholder("Seu nome").fill("Convidado");
  await second.getByRole("button", { name: "Entrar na sala" }).click();
  await expect(second.getByText("Convidado")).toBeVisible();
  await expect(page.getByText("Convidado")).toBeVisible();
  await second.close();
});
