import { getReps, getGyms } from "@/lib/config";
import UploadForm from "./upload-form";

export default function Page() {
  const reps = getReps();
  const gyms = getGyms();
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h2>New consultation</h2>
          <div className="sub">
            Upload an audio recording for transcription, analysis, and coaching.
          </div>
        </div>
      </div>
      <UploadForm reps={reps} gyms={gyms} />
    </div>
  );
}
