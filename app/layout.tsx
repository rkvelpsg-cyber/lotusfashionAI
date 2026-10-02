import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lotus Fashion AI Virtual Try-On",
  description: "Fashion AI Virtual Try-On by Lotus Prime Digital Solutions",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
