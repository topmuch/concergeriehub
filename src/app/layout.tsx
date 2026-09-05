import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { siteName, siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // metadataBase : résout les URLs relatives (og:image, canonical…)
  // sur TOUTES les routes — propage aux segments enfants.
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — La conciergerie digitale des hôtes`,
    template: `%s | ${siteName}`,
  },
  description: "SaaS B2B pour hôtes Airbnb et gestionnaires de biens : Wi-Fi, guidebook, check-out, upselling et annuaire de prestataires via une seule plaque QR. Sans application.",
  applicationName: siteName,
  keywords: ["Conciergerie Hub", "conciergerie Airbnb", "QR codes", "hôtes", "location courte durée", "guidebook", "check-out", "prestataires", "property management"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteName,
  },
  icons: {
    icon: "/icon-512.png",
    apple: "/icon-512.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}