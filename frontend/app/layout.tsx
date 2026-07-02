import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

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
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AuthProvider>
            {children}
            <Toaster
              toastOptions={{
                style: {
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
