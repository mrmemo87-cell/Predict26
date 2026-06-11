import type { Metadata } from "next";
import "./globals.css";
import AppNavigation from "@/components/navigation/AppNavigation";

const siteUrl = "https://predict26.live";
const siteTitle = "Predict26 — Predict World Cup 2026";
const siteDescription =
  "Predict World Cup 2026 scores, compete with friends, represent your country, and climb the leaderboard.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: "Predict26",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: "Predict26",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Predict26 football prediction game branding",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [
      { url: "/predict26-icon.svg", type: "image/svg+xml" },
      { url: "/icon", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full overflow-x-hidden flex flex-col">
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
