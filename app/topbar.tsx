import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import Breadcrumbs from "./breadcrumbs";
import NotificationBell from "./notification-bell";

async function getUnreadCount(): Promise<number> {
  try {
    const { userId } = await auth();
    if (!userId) return 0;
    return await prisma.notification.count({
      where: { userId, read: false },
    });
  } catch (err) {
    // Same silent-fallback pattern as the layout's sidebar context:
    // static prerender raises "Dynamic server usage" here, which is
    // expected, not a bug.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Dynamic server usage")) {
      console.error("[topbar] unread count lookup failed:", err);
    }
    return 0;
  }
}

export default async function Topbar() {
  const unread = await getUnreadCount();

  return (
    <header className="topbar">
      <Breadcrumbs />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <NotificationBell initialUnreadCount={unread} />
        <span className="kbd">⌘K</span>
        <span className="muted" style={{ fontSize: 12 }}>
          quick switch
        </span>
      </div>
    </header>
  );
}
