import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { Sidebar } from "@/components/Sidebar";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Intel",
  description: "Personal US stock intelligence dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-[#080b14] text-[#e8eaf0]">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,229,255,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(0,229,255,0.08),_transparent_22%)]" />
          <div className="relative flex min-h-screen">
            <Sidebar />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
