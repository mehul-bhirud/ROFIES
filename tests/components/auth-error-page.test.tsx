// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthErrorPage from "@/app/auth/error/page";

describe("authentication error guidance", () => {
  it("honestly explains that retry can repair partially saved account setup", async () => {
    render(
      await AuthErrorPage({
        searchParams: Promise.resolve({ code: "profile_unavailable" })
      })
    );

    expect(screen.getByText(/some account setup may already be saved/i)).toBeVisible();
    expect(screen.getByText(/sign in again/i)).toBeVisible();
    expect(
      screen.queryByText(/no account or membership state was changed/i)
    ).not.toBeInTheDocument();
  });
});
