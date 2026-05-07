import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threes",
  description: "A three-way chat for two humans and an AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
