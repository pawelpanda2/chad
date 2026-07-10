import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Browser",
  description: "Next.js frontend for Content Provider file browser",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
