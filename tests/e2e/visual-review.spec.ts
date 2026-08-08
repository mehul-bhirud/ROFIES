import { test, expect } from "./fixtures";

test("capture representative member and staff surfaces @visual", async ({ page }, testInfo) => {
  const profile = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build with what is actually ready." })
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.screenshot({
    path: `docs/verification-artifacts/catalog-${profile}.png`,
    fullPage: true
  });
  await page.goto("/admin/handover");
  await expect(page.getByRole("heading", { name: "Put custody in the right hands" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.screenshot({
    path: `docs/verification-artifacts/handover-${profile}.png`,
    fullPage: true
  });
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Complete your member profile." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.screenshot({
    path: `docs/verification-artifacts/onboarding-${profile}.png`,
    fullPage: true
  });
  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "Verify member applications" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.screenshot({
    path: `docs/verification-artifacts/member-review-${profile}.png`,
    fullPage: true
  });
});
