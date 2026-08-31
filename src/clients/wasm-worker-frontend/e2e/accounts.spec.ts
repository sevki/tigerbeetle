import { test, expect } from "@playwright/test";

// Drives the real UI against a real `celld dev` instance of the wasm-worker Worker (see
// global-setup.ts) — not a mocked API — so this exercises the full stack: browser -> Next.js ->
// fetch -> celld -> the TigerBeetle wasm engine.

test("creates an account and shows it in the known-accounts table", async ({ page }) => {
  await page.goto("/accounts");

  await expect(page.locator("#acc-id")).not.toHaveValue("");
  const id = await page.locator("#acc-id").inputValue();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Account created")).toBeVisible();
  // `getByRole("row", {name})`'s accessible-name computation for plain <tr>/<td> markup (no
  // explicit ARIA labels) is unreliable across browsers, so match on cell text directly instead.
  const row = page.locator("tbody tr", { hasText: id });
  await expect(row).toBeVisible();
  const cells = row.locator("td");
  await expect(cells.nth(3)).toHaveText("0"); // debits posted
  await expect(cells.nth(4)).toHaveText("0"); // credits posted
});

test("looks up an account by ID that wasn't created in this session", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.locator("#acc-id")).not.toHaveValue("");
  const id = await page.locator("#acc-id").inputValue();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();

  // Reload clears this page's in-memory state, but not localStorage history -- the account
  // should still resolve, proving lookup (not just the create response) round-trips correctly.
  await page.reload();
  await expect(page.locator("tbody tr", { hasText: id })).toBeVisible();
});
