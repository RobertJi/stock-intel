import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, IBM_Plex_Mono } from "next/font/google";

import { Sidebar } from "@/components/Sidebar";

import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Intel",
  description: "Personal US stock intelligence dashboard",
  icons: {
    icon: "/egret-light.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSerif.variable} ${ibmPlexMono.variable} ${dmSans.variable}`}
      >
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <main className="min-w-0 flex-1 px-6 py-6 lg:px-12 lg:py-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
