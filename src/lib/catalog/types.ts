export interface CatalogItemView {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  usableOnHand: number;
  repairQuantity: number;
  expectedOn: string | null;
  tags: readonly string[];
  publicRemarks: string;
  specifications: Readonly<Record<string, string>>;
  illustration: "controller" | "actuator" | "compute" | "tool" | "parts" | "analyzer";
  photo: { src: string; alt: string } | null;
  availabilityLabel?: string;
}

export interface OperationalSummary {
  pendingRequests: number;
  pendingMemberApplications: number;
  readyPickups: number;
  overdueLoans: number;
  repairQueue: number;
  retentionFailures: number;
  pendingPasswordResetRequests: number;
}
