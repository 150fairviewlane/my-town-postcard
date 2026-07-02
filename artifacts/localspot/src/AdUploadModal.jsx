import { useState, useRef } from "react";
import { AD_SIZES } from "./AdGenerator";
import IndustryConflictDialog from "./components/IndustryConflictDialog";
import { useEmailSuggestion, EmailSuggestionHint } from "./hooks/useEmailSuggestion.jsx";

const CATEGORY_INDUSTRIES = {
  'Food & Dining':          ['Pizza Restaurant','Mexican Restaurant','Chinese Restaurant','Breakfast & Cafe','Bar & Grill','Italian Restaurant','Bakery','Coffee Shop','BBQ Restaurant','Sub & Sandwich Shop','Ice Cream & Dessert Shop','Food Truck & Catering'],
  'Home Services':          ['HVAC','Plumber','Electrician','Lawn & Landscaping','Roofing','Painting','Cleaning Service','Pest Control'],
  'Auto Services':          ['Auto Repair','Tire Shop','Oil Change & Quick Lube','Car Wash & Detailing','Auto Body Shop','Window Tinting'],
  'Health & Wellness':      ['Dentist','Medical & Healthcare','Chiropractor','Gym & Fitness'],
  'Beauty & Personal Care': ['Salon & Beauty','Barbershop'],
  'Pet Services':           ['Veterinarian','Pet Services'],
  'Retail':                 ['Retail Shop','Liquor Store','Vape & Smoke Shop','Cell Phone Sales & Repair','Toy Store','Jewelry Store','Furniture Store','Pawn Shop','Thrift & Consignment','Florist','Garden Center & Nursery','Sporting Goods','Bike Shop','Gift Shop','Bookstore','Hardware Store'],
  'Professional Services':  ['Real Estate','Insurance','Financial Services','Other Service','Law Firm','Accounting & Tax Prep','Mortgage Broker'],
  'Childcare & Education':  ['Daycare','Tutoring Services','Dance & Music Lessons','Martial Arts Studio','Driving School'],
  'Entertainment/Events':   ['Photography','Event Venue','Party & Equipment Rental','DJ & Entertainment Services'],
};

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 7,
  border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
  fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "#fff",
};

async function uploadToCloudinary(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) return null;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", uploadPreset);
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: fd });
  const data = await resp.json();
  return data.secure_url || null;
}

