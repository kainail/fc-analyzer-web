import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import ProfileForm from "./profile-form";
import PasswordForm from "./password-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const firstName = (user.firstName ?? "").trim();
  const lastName = (user.lastName ?? "").trim();
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";

  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <div className="sub">
            Update your name and password. Email is managed in Clerk.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <ProfileForm
          initialFirstName={firstName}
          initialLastName={lastName}
          email={email}
        />
        <PasswordForm />
      </div>
    </div>
  );
}
