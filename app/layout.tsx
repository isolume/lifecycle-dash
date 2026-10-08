import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { AppShell } from "@/components/dashboard/app-shell";
import "./globals.css";

const bodyFont = Open_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Southern Company Lifecycle Dashboard",
  description: "Network lifecycle planning and risk visualization dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
