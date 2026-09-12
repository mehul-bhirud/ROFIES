import { test, expect } from "./fixtures";

test("staff can create a catalog item with only the required fields @critical", async ({
  page
}) => {
  await page.goto("/admin/inventory/new");
  await expect(page.getByRole("heading", { name: "Add a catalog item", level: 2 })).toBeVisible();

  await page.getByLabel("Category").selectOption({ label: "Controllers" });
  await page.getByLabel("Name", { exact: true }).fill("Test Bench Sensor Kit");
  await page.getByLabel("Description").fill("A sensor kit used to verify the add-item flow.");

  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Catalog item created and audit event recorded."
  );
});

test("description is required to create a catalog item", async ({ page }) => {
  await page.goto("/admin/inventory/new");

  await page.getByLabel("Category").selectOption({ label: "Controllers" });
  await page.getByLabel("Name", { exact: true }).fill("Test Item Missing Description");
  const description = page.getByLabel("Description");

  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await description.evaluate((element: HTMLTextAreaElement) => element.validity.valid)).toBe(
    false
  );
});

test("staff can create a new category inline while adding a catalog item", async ({ page }) => {
  await page.goto("/admin/inventory/new");

  await page.getByLabel("Category").selectOption({ label: "+ Create a new category…" });
  await page.getByLabel("New category name").fill("Sensors and Instrumentation");
  await page.getByLabel("Name", { exact: true }).fill("Test Thermal Camera");
  await page.getByLabel("Description").fill("Handheld thermal imaging camera for diagnostics.");

  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Catalog item created and audit event recorded."
  );
});
