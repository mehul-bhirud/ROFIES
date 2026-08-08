// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  updatePasswordAction: vi.fn()
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() })
}));

import { AuthForm } from "@/components/auth/auth-form";

afterEach(cleanup);

describe("authentication form", () => {
  it("provides labelled sign-in fields and recovery navigation", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByLabelText("Institutional email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/auth/forgot-password"
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("explains password requirements on signup", () => {
    render(<AuthForm mode="sign-up" />);

    expect(screen.getByText(/at least 12 characters/i)).toBeVisible();
    expect(screen.getByLabelText("Create password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
    expect(screen.getByRole("link", { name: "Sign in instead" })).toHaveAttribute(
      "href",
      "/auth/sign-in"
    );
  });

  it("uses two new-password fields when updating a password", () => {
    render(<AuthForm mode="update-password" />);

    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });
});
