import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Predict26 — Predict World Cup 2026 & Win Real Prizes",
  description:
    "Predict matches of the 2026 FIFA World Cup. Compete with friends, represent your country, climb the leaderboard, and win real cash prizes.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
