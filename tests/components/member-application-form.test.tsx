/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import { MemberApplicationForm } from "@/components/onboarding/member-application-form";

afterEach(cleanup);

describe("member application form", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
  });

  it("presents a labelled file-only verification form with privacy guidance", () => {
    render(<MemberApplicationForm mode="initial" />);

    expect(screen.getByRole("textbox", { name: "Full name" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Student ID" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Department" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Academic year" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Phone (optional)" })).not.toBeRequired();
    const file = screen.getByLabelText("College ID image");
    expect(file).toHaveAttribute("type", "file");
    expect(file).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(file).not.toHaveAttribute("capture");
    expect(screen.getByText(/deleted 30 days after a final decision/i)).toBeInTheDocument();
  });

  it("shows administrator feedback and names the resubmission action", () => {
    render(
      <MemberApplicationForm
        mode="changes_requested"
        decisionReason="Upload a clearer image with all four corners visible."
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Upload a clearer image with all four corners visible."
    );
    expect(screen.getByRole("button", { name: "Resubmit for review" })).toBeEnabled();
  });

  it("posts multipart data and moves to the status page only after a committed response", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ status: "pending_review", referenceId: "safe-reference" }, { status: 201 })
      );
    render(<MemberApplicationForm mode="initial" />);

    await user.type(screen.getByRole("textbox", { name: "Full name" }), "Ada Student");
    await user.type(screen.getByRole("textbox", { name: "Student ID" }), "S-2026-0042");
    await user.type(screen.getByRole("textbox", { name: "Department" }), "ECE");
    await user.selectOptions(screen.getByRole("combobox", { name: "Academic year" }), "2");
    await user.upload(
      screen.getByLabelText("College ID image"),
      new File(["image"], "id.png", { type: "image/png" })
    );
    fireEvent.submit(screen.getByRole("button", { name: "Send for review" }).closest("form")!);

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/member-application",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) })
      )
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/pending"));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});
