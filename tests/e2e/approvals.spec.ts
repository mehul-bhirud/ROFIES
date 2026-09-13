import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("reviewing a specific request opens that request's own decision modal @critical", async ({
  page
}) => {
  await page.goto("/admin/approvals");
  await expect(page.getByRole("heading", { name: "Decide with current capacity" })).toBeVisible();

  const rows = page.locator(".data-table tbody tr");
  await expect(rows).toHaveCount(3);

  const firstRequestId = await rows.nth(0).locator(".data-id").innerText();
  const secondRequestId = await rows.nth(1).locator(".data-id").innerText();
  expect(firstRequestId).not.toEqual(secondRequestId);

  await rows.nth(1).getByRole("button", { name: "Review" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: new RegExp(secondRequestId) })).toBeVisible();
  await dialog.getByRole("button", { name: "Close review" }).click();
  await expect(dialog).toBeHidden();

  await rows.nth(0).getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: new RegExp(firstRequestId) })
  ).toBeVisible();
});

test("staff can confirm a decision from the review modal", async ({ page }) => {
  await page.goto("/admin/approvals");

  await page
    .locator(".data-table tbody tr")
    .first()
    .getByRole("button", { name: "Review" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Decision committed and audit event recorded."
  );
});

test("approvals page and its open decision modal have no automatically detectable accessibility violations @a11y", async ({
  page
}) => {
  await page.goto("/admin/approvals");
  const pageScan = await new AxeBuilder({ page }).include("main").analyze();
  expect(pageScan.violations).toEqual([]);

  await page
    .locator(".data-table tbody tr")
    .first()
    .getByRole("button", { name: "Review" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialogScan = await new AxeBuilder({ page }).include("dialog").analyze();
  expect(dialogScan.violations).toEqual([]);
});
