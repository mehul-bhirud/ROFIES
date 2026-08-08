import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("member discovers equipment and submits a bounded request @critical", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build with what is actually ready." })
  ).toBeVisible();
  await page.getByRole("link", { name: "View Arduino Mega 2560" }).click();
  await expect(page.getByRole("heading", { name: "Arduino Mega 2560", level: 1 })).toBeVisible();
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Project or event").fill("Autonomy Sprint");
  await page.getByLabel("Start").fill("2026-08-11T10:00");
  await page.getByLabel("End").fill("2026-08-16T18:00");
  await page.getByLabel("Purpose").fill("Line-following robot control prototype");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("status")).toContainText("Request submitted for review");
});

test("catalog search has a useful empty state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search equipment" }).fill("quantum flux capacitor");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("heading", { name: "No equipment matches" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
});

test("member catalog has no automatically detectable accessibility violations @a11y", async ({
  page
}) => {
  await page.goto("/");
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
});

test("mobile layout preserves labeled navigation without horizontal overflow", async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only");
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Member navigation" }).last()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "My activity" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Requests, reservations, and loans" })
  ).toBeVisible();
});
