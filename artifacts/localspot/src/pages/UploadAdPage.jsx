import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUploadAd } from "@workspace/api-client-react";

const SIZE_GUIDES = {
  large:  { dim: '4.5" × 3"',  px: "1350 × 900 px", desc: "Prime placement — maximum impact" },
  medium: { dim: '3" × 3"',    px: "900 × 900 px",   desc: "Great visibility — popular choice" },
  small:  { dim: '3" × 1.5"',  px: "900 × 450 px",   desc: "Affordable local reach" },
};

export default function UploadAdPage() {
  const { spotId } = useParams();
  const [, navigate] = useLocation();
  const [designRequested, setDesignRequested] = useState(false);
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const uploadMutation = useUploadAd();

  const handleCloudinaryUpload = () => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      setError("File upload not configured yet. Please check the 'I need design help' option below, or contact us directly.");
      return;
    }

    const widget = window.cloudinary?.createUploadWidget(
      { cloudName, uploadPreset, sources: ["local"], resourceType: "auto", maxFileSize: 20000000, acceptedFiles: ".pdf,.png,.jpg,.jpeg" },
      (err, result) => {
        if (!err && result?.event === "success") {
          setFileUrl(result.info.secure_url);
        }
      }
    );
    widget?.open();
  };

  const handleSubmit = async () => {
    setError(null);
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({
        id: parseInt(spotId),
        data: {
          designRequested,
          adFileUrl: designRequested ? null : fileUrl || null,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px" }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 LocalSpot Mailer</div>
        </div>
        <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", marginBottom: 12 }}>You're All Set!</h1>
          <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
            {designRequested
              ? "Our design team will reach out within 48 hours to create your ad."
              : "Your ad has been submitted. We'll email you once it's been approved."}
          </p>
          <button onClick={() => navigate("/")} style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            Back to Postcard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 LocalSpot Mailer</div>
      </div>

      <div style={{ maxWidth: 560, margin: "48px auto", padding: "0 20px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 8px", fontFamily: "Georgia,serif" }}>Upload Your Ad</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 28 }}>
            Payment confirmed! Now let's get your ad ready for print.
          </p>

          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 12 }}>Ad Size Specifications</div>
            {Object.entries(SIZE_GUIDES).map(([size, guide]) => (
              <div key={size} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e5e7eb", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#111", textTransform: "capitalize" }}>{size}</span>
                <span style={{ color: "#6b7280" }}>{guide.dim} · {guide.px}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
              File format: PDF (preferred), PNG, or JPG · Max 20MB · 300 DPI for print quality
            </div>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ border: "2px dashed #d1d5db", borderRadius: 12, padding: 28, textAlign: "center", marginBottom: 20, background: designRequested ? "#f3f4f6" : "#fff", opacity: designRequested ? 0.5 : 1 }}>
            {fileUrl ? (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700, color: "#15803d", marginBottom: 8 }}>File uploaded!</div>
                <div style={{ fontSize: 12, color: "#6b7280", wordBreak: "break-all", marginBottom: 12 }}>{fileUrl}</div>
                <button onClick={() => setFileUrl("")} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "#374151" }}>
                  Upload different file
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📎</div>
                <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>Upload your ad file</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>PDF, PNG, or JPG · Max 20MB</div>
                <button
                  onClick={handleCloudinaryUpload}
                  disabled={designRequested}
                  style={{ background: designRequested ? "#e5e7eb" : "#991b1b", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 700, cursor: designRequested ? "not-allowed" : "pointer", fontSize: 14 }}>
                  Choose File
                </button>
              </div>
            )}
          </div>

          <div
            onClick={() => { setDesignRequested(!designRequested); setFileUrl(""); }}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 10,
              border: `2px solid ${designRequested ? "#991b1b" : "#e5e7eb"}`,
              background: designRequested ? "#fef2f2" : "#f9fafb",
              cursor: "pointer", marginBottom: 24, transition: "all 0.15s",
            }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4, border: `2px solid ${designRequested ? "#991b1b" : "#d1d5db"}`,
              background: designRequested ? "#991b1b" : "#fff", flexShrink: 0, marginTop: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {designRequested && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>I need you to design my ad for me</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3, lineHeight: 1.5 }}>
                Check this if you don't have a ready-to-print file. Our team will contact you within 48 hours to create your ad.
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={uploading || (!designRequested && !fileUrl)}
            style={{
              width: "100%", padding: 15, borderRadius: 12, border: "none",
              background: (uploading || (!designRequested && !fileUrl)) ? "#d1d5db" : "#991b1b",
              color: "#fff", fontSize: 16, fontWeight: 800,
              cursor: (uploading || (!designRequested && !fileUrl)) ? "not-allowed" : "pointer",
            }}>
            {uploading ? "Submitting..." : "Submit →"}
          </button>
        </div>
      </div>
    </div>
  );
}
