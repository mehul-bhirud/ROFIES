import { test, expect } from "./fixtures";

test("responses include browser security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("cross-origin mutation is rejected before command execution", async ({ request }) => {
  const response = await request.post("/api/commands/handover", {
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    data: {
      reservationId: "00000000-0000-0000-0000-000000000501",
      dueAt: "2026-08-20T18:00:00.000Z",
      remarks: "Identity checked in person",
      idempotencyKey: "handover-security-test"
    }
  });
  expect(response.status()).toBe(403);
});

test("search input is rendered as text and cannot execute script", async ({ page }) => {
  await page.addInitScript(() => {
    window.alert = () => {
      throw new Error("XSS executed");
    };
  });
  const payload = '"><img src=x onerror=alert(1)>';
  await page.goto(`/?q=${encodeURIComponent(payload)}`);
  await expect(page.getByRole("heading", { name: "No equipment matches" })).toBeVisible();
  expect(await page.locator("img[src='x']").count()).toBe(0);
});
