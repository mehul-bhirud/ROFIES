import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import type { CatalogItemView } from "@/lib/catalog/types";
import { EquipmentIllustration } from "@/components/ui/equipment-illustration";
import { StatusBadge } from "@/components/ui/status-badge";

const trackingLabels: Record<CatalogItemView["trackingMode"], string> = {
  pooled_reusable: "Pooled reusable",
  individual_asset: "Individual asset",
  consumable: "Consumable"
};

export function EquipmentCard({ item, eager = false }: { item: CatalogItemView; eager?: boolean }) {
  const available = item.usableOnHand > 0;
  return (
    <article className="equipment-card">
      <div className="availability-rail" data-available={available} aria-hidden="true" />
      {item.photo ? (
        <div className="equipment-photo">
          <Image
            src={item.photo.src}
            alt={item.photo.alt}
            width={1200}
            height={800}
            sizes="(max-width: 680px) 100vw, (max-width: 1180px) 50vw, 33vw"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
          />
        </div>
      ) : (
        <EquipmentIllustration kind={item.illustration} name={item.name} />
      )}
      <div className="equipment-card-body">
        <div className="equipment-meta">
          <span>{item.categoryName}</span>
          <span>{trackingLabels[item.trackingMode]}</span>
        </div>
        <h2>{item.name}</h2>
        <p>{item.description}</p>
        <div className="tag-row" aria-label="Equipment tags">
          {item.tags.slice(0, 3).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <div className="equipment-card-footer">
          <StatusBadge tone={available ? "success" : "warning"}>
            {item.usableOnHand} {item.availabilityLabel ?? "available now"}
          </StatusBadge>
          {item.expectedOn ? (
            <span className="expected-return">
              <CalendarClock size={15} aria-hidden="true" />
              Expected {item.expectedOn}
            </span>
          ) : null}
          <Link href={`/catalog/${item.id}`} aria-label={`View ${item.name}`} className="card-link">
            View item <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
