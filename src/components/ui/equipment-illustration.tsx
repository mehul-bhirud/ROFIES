import { Activity, Box, CircuitBoard, Cog, Cpu, Wrench } from "lucide-react";
import type { CatalogItemView } from "@/lib/catalog/types";

const icons = {
  controller: CircuitBoard,
  actuator: Cog,
  compute: Cpu,
  tool: Wrench,
  parts: Box,
  analyzer: Activity
};

export function EquipmentIllustration({
  kind,
  name
}: {
  kind: CatalogItemView["illustration"];
  name: string;
}) {
  const Icon = icons[kind];
  return (
    <div
      className={`equipment-illustration illustration-${kind}`}
      role="img"
      aria-label={`${name} technical illustration`}
    >
      <span className="illustration-grid" aria-hidden="true" />
      <Icon size={64} strokeWidth={1.35} aria-hidden="true" />
      <span className="illustration-code" aria-hidden="true">
        ROF / {kind.slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}
