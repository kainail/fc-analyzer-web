import UploadForm from "./upload-form";

export default function Page() {
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
      <UploadForm />
    </div>
  );
}
