import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "EliteTicketPass Gate Scanner",
  description: "Scan QR codes at the entrance",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TB Gate" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CheckInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
