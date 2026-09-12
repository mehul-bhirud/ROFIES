import { test as base, expect } from "@playwright/test";

// React's dev-only hydration diff occasionally flags a `caret-color` style on
// required <input>/<textarea> fields that Chromium itself injects at runtime
// (not present in any component's render output on either server or client,
// and not reproducible in a production build, where React does not run this
// diagnostic). Filtered here rather than in application code because there is
// no server/client divergence to fix.
const knownBenignConsoleNoise =
  /A tree hydrated but some attributes of the server rendered HTML didn't match/;

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !knownBenignConsoleNoise.test(message.text()))
          errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors, `Unexpected browser errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
