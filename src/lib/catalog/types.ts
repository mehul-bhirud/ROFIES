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

export interface Category {
  id: string;
  name: string;
}

export interface StorageLocation {
  id: string;
  label: string;
}

export interface InventoryListItem {
  id: string;
  name: string;
  categoryName: string;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  archivedAt: string | null;
  usableOnHand: number;
  repairQuantity: number;
}

export interface CatalogItemDetail {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  publicRemarks: string;
  internalRemarks: string;
  defaultLoanDays: number | null;
  maximumLoanDays: number | null;
  memberQuantityLimit: number | null;
  pickupWindowHours: number | null;
  waitlistEnabled: boolean;
  counterIssueEnabled: boolean;
  lowStockThreshold: number | null;
  acquisitionDate: string | null;
  supplier: string | null;
  warrantyUntil: string | null;
  replacementCost: number | null;
  archivedAt: string | null;
  tags: readonly string[];
}
