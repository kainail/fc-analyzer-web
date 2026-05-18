import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/super-admin";
import { ArrowL } from "@/lib/icons";
import InviteForm from "./invite-form";

export const dynamic = "force-dynamic";

export default async function AdminInvitePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await isSuperAdmin(userId))) redirect("/dashboard");

  return (
    <div className="content narrow">
      <div style={{ marginBottom: 14 }}>
        <Link
          href="/admin"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: -8 }}
        >
          <ArrowL size={13} /> Admin
        </Link>
      </div>
      <InviteForm />
    </div>
  );
}
