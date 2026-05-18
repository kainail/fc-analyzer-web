import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";
import Sidebar, { type SidebarRole } from "./sidebar";
import Topbar from "./topbar";
import { prisma } from "@/lib/db";

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

// Resolve the caller's role + super-admin status for the sidebar.
// Layout server components run on every page request, so this adds
// two small queries to every render — both single-row, both keyed by
// @unique indexes (Membership(userId, orgId), SuperAdmin.userId).
// On the public pages (sign-in / sign-up / onboarding) userId is null
// and we skip the DB entirely.
async function getSidebarContext(): Promise<{
  role: SidebarRole;
  isSuperAdmin: boolean;
}> {
  try {
    const { userId } = await auth();
    if (!userId) return { role: null, isSuperAdmin: false };
    const [m, sa] = await Promise.all([
      prisma.membership.findFirst({
        where: { userId },
        select: { role: true },
      }),
      prisma.superAdmin.findUnique({
        where: { userId },
        select: { id: true },
      }),
    ]);
    const role =
      m?.role === "owner" || m?.role === "manager" || m?.role === "rep"
        ? (m.role as SidebarRole)
        : null;
    return { role, isSuperAdmin: sa !== null };
  } catch (err) {
    // Don't fail the whole layout if the DB hiccups — fall back to
    // the minimum-permission sidebar.
    console.error("[layout] sidebar context lookup failed:", err);
    return { role: null, isSuperAdmin: false };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { role, isSuperAdmin } = await getSidebarContext();

  return (
    <ClerkProvider>
      <html
        lang="en"
        data-theme="dark"
        className={`${dmSans.variable} ${jetbrainsMono.variable}`}
      >
        <body>
          <div className="app">
            <Sidebar role={role} isSuperAdmin={isSuperAdmin} />
            <div className="main main-ambient">
              <Topbar />
              {children}
            </div>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
