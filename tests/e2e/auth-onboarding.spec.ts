import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { test, expect } from "./fixtures";

async function collegeIdFixture() {
  return sharp({
    create: { width: 640, height: 400, channels: 3, background: "#d9f2f5" }
  })
    .png()
    .toBuffer();
}

test("student can move through demo auth, onboarding, and pending lockout @critical", async ({
  page
}) => {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Institutional email").fill("new.student@iiitp.ac.in");
  await page.getByRole("textbox", { name: "Create password" }).fill("CorrectHorse42!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your institutional inbox." })
  ).toBeVisible();
  await expect(page.getByText("If that address can be registered")).toBeVisible();

  await page.goto("/auth/sign-in");
  await page.getByLabel("Institutional email").fill("anaya.kulkarni@iiitp.ac.in");
  await page.getByRole("textbox", { name: "Password" }).fill("CorrectHorse42!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Build with what is actually ready." })
  ).toBeVisible();

  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Complete your member profile." })).toBeVisible();
  await page.getByLabel("Full name").fill("New Student");
  await page.getByLabel("Student ID").fill("FIC-2499");
  await page.getByLabel("Department").fill("Electronics and Communication Engineering");
  await page.getByLabel("Academic year").selectOption("2");
  await page.getByLabel("Phone (optional)").fill("+91 98765 43210");
  await page.getByLabel("College ID image").setInputFiles({
    name: "college-id.png",
    mimeType: "image/png",
    buffer: await collegeIdFixture()
  });
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(
    page.getByRole("heading", { name: "Your application is with the club team." })
  ).toBeVisible();
  await expect(
    page.getByText("You cannot access the catalog or borrowing tools yet.")
  ).toBeVisible();
});

test("password recovery uses the same generic acknowledgement", async ({ page }) => {
  await page.goto("/auth/forgot-password");
  await page.getByLabel("Institutional email").fill("unknown.student@iiitp.ac.in");
  await page.getByRole("button", { name: "Request password reset" }).click();
  await expect(
    page.getByRole("heading", { name: "Your reset request is with the club team." })
  ).toBeVisible();
  await expect(page.getByText("If an account can use that address")).toBeVisible();
});

test("auth and onboarding surfaces have no automatically detectable accessibility violations @a11y", async ({
  page
}) => {
  for (const [path, heading] of [
    ["/auth/sign-up", "Start with your institution identity."],
    ["/onboarding", "Complete your member profile."],
    ["/pending", "Your application is with the club team."],
    ["/admin/members", "Verify member applications"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations, path).toEqual([]);
  }
});

test("auth/onboarding mobile surfaces do not overflow horizontally", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only");
  for (const path of ["/auth/sign-up", "/onboarding", "/pending", "/admin/members"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
