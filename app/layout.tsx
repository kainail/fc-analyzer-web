import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

// Load fonts via Next's font loader rather than @import url(...) in
// globals.css — Tailwind v4's PostCSS pass strips raw external
// @imports when they sit alongside `@import "tailwindcss"`, which
// caused fonts to silently disappear and (when Turbopack's dev cache
// got into a bad state) the whole stylesheet to fall back to the
// previous file. Loading via next/font also avoids the FOUT flash
// and gives us deterministic --font-sans / --font-mono variables
// that globals.css reads.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FC Analyzer",
  description: "FC Sales consultation analyzer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="app">
          <Sidebar />
          <div className="main main-ambient">
            <Topbar />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
