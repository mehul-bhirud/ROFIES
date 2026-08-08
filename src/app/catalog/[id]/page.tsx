import { notFound } from "next/navigation";
import Image from "next/image";
import { CalendarClock, Info, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EquipmentIllustration } from "@/components/ui/equipment-illustration";
import { RequestForm } from "@/components/forms/request-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCatalogItem } from "@/lib/catalog/queries";

export default async function CatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getCatalogItem(id);
  if (!item) notFound();
  return (
    <AppShell mode="member">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / {item.categoryName}</p>
          <p className="lede">
            Availability reflects confirmed on-hand condition. Future returns are expected, not
            guaranteed.
          </p>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-visual">
          {item.photo ? (
            <div className="equipment-photo detail-photo">
              <Image
                src={item.photo.src}
                alt={item.photo.alt}
                width={1200}
                height={800}
                sizes="(max-width: 900px) 100vw, 48vw"
                priority
              />
            </div>
          ) : (
            <EquipmentIllustration kind={item.illustration} name={item.name} />
          )}
        </div>
        <article className="detail-content">
          <div className="tag-row">
            {item.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <h1>{item.name}</h1>
          <p className="lede">{item.description}</p>
          <div className="availability-box">
            <StatusBadge tone={item.usableOnHand > 0 ? "success" : "warning"}>
              {item.usableOnHand} {item.availabilityLabel ?? "available now"}
            </StatusBadge>
            <small>
              {item.expectedOn
                ? `Additional stock expected ${item.expectedOn}.`
                : "No pending return is needed to satisfy current stock."}
            </small>
          </div>
          <dl className="spec-list">
            {Object.entries(item.specifications).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="notice">
            <Info size={19} aria-hidden="true" />
            <p>{item.publicRemarks}</p>
          </div>
          {item.repairQuantity ? (
            <div className="notice notice-warning">
              <Wrench size={19} aria-hidden="true" />
              <p>
                {item.repairQuantity} unit remains searchable but cannot be requested while repair
                is required.
              </p>
            </div>
          ) : null}
          {item.expectedOn ? (
            <div className="notice">
              <CalendarClock size={19} aria-hidden="true" />
              <p>Expected dates are planning guidance. Physical return is confirmed separately.</p>
            </div>
          ) : null}
          <RequestForm catalogItemId={item.id} available={item.usableOnHand} />
        </article>
      </div>
    </AppShell>
  );
}
