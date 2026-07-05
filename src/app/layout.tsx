import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { Sidebar } from "@/components/Sidebar";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Intel",
  description: "Personal US stock intelligence dashboard",
  icons: {
    icon: "/egret-dark.svg",
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
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable}`}
      >
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-5 py-6 lg:px-10 lg:py-8">
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
