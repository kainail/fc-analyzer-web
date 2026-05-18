import { Settings as SettingsIcon } from "@/lib/icons";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <div className="sub">
            Account and gym preferences.
          </div>
        </div>
      </div>

      <div
        className="card card-pad-lg"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--primary-50)",
            color: "var(--primary)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <SettingsIcon size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Settings coming soon
          </div>
          <div
            className="muted"
            style={{ fontSize: 13, marginTop: 2, lineHeight: 1.5 }}
          >
            Profile, billing, gym preferences, and integrations will live
            here. Until then, your sign-in / password lives in Clerk —
            click your name in the sidebar footer to sign out.
          </div>
        </div>
      </div>
    </div>
  );
}
