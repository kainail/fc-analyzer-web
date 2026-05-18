import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import "./globals.css";
import Sidebar, { type SidebarRole, type SidebarUser } from "./sidebar";
import Topbar from "./topbar";
import { prisma } from "@/lib/db";
import { initials as toInitials } from "@/lib/format";

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

// Build the display name for the sidebar footer: firstName lastName,
// falling back through username → first email → raw Clerk id. Empty
// strings are dropped so we never render a name like " Smith".
function buildSidebarName(u: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: { emailAddress: string }[];
  id: string;
}): string {
  const first = (u.firstName ?? "").trim();
  const last = (u.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (u.username?.trim()) return u.username.trim();
  const email = u.emailAddresses[0]?.emailAddress;
  return email ?? u.id;
}

// Resolve everything the sidebar needs in one go: role + super-admin
// status (from Postgres) + display name + initials (from Clerk).
// Layout server components run on every page request, so this is
// hot — but it's two Postgres single-row queries on @unique indexes
// plus a Clerk currentUser() call (which is already memoized within
// a request by Clerk's session machinery).
//
// On public pages (sign-in / sign-up) userId is null and we skip the
// DB entirely; the sidebar falls back to "Signed out" + "?".
async function getSidebarContext(): Promise<{
  role: SidebarRole;
  isSuperAdmin: boolean;
  user: SidebarUser | null;
}> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { role: null, isSuperAdmin: false, user: null };
    }
    const [m, sa, clerkUser] = await Promise.all([
      prisma.membership.findFirst({
        where: { userId },
        select: { role: true },
      }),
      prisma.superAdmin.findUnique({
        where: { userId },
        select: { id: true },
      }),
      currentUser(),
    ]);
    const role =
      m?.role === "owner" || m?.role === "manager" || m?.role === "rep"
        ? (m.role as SidebarRole)
        : null;
    const user: SidebarUser | null = clerkUser
      ? {
          name: buildSidebarName({
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            username: clerkUser.username,
            emailAddresses: clerkUser.emailAddresses.map((e) => ({
              emailAddress: e.emailAddress,
            })),
            id: clerkUser.id,
          }),
          initials: "",
        }
      : null;
    if (user) {
      // initials() runs over the resolved name string so initials
      // for "alex@example.com" come from "al" rather than "ae".
      user.initials = toInitials(user.name) || "?";
    }
    return { role, isSuperAdmin: sa !== null, user };
  } catch (err) {
    // Next.js prerenders some routes (e.g. /, /_not-found) statically
    // by default. auth() / currentUser() throw "Dynamic server usage"
    // errors during that pass — they're expected, not bugs, so we
    // swallow them silently. Real DB / Clerk failures get logged.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Dynamic server usage")) {
      console.error("[layout] sidebar context lookup failed:", err);
    }
    return { role: null, isSuperAdmin: false, user: null };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { role, isSuperAdmin, user } = await getSidebarContext();

  return (
    <ClerkProvider>
      <html
        lang="en"
        data-theme="dark"
        className={`${dmSans.variable} ${jetbrainsMono.variable}`}
      >
        <body>
          <div className="app">
            <Sidebar
              role={role}
              isSuperAdmin={isSuperAdmin}
              user={user}
            />
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
