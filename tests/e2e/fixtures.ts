import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors, `Unexpected browser errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
