import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/source-sans-3";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/system/service-worker-registration";

export const metadata: Metadata = {
  title: { default: "R.O.F.I.E.S Equipment", template: "%s · R.O.F.I.E.S" },
  description: "Discover, reserve, issue, and return robotics equipment.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/rofies-mark.svg" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#091517" }
  ]
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
