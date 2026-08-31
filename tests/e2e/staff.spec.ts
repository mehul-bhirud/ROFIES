import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("staff confirms a phone-friendly handover @critical", async ({ page }) => {
  await page.goto("/admin/handover");
  await expect(page.getByRole("heading", { name: "Put custody in the right hands" })).toBeVisible();
  await expect(page.getByText("Verify in person")).toBeVisible();
  await page.getByLabel("Due date and time").fill("2026-08-20T18:00");
  await page.getByRole("button", { name: "Confirm handover" }).click();
  await expect(page.getByRole("status")).toContainText("committed and audit event recorded");
});

test("staff records a partial mixed-condition return", async ({ page }) => {
  await page.goto("/admin/returns");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Incoming condition").selectOption("repair_required");
  await page
    .getByLabel("Confirmation remarks")
    .fill("Channel 4 is intermittent; route to electronics bench");
  await page.getByRole("button", { name: "Confirm return" }).click();
  await expect(page.getByRole("status")).toContainText("committed and audit event recorded");
});

test("staff handover page has no automatically detectable accessibility violations @a11y", async ({
  page
}) => {
  await page.goto("/admin/handover");
  await expect(page.getByRole("heading", { name: "Put custody in the right hands" })).toBeVisible();
  const scan = await new AxeBuilder({ page }).include("main").analyze();
  expect(scan.violations).toEqual([]);
});
