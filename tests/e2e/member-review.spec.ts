import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("membership admin reviews an applicant without leaking a durable document URL", async ({
  page
}) => {
  const imageResponsePromise = page.waitForResponse("**/api/member-application/id-document?**");
  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "Verify member applications" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rhea Nair" })).toBeVisible();

  const imageResponse = await imageResponsePromise;
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["cache-control"]).toContain("no-store");
  expect(imageResponse.url()).not.toContain("applications/");

  await page.getByLabel("Decision reason for Rhea Nair").fill("Identity verified at desk");
  await page.getByRole("button", { name: "Verify and activate Rhea Nair" }).click();
  await expect(page.getByRole("status")).toContainText("committed and audit event recorded");
});

test("member review controls remain usable at mobile width", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only");
  await page.goto("/admin/members");
  await expect(page.getByRole("button", { name: "Verify and activate Rhea Nair" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("member review page has no automatically detectable accessibility violations @a11y", async ({
  page
}) => {
  await page.goto("/admin/members");
  await expect(
    page.getByRole("heading", { name: "Verify member applications", level: 1 })
  ).toBeVisible();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
});
