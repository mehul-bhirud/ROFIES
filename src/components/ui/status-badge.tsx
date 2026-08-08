import type { PropsWithChildren } from "react";
import { CircleCheck, CircleDashed, TriangleAlert, XCircle } from "lucide-react";
import clsx from "clsx";

type Tone = "neutral" | "success" | "warning" | "danger" | "signal";

const icons = {
  neutral: CircleDashed,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: XCircle,
  signal: CircleDashed
};

export function StatusBadge({ tone = "neutral", children }: PropsWithChildren<{ tone?: Tone }>) {
  const Icon = icons[tone];
  return (
    <span className={clsx("status-badge", `status-${tone}`)} data-tone={tone}>
      <Icon aria-hidden="true" size={14} strokeWidth={2.2} />
      {children}
    </span>
  );
}
