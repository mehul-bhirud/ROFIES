"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Boxes,
  ClipboardCheck,
  Contact,
  Gauge,
  HandCoins,
  Home,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck
} from "lucide-react";
import clsx from "clsx";

const memberLinks = [
  { href: "/", label: "Catalog", icon: Home },
  { href: "/requests", label: "My activity", icon: ClipboardCheck },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/contacts", label: "Contacts", icon: Contact }
];

const staffLinks = [
  { href: "/admin", label: "Operations", icon: Gauge },
  { href: "/admin/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/admin/members", label: "Members", icon: UserRoundCheck },
  { href: "/admin/account-recovery", label: "Recovery", icon: KeyRound },
  { href: "/admin/handover", label: "Handover", icon: HandCoins },
  { href: "/admin/returns", label: "Returns", icon: RotateCcw },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes }
];

export function Navigation({ mode }: { mode: "member" | "staff" }) {
  const pathname = usePathname();
  const links = mode === "staff" ? staffLinks : memberLinks;
  return (
    <nav
      className={clsx("primary-nav", mode === "staff" && "staff-nav")}
      aria-label={`${mode === "staff" ? "Staff" : "Member"} navigation`}
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
            className={clsx(active && "active")}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
