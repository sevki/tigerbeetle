import { test, expect } from "@playwright/test";

test("moves a transfer between two accounts and shows real double-entry balances", async ({
  page,
}) => {
  await page.goto("/accounts");

  await expect(page.locator("#acc-id")).not.toHaveValue("");
  const debitId = await page.locator("#acc-id").inputValue();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created").first()).toBeVisible();

  await page.locator("#acc-id").fill(String(BigInt(Date.now()) * 1_000_000n + 1n));
  await expect(page.locator("#acc-id")).not.toHaveValue("");
  const creditId = await page.locator("#acc-id").inputValue();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created").last()).toBeVisible();

  await page.goto("/transfers");
  await expect(page.locator("#xfer-id")).not.toHaveValue("");
  await page.locator("#xfer-debit").fill(debitId);
  await page.locator("#xfer-credit").fill(creditId);
  await page.locator("#xfer-amount").fill("250");
  await page.getByRole("button", { name: "Create transfer" }).click();
  await expect(page.getByText("Transfer created")).toBeVisible();

  await page.goto("/accounts");
  const debitRow = page.locator("tbody tr", { hasText: debitId });
  const creditRow = page.locator("tbody tr", { hasText: creditId });
  await expect(debitRow.locator("td").nth(3)).toHaveText("250"); // debits posted
  await expect(creditRow.locator("td").nth(4)).toHaveText("250"); // credits posted
});

test("rejected transfer (nonexistent credit account) surfaces the rejection, not a false success", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(page.locator("#acc-id")).not.toHaveValue("");
  const debitId = await page.locator("#acc-id").inputValue();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();

  await page.goto("/transfers");
  await expect(page.locator("#xfer-id")).not.toHaveValue("");
  await page.locator("#xfer-debit").fill(debitId);
  // Never created -- the state machine must reject this as "credit account not found" rather
  // than silently succeeding.
  await page.locator("#xfer-credit").fill("999999999999999999999");
  await page.locator("#xfer-amount").fill("10");
  await page.getByRole("button", { name: "Create transfer" }).click();

  await expect(page.getByText(/Transfer rejected/)).toBeVisible();
  await expect(page.getByText("Transfer created")).not.toBeVisible();
});
