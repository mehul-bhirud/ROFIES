import type { Page } from "@playwright/test";
import sharp from "sharp";
import { test, expect } from "./fixtures";

test.describe.configure({ timeout: 90_000 });

const routes = [
  "/",
  "/catalog/00000000-0000-0000-0000-000000000101",
  "/requests",
  "/notifications",
  "/contacts",
  "/offline",
  "/onboarding",
  "/pending",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/update-password",
  "/auth/check-email",
  "/auth/error?code=permission_denied",
  "/admin",
  "/admin/account-recovery",
  "/admin/approvals",
  "/admin/handover",
  "/admin/inventory",
  "/admin/members",
  "/admin/operations",
  "/admin/returns"
] as const;

const crashText =
  /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error/i;

async function pngFixture() {
  return sharp({
    create: { width: 640, height: 400, channels: 3, background: "#d9f2f5" }
  })
    .png()
    .toBuffer();
}

async function gotoRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 200, route).toBeLessThan(500);
}

async function assertPageHealthy(page: Page, context: string) {
  await expect(page.locator("body"), context).not.toContainText(crashText);
  await expect(page.locator("main").first(), context).toBeVisible();
  await expect(page.locator("main h1").first(), context).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${context}: document overflow`).toBeLessThanOrEqual(1);
  const horizontallyClipped = await page.evaluate(() =>
    [...document.body.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.position === "fixed" ||
          element.closest("[aria-hidden='true']")
        )
          return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1 && (rect.left < -1 || rect.right > innerWidth + 1);
      })
      .slice(0, 5)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          viewport: innerWidth
        };
      })
  );
  expect(horizontallyClipped, `${context}: clipped visible elements`).toEqual([]);
}

async function fillControls(page: Page) {
  const controls = page.locator("input, textarea, select");
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
    const metadata = await control.evaluate((element) => {
      const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      return {
        tag: field.tagName.toLowerCase(),
        type: field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase(),
        id: field.id,
        name: field.getAttribute("name") ?? "",
        value: field.value,
        readOnly: "readOnly" in field && field.readOnly,
        options:
          field instanceof HTMLSelectElement
            ? [...field.options].filter((option) => !option.disabled).map((option) => option.value)
            : []
      };
    });
    if (metadata.readOnly) continue;
    if (metadata.tag === "select") {
      const value = metadata.options.find((option) => option.length > 0) ?? metadata.options[0];
      if (value !== undefined) await control.selectOption(value);
      continue;
    }
    if (metadata.type === "file") {
      await control.setInputFiles({
        name: "smoke.png",
        mimeType: "image/png",
        buffer: await pngFixture()
      });
      continue;
    }
    if (metadata.type === "checkbox" || metadata.type === "radio") {
      await control.check().catch(() => control.click());
      continue;
    }
    const identity = `${metadata.id} ${metadata.name}`.toLowerCase();
    const value =
      metadata.type === "email"
        ? "smoke.student@iiitp.ac.in"
        : metadata.type === "password"
          ? "CorrectHorse42!"
          : metadata.type === "number"
            ? "1"
            : metadata.type === "date"
              ? "2026-09-10"
              : metadata.type === "datetime-local"
                ? identity.includes("end") ||
                  identity.includes("due") ||
                  identity.includes("proposed")
                  ? "2026-09-12T18:00"
                  : "2026-09-10T10:00"
                : metadata.type === "time"
                  ? "10:00"
                  : metadata.type === "tel"
                    ? "+91 98765 43210"
                    : "Release smoke test";
    await control.fill(value);
    if (metadata.type !== "search") await expect(control).toHaveValue(value);
  }
}

test("all primary routes render without crashes, console errors, or horizontal overflow", async ({
  page
}) => {
  for (const route of routes) {
    await gotoRoute(page, route);
    await assertPageHealthy(page, route);
  }
});

test("visible form controls on every route can be operated", async ({ page }) => {
  for (const route of routes) {
    await gotoRoute(page, route);
    await fillControls(page);
    await assertPageHealthy(page, `${route} after control edits`);
  }
});

test("visible buttons on every route are actionable and do not crash the page", async ({
  page
}) => {
  for (const route of routes) {
    await gotoRoute(page, route);
    const buttonCount = await page.locator("button").count();
    for (let index = 0; index < buttonCount; index += 1) {
      await gotoRoute(page, route);
      await fillControls(page);
      const button = page.locator("button").nth(index);
      if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
      const name = (await button.innerText().catch(() => "")).trim() || `button ${index + 1}`;
      await button.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 3_000 }).catch(() => {});
      await assertPageHealthy(page, `${route} after clicking ${name}`);
    }
  }
});

test("same-origin page links are clickable and do not route to crash pages", async ({ page }) => {
  const seen = new Set<string>();
  const links: Array<{ route: string; index: number; target: string; name: string }> = [];

  for (const route of routes) {
    await gotoRoute(page, route);
    const linkCount = await page.locator("a[href]").count();
    for (let index = 0; index < linkCount; index += 1) {
      const link = page.locator("a[href]").nth(index);
      if (!(await link.isVisible())) continue;
      const href = await link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        continue;
      const target = new URL(href, page.url());
      if (target.origin !== new URL(page.url()).origin || target.pathname.startsWith("/api/"))
        continue;
      const targetPath = `${target.pathname}${target.search}${target.hash}`;
      if (seen.has(targetPath)) continue;
      seen.add(targetPath);
      links.push({
        route,
        index,
        target: targetPath,
        name: (await link.innerText().catch(() => "")).trim() || href
      });
    }
  }

  for (const { route, index, target, name } of links) {
    await gotoRoute(page, route);
    const link = page.locator("a[href]").nth(index);
    if (!(await link.isVisible())) continue;
    const current = new URL(page.url());
    if (`${current.pathname}${current.search}${current.hash}` === target) continue;
    await Promise.all([
      page.waitForURL((url) => `${url.pathname}${url.search}${url.hash}` === target, {
        waitUntil: "domcontentloaded"
      }),
      link.click()
    ]);
    const actual = new URL(page.url());
    expect(
      `${actual.pathname}${actual.search}${actual.hash}`,
      `${route} after clicking ${name}`
    ).toBe(target);
    await assertPageHealthy(page, `${route} after clicking ${name}`);
  }
});
