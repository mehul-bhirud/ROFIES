import { Headphones, Mail, MapPin, Phone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getVisibleContacts } from "@/lib/operations/queries";

export default async function ContactsPage() {
  const contacts = await getVisibleContacts();
  return (
    <AppShell mode="member">
      <div className="page-head">
        <div>
          <p className="eyebrow">Points of contact</p>
          <h1>Find the right person, first time</h1>
          <p>Institutional contact details are shown according to membership visibility.</p>
        </div>
      </div>
      <div className="operation-card-grid">
        {contacts.map((contact) => (
          <article className="operation-card" key={String(contact.id)}>
            <p className="eyebrow">{String(contact.contact_type).replaceAll("_", " ")}</p>
            <h2>{contact.name}</h2>
            <p>{contact.responsibility}</p>
            <footer>
              <span>
                <MapPin size={16} aria-hidden="true" /> {contact.availability}
              </span>
              <a
                className="button button-secondary compact-button"
                href={`mailto:${contact.institutional_email}`}
              >
                <Mail size={16} aria-hidden="true" />
                Email
              </a>
              {contact.phone ? (
                <a className="button button-secondary compact-button" href={`tel:${contact.phone}`}>
                  <Phone size={16} aria-hidden="true" />
                  Call
                </a>
              ) : null}
            </footer>
          </article>
        ))}
      </div>
      <div className="notice">
        <Headphones size={19} aria-hidden="true" />
        <p>
          App support is separate from equipment and club leadership so operational questions reach
          the right owner.
        </p>
      </div>
    </AppShell>
  );
}