export default function AdUploadModal({ initialSize = "L", onComplete, onBack, isReserving = false, reserveError = null, takenCategories = [] }) {
  const sizeInfo = AD_SIZES[initialSize] || AD_SIZES["L"];
  const previewDims = { XL: { w: 320, h: 400 }, L: { w: 240, h: 320 }, M: { w: 300, h: 200 }, S: { w: 200, h: 200 } };
  const { w: pw, h: ph } = previewDims[initialSize] || { w: 320, h: 400 };

  const [form, setForm] = useState({ businessName: "", category: "", industry: "", email: "", phone: "", website: "" });
  const { suggestion: emailSuggestion, check: checkEmailTypo, dismiss: dismissEmailSuggestion, clear: clearEmailSuggestion } = useEmailSuggestion();
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [industryError, setIndustryError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [conflictIndustry, setConflictIndustry] = useState(null);
  const [adError, setAdError] = useState(false);

  const fileRef = useRef();
  const nameRef = useRef();
  const industryRef = useRef();
  const emailRef = useRef();

  const categoryIndustries = form.category ? (CATEGORY_INDUSTRIES[form.category] || []) : [];

  const handleCategoryChange = (e) => {
    const cat = e.target.value;
    setForm(d => ({ ...d, category: cat, industry: "" }));
    if (industryError) setIndustryError(false);
  };

  const handleIndustryChange = (e) => {
    const val = e.target.value;
    if (val && takenCategories.includes(val)) {
      setConflictIndustry(val);
      e.target.value = form.industry;
      return;
    }
    setForm(d => ({ ...d, industry: val }));
    if (val) setIndustryError(false);
  };

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    e.target.value = "";
    setAdError(false);
    setUploadError(false);
    setCloudinaryUrl(null);

    const reader = new FileReader();
    reader.onload = ev => setLocalPreviewUrl(ev.target.result);
    reader.readAsDataURL(f);

    setUploading(true);
    try {
      const url = await uploadToCloudinary(f);
      setCloudinaryUrl(url);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (form.email && !emailSuggestion) checkEmailTypo(form.email);
    let err = false;
    if (!form.businessName.trim()) {
      setNameError(true);
      if (!err) { nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); nameRef.current?.focus(); }
      err = true;
    }
    if (!form.industry) {
      setIndustryError(true);
      if (!err) { industryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); industryRef.current?.focus(); }
      err = true;
    }
    if (!form.email.trim()) {
      setEmailError(true);
      if (!err) { emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); emailRef.current?.focus(); }
      err = true;
    }
    if (!localPreviewUrl) {
      setAdError(true);
      err = true;
    }
    if (err) return;

    const finalAdUrl = cloudinaryUrl || localPreviewUrl;

    onComplete?.({
      sizeKey: initialSize,
      price: sizeInfo.price,
      template: "upload",
      finishedAdUrl: finalAdUrl,
      businessName: form.businessName,
      email: form.email,
      phone: form.phone,
      website: form.website,
      industry: form.industry,
      tagline: "",
      offer: "",
      offerFine: "",
      address: "",
      logo: null,
      photo: null,
      menuItems: [],
      fontSizes: {},
      fieldWidths: {},
    });
  };

  const hasAd = !!localPreviewUrl;
  const busy = isReserving || uploading;

  return (
    <>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.45)" }}>

        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: 0, flexShrink: 0 }}>
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>Upload Your Finished Ad</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>
              {sizeInfo.label} · {AD_SIZES[initialSize].width}" × {AD_SIZES[initialSize].height}" · ${sizeInfo.price}
            </div>
          </div>
          <div style={{ background: "#991b1b", color: "#fff", borderRadius: 99, padding: "5px 16px", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
            ${sizeInfo.price}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* LEFT — contact info */}
          <div style={{ width: 320, padding: "20px 24px", overflowY: "auto", borderRight: "1px solid #e5e7eb", flexShrink: 0 }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
              Your ad will be printed <strong>exactly as uploaded</strong> — no changes will be made.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: nameError ? "#dc2626" : "#374151", display: "block", marginBottom: 3 }}>
                  Business Name *
                  {nameError && <span style={{ fontWeight: 400, marginLeft: 6, color: "#dc2626" }}>Required</span>}
                </label>
                <input
                  ref={nameRef}
                  value={form.businessName}
                  onChange={e => { setForm(d => ({ ...d, businessName: e.target.value })); if (e.target.value.trim()) setNameError(false); }}
                  placeholder="e.g. Joe's Pizza"
                  style={{ ...inputStyle, borderColor: nameError ? "#dc2626" : undefined, background: nameError ? "#fef2f2" : undefined, outline: nameError ? "2px solid #fca5a5" : undefined }}
                />
              </div>

              {/* Category → Industry cascade */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: industryError ? "#dc2626" : "#374151", display: "block", marginBottom: 3 }}>
                  Business Type *
                  {industryError && <span style={{ fontWeight: 400, marginLeft: 6, color: "#dc2626" }}>Select an industry</span>}
                </label>
                <select
                  value={form.category}
                  onChange={handleCategoryChange}
                  style={{ ...inputStyle, marginBottom: 6, color: form.category ? "#111" : "#9ca3af" }}
                >
                  <option value="">— Select Category —</option>
                  {Object.keys(CATEGORY_INDUSTRIES).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  ref={industryRef}
                  value={form.industry}
                  onChange={handleIndustryChange}
                  disabled={!form.category}
                  style={{
                    ...inputStyle,
                    borderColor: industryError ? "#dc2626" : undefined,
                    background: industryError ? "#fef2f2" : (!form.category ? "#f9fafb" : "#fff"),
                    outline: industryError ? "2px solid #fca5a5" : undefined,
                    color: form.industry ? "#111" : "#9ca3af",
                    cursor: !form.category ? "not-allowed" : "pointer",
                  }}
                >
                  <option value="">{form.category ? "— Select Industry —" : "— Select Category First —"}</option>
                  {categoryIndustries.map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: emailError ? "#dc2626" : "#374151", display: "block", marginBottom: 3 }}>
                  Email Address *
                  {emailError && <span style={{ fontWeight: 400, marginLeft: 6, color: "#dc2626" }}>Required</span>}
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  value={form.email}
                  onChange={e => { setForm(d => ({ ...d, email: e.target.value })); if (e.target.value.trim()) setEmailError(false); clearEmailSuggestion(); }}
                  onBlur={e => checkEmailTypo(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  style={{ ...inputStyle, borderColor: emailError ? "#dc2626" : undefined, background: emailError ? "#fef2f2" : undefined, outline: emailError ? "2px solid #fca5a5" : undefined }}
                />
                <EmailSuggestionHint
                  suggestion={emailSuggestion}
                  onAccept={v => { setForm(d => ({ ...d, email: v })); dismissEmailSuggestion(); }}
                  onDismiss={dismissEmailSuggestion}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                  Phone Number <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                </label>
                <input
                  value={form.phone}
                  onChange={e => setForm(d => ({ ...d, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                  Website <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                </label>
                <input
                  value={form.website}
                  onChange={e => setForm(d => ({ ...d, website: e.target.value }))}
                  placeholder="www.yourbusiness.com"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* RIGHT — upload + preview */}
          <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", background: "linear-gradient(135deg, #1e293b, #0f172a)" }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Your Ad — {sizeInfo.label}
            </div>

            {hasAd ? (
              <>
                <div style={{ position: "relative", width: pw, height: ph, borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 48px rgba(0,0,0,0.6)", flexShrink: 0, background: "#000" }}>
                  <img src={localPreviewUrl} alt="Your finished ad" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {uploading && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                      <div style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>Uploading…</div>
                    </div>
                  )}
                  {uploadError && !uploading && (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(220,38,38,0.88)", padding: "6px 10px", fontSize: 11, color: "#fff", textAlign: "center" }}>
                      Cloud upload failed — your ad will still be submitted
                    </div>
                  )}
                </div>
                <div style={{ color: uploading ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 8, textAlign: "center" }}>
                  {uploading
                    ? "Uploading your ad…"
                    : `${sizeInfo.label} · ${AD_SIZES[initialSize].width}" × ${AD_SIZES[initialSize].height}" — printed exactly as shown`}
                </div>
                <button
                  onClick={() => { setLocalPreviewUrl(null); setCloudinaryUrl(null); setAdError(false); setUploadError(false); }}
                  style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
                  Upload a different image
                </button>
              </>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  width: pw, height: ph, borderRadius: 8, flexShrink: 0,
                  border: `2px dashed ${adError ? "rgba(252,165,165,0.85)" : "rgba(255,255,255,0.22)"}`,
                  background: adError ? "rgba(254,242,242,0.06)" : "rgba(255,255,255,0.04)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", gap: 10,
                }}
              >
                <span style={{ fontSize: 40, lineHeight: 1 }}>📎</span>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: adError ? "#fca5a5" : "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                    {adError ? "Please upload your ad to continue" : "Click to upload your finished ad"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                    PNG or JPG · {AD_SIZES[initialSize].width}" × {AD_SIZES[initialSize].height}" print size
                  </div>
                </div>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />

            {reserveError && (
              <div style={{ marginTop: 16, width: "100%", maxWidth: pw, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 16px", color: "#991b1b", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                {reserveError}
              </div>
            )}

            <button
              disabled={busy}
              onClick={handleSubmit}
              style={{
                marginTop: 16, padding: "14px 0", width: "100%", maxWidth: pw,
                background: busy ? "#6b7280" : "#991b1b",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 15,
                fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", letterSpacing: 0.5,
                opacity: busy ? 0.75 : 1,
              }}>
              {uploading
                ? "Uploading your ad…"
                : isReserving
                  ? "Reserving your spot…"
                  : `Proceed to Payment — $${sizeInfo.price}`}
            </button>
          </div>
        </div>
      </div>
    </div>

    {conflictIndustry && (
      <IndustryConflictDialog
        industry={conflictIndustry}
        businessName={form.businessName}
        onChooseDifferent={() => { setConflictIndustry(null); setForm(d => ({ ...d, industry: "" })); }}
        onDismiss={() => setConflictIndustry(null)}
      />
    )}
    </>
  );
}
