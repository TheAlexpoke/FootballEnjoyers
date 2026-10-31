import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./championship.css";
export const metadata: Metadata = {
  title: "Football Enjoyers · Draft Order Tournament",
  description: "Seven competitors. Nine events. Every point earns your pick.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101012",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
