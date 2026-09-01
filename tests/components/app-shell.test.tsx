// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/admin"
}));
vi.mock("@/lib/auth/actions", () => ({
  signOutAction: vi.fn()
}));
vi.mock("@/lib/operations/queries", () => ({
  getAccountContext: vi.fn(async () => ({
    displayName: "Mehul Bhirud",
    initials: "MB",
    roleLabel: "System administrator",
    unreadNotifications: 0,
    environmentLabel: "test"
  }))
}));

describe("AppShell account menu", () => {
  it("opens profile navigation separately from the sign-out action", async () => {
    const user = userEvent.setup();
    render(
      await AppShell({
        mode: "staff",
        children: <h1>Dashboard</h1>
      })
    );

    await user.click(screen.getByRole("button", { name: /account menu for mehul bhirud/i }));

    expect(screen.getByRole("link", { name: /view profile for mehul bhirud/i })).toHaveAttribute(
      "href",
      "/profile"
    );
    expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
  });
});
