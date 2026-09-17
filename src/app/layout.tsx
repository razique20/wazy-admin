import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { WazyDataProvider } from "@/components/providers/data-provider";

export const metadata: Metadata = {
  title: "Wazy Admin Console",
  description: "Document expiry tracking & financial intelligence for the Wazy platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <WazyDataProvider>{children}</WazyDataProvider>
      </body>
    </html>
  );
}
