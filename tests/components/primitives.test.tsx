// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/ui/status-badge";
import { EquipmentCard } from "@/components/catalog/equipment-card";
import { demoCatalog } from "@/lib/demo-data";

describe("interface primitives", () => {
  it("exposes status as text instead of relying on color", () => {
    render(<StatusBadge tone="warning">Due tomorrow</StatusBadge>);
    expect(screen.getByText("Due tomorrow")).toBeVisible();
    expect(screen.getByText("Due tomorrow").closest("span")).toHaveAttribute(
      "data-tone",
      "warning"
    );
  });

  it("gives an equipment card a descriptive link and explicit availability", () => {
    render(<EquipmentCard item={demoCatalog[0]!} />);
    expect(screen.getByRole("link", { name: /view arduino mega 2560/i })).toHaveAttribute(
      "href",
      "/catalog/00000000-0000-0000-0000-000000000101"
    );
    expect(screen.getByText("10 available now")).toBeVisible();
    expect(screen.getByText("Pooled reusable")).toBeVisible();
  });
});
