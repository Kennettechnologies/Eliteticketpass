import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/providers/auth-provider";

export const metadata: Metadata = {
  title: { default: "EliteTicketPass", template: "%s | EliteTicketPass" },
  description: "The ultimate event ticketing platform for Africa.",
  keywords: ["events", "tickets", "Kenya", "ticketing", "concerts", "festivals"],
  themeColor: "#0a0a0a",
  openGraph: {
    type: "website",
    siteName: "EliteTicketPass",
    images: [{ url: "/og-image.png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <AuthProvider>
          {children}
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#1a1a1a",
                border: "1px solid #262626",
                color: "#f9fafb",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
