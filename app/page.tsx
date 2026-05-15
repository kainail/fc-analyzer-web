import Link from "next/link";
import { getReps, getGyms } from "@/lib/config";
import UploadForm from "./upload-form";

export default function Page() {
  const reps = getReps();
  const gyms = getGyms();
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">FC Sales — Upload</h1>
        <Link href="/dashboard" className="text-sm underline">
          Dashboard →
        </Link>
      </div>
      <UploadForm reps={reps} gyms={gyms} />
    </main>
  );
}
