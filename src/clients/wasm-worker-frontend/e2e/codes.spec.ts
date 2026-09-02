import { test, expect } from "@playwright/test";

// Drives the real UI against a real `celld dev` instance of the wasm-worker Worker (see
// global-setup.ts) — same origin serving both the built SPA and the /ledger/* API.

test("registers a code as a currency and resolves it on the account it's used for", async ({
  page,
}) => {
  await page.goto("/codes");

  await page.locator("#code-ledger").fill("7");
  await page.locator("#code-code").fill("70");
  await page.locator("#code-kind").fill("currency");
  await page.locator("#code-name").fill("Euro");
  await page.locator("#code-symbol").fill("€");
  await page.locator("#code-decimals").fill("2");
  await page.getByRole("button", { name: "Register code" }).click();

  await expect(page.getByText("Code registered")).toBeVisible();
  const codeRow = page.locator("tbody tr", { hasText: "Euro" });
  await expect(codeRow).toBeVisible();
  await expect(codeRow.locator("td").nth(3)).toHaveText("€");

  await page.goto("/accounts");
  await page.locator("#acc-ledger").fill("7");
  await page.locator("#acc-code").fill("70");
  const id = await page.locator("#acc-id").inputValue();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();

  const accountRow = page.locator("tbody tr", { hasText: id });
  await expect(accountRow).toBeVisible();
  // Debits posted column, formatted with the registered currency's symbol/decimals.
  await expect(accountRow.locator("td").nth(4)).toHaveText("€0.00");
});
