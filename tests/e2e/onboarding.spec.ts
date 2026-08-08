import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("onboarding form has no automatically detectable accessibility violations @a11y", async ({
  page
}) => {
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "Complete your member profile.", level: 1 })
  ).toBeVisible();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
});

test("onboarding remains usable without horizontal overflow at mobile width", async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only");
  await page.goto("/onboarding");
  await expect(page.getByLabel("College ID image")).toBeAttached();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
