import Link from "next/link";
import { Filter, Search, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EquipmentCard } from "@/components/catalog/equipment-card";
import { getCatalog } from "@/lib/catalog/queries";

export default async function CatalogPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; start?: string; end?: string }>;
}) {
  const filters = await searchParams;
  const rangeStart = filters.start ? `${filters.start}T00:00:00+05:30` : "";
  const rangeEnd = filters.end ? `${filters.end}T23:59:59+05:30` : "";
  const items = await getCatalog(filters.q ?? "", rangeStart, rangeEnd);
  const category = filters.category ?? "all";
  const visible = items.filter((item) => category === "all" || item.categoryName === category);
  const categories = [...new Set(items.map((item) => item.categoryName))].sort();
  const available = items.reduce((sum, item) => sum + item.usableOnHand, 0);
  return (
    <AppShell mode="member">
      <section className="catalog-hero" aria-labelledby="catalog-title">
        <div className="catalog-hero-copy">
          <p className="eyebrow">R.O.F.I.E.S equipment bench</p>
          <h1 id="catalog-title">Build with what is actually ready.</h1>
          <p>
            Find robotics equipment, check date-aware availability, and send one accountable request
            to the people who manage the lab.
          </p>
          <div className="hero-actions">
            <a href="#catalog-results" className="button button-primary">
              Browse equipment
            </a>
            <Link href="/requests" className="button button-secondary">
              My borrowing activity
            </Link>
          </div>
        </div>
        <div
          className="hero-instrument"
          aria-label={`${available} usable catalog units currently on hand`}
        >
          <div className="instrument-reading">
            <span>{available}</span>
            <small>
              {rangeStart && rangeEnd ? "units for selected dates" : "usable units on hand"}
            </small>
          </div>
          <div className="instrument-line">LIVE STOCK / LOCAL DEMO</div>
        </div>
      </section>
      <div className="notice" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>
          Signed-in students may browse. Requesting equipment requires an active club membership and
          staff approval.
        </p>
      </div>
      <form className="catalog-tools" role="search" aria-label="Search equipment">
        <div className="search-field">
          <Search size={19} aria-hidden="true" />
          <label className="sr-only" htmlFor="catalog-search">
            Search equipment
          </label>
          <input
            id="catalog-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search name, tag, or specification"
          />
        </div>
        <label className="sr-only" htmlFor="category">
          Category
        </label>
        <select className="select" id="category" name="category" defaultValue={category}>
          <option value="all">All categories</option>
          {categories.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <label className="date-filter">
          <span>From</span>
          <input type="date" name="start" defaultValue={filters.start} />
        </label>
        <label className="date-filter">
          <span>To</span>
          <input type="date" name="end" defaultValue={filters.end} />
        </label>
        <button className="button button-secondary" type="submit">
          <Filter size={18} aria-hidden="true" />
          Apply
        </button>
      </form>
      <section id="catalog-results" aria-labelledby="results-heading">
        <div className="page-head">
          <div>
            <p className="eyebrow">Catalog / {visible.length} matches</p>
            <h2 id="results-heading">Equipment ready for real projects</h2>
          </div>
        </div>
        {visible.length ? (
          <div className="equipment-grid">
            {visible.map((item, index) => (
              <EquipmentCard key={item.id} item={item} eager={index < 3} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <Search size={36} aria-hidden="true" />
              <h2>No equipment matches</h2>
              <p>
                Try a broader name, category, or specification. Archived and non-working items
                remain searchable when staff filters are active.
              </p>
              <Link href="/" className="button button-secondary">
                Clear filters
              </Link>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
