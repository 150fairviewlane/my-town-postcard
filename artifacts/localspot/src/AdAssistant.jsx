import { useState, useRef, useEffect, useCallback } from "react";
import { INDUSTRIES, INDUSTRY_LIST } from "./industryAssets";

// ─────────────────────────────────────────────────────────────────────────────
// AD ASSISTANT — AI-powered ad design consultant with auto-fill
//
// When a user mentions their business name, phone, tagline, offer etc. in
// chat, the AI extracts those values and auto-populates the form fields
// instantly — no clicking Apply needed.
//
// Props:
//   formData  — current AdGenerator form state (read)
//   onUpdate  — callback(fieldName, value) to update form fields
//   sizeKey   — current ad size (XL/L/M/S)
// ─────────────────────────────────────────────────────────────────────────────

// Valid industry names for matching
const INDUSTRY_NAMES = Object.keys(INDUSTRIES);

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(formData, sizeKey) {
  const ind = INDUSTRIES[formData.industry] || {};
  const sizeName = {
    XL: 'Extra Large (4×5")', L: 'Large (4×3")',
    M: 'Medium (3×2")', S: 'Small (3×1.5")',
  }[sizeKey] || sizeKey;

  return `You are an expert print advertising consultant helping a local business owner design their ad for the Clarkesville Community Mailer — a 9×12 co-op postcard reaching 5,000 homes in Habersham County, Georgia.

CURRENT AD STATE:
- Business Name: ${formData.businessName || "not entered yet"}
- Industry: ${formData.industry || "not selected yet"}
- Ad Size: ${sizeName}
- Tagline: ${formData.tagline || "empty"}
- Offer/Coupon: ${formData.offer || "empty"}
- Offer Fine Print: ${formData.offerFine || "empty"}
- Phone: ${formData.phone || "empty"}
- Address: ${formData.address || "empty"}
- Hours: ${formData.hours || "empty"}
- Website: ${formData.website || "none"}

INDUSTRY CONTEXT:
${formData.industry ? `Suggested taglines: ${(ind.taglines || []).join(" | ")} Typical services: ${(ind.menu || []).join(", ")}` : "No industry selected yet."}

AVAILABLE INDUSTRIES (exact names only):
${INDUSTRY_NAMES.join(", ")}

AD SIZE GUIDANCE:
- Extra Large: Hero spot — bold headline, 3-4 bullets, large offer, phone prominent
- Large: Premium — strong headline, 2-3 bullets, clear offer, all contact info
- Medium: Punchy headline, 1-2 highlights, offer, phone + address
- Small: Business name, ONE offer, phone only

YOUR JOB:
1. Have a natural conversation and help them build a great ad
2. When the user tells you information about their business (name, phone, tagline, offer, address, website, industry), EXTRACT it and include it in the FIELDS block at the end of your response
3. Auto-fill fields silently — don't say "I've updated your tagline", just do it and move on

RESPONSE FORMAT — ALWAYS end your response with this exact block (even if no fields to update, include empty block):
FIELDS:{"businessName":"","industry":"","tagline":"","offer":"","offerFine":"","phone":"","address":"","hours":"","website":""}

Rules for the FIELDS block:
- Only include fields that have NEW confirmed information the user actually provided in their message
- Leave fields as empty string "" if the user did not provide that information yet
- For industry, use ONLY one of the exact industry names from the AVAILABLE INDUSTRIES list above, or leave empty
- Phone: keep digits and formatting as given
- NEVER put a question into a field — if you are asking the user for their tagline, leave tagline as empty string ""
- NEVER put placeholder text, example text, or suggestions into fields — only real values the user confirmed
- NEVER put your own generated taglines or offers into fields unless the user explicitly said "use that one" or "yes"
- If you suggest 3 tagline options and the user has not chosen one yet, leave tagline as empty string ""
- NEVER include commentary, reasoning, or explanatory text inside a field value. Field values are printed VERBATIM on a physical postcard, so they must contain ONLY the literal text the user wants on their ad.
  - BAD:  "offer":"$10 OFF — high perceived value"
  - BAD:  "offer":"Family Special $34.99 (higher ticket)"
  - GOOD: "offer":"$10 OFF"
  - GOOD: "offer":"Family Special $34.99"
- The FIELDS block must be valid JSON on one line

PERSONALITY:
- Direct and specific — write actual copy, not just advice
- Keep conversational responses SHORT (2-4 sentences)
- Local-focused — reference Clarkesville and local homeowners naturally
- Friendly and encouraging
- When presenting multiple options, ALWAYS format them as a simple numbered list like this:
  1. Option text here
  2. Option text here
  3. Option text here
  Never use bold markdown, never use headers, never use bullet points for options. The numbered format is required so the tap-to-choose buttons work correctly.
- CRITICAL: Each numbered option must contain ONLY the literal text the user would put on their ad — NO em-dash explanations, NO parenthetical commentary, NO reasoning afterwards. The user taps the option to apply it directly to their ad, so any commentary you append will be printed on the physical postcard.
  - BAD:  "2. Family Special $34.99 — higher ticket, bigger perceived value"
  - BAD:  "1. Hand-Tossed Pizza (classic feel-good tagline)"
  - GOOD: "2. Family Special $34.99"
  - GOOD: "1. Hand-Tossed. Oven Fresh."
  If you want to explain why an option works, put that explanation in conversational sentences BEFORE or AFTER the numbered list, never on the same line as the option.

IMPORTANT: The FIELDS block must appear at the very end of every response, on its own line, with no text after it. The FIELDS block will be automatically stripped before displaying your response to the user, so never reference it in your conversational text.`;
}

// ─── Sanitize AI-originated text before it lands in a form field ────────────
// AI replies sometimes include rationale appended to the value, which would
// then get printed verbatim on a physical postcard. Strip the most common
// commentary patterns. Conservative on purpose so legitimate text stays:
//   keep:   "$10–$20 off"               (no spaces around dash)
//   keep:   "Buy-1-Get-1 Free"          (hyphens inside word)
//   keep:   "Family Special (2 Large)"  (trailing parens, no rationale words)
//   keep:   "Special (limit 1)"         (trailing parens, no rationale words)
//   strip:  "$10 OFF — high perceived value"
//   strip:  "Hand-Tossed -- classic feel-good vibe"
//   strip:  "Family Special $34.99 (higher ticket, bigger perceived value)"
const COMMENTARY_KEYWORDS = "higher|value|works|easy|perceived|ticket|best|appeals|appealing|feel|vibe|premium|classic|tested|effective|proven|memorable|stronger|attractive|tagline|approach|reasoning|because|simple|execute|version|option";
const TRAILING_DASH_RE = /\s+(?:[—–]|--)\s+.*$/;
const TRAILING_PAREN_COMMENTARY_RE = new RegExp(
  `\\s+\\([^)]*\\b(?:${COMMENTARY_KEYWORDS})\\b[^)]*\\)\\s*$`,
  "i",
);

function sanitizeAdValue(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(TRAILING_DASH_RE, "")
    .replace(TRAILING_PAREN_COMMENTARY_RE, "")
    .trim();
}

// ─── Extract and apply field updates from AI response ────────────────────────
function extractFieldUpdates(text) {
  try {
    const match = text.match(/FIELDS:\s*({[^}]+})/);
    if (!match) return {};
    const raw = JSON.parse(match[1]);
    const updates = {};
    Object.entries(raw).forEach(([k, v]) => {
      const cleaned = sanitizeAdValue(v);
      if (cleaned) updates[k] = cleaned;
    });
    return updates;
  } catch {
    return {};
  }
}

// ─── Strip the FIELDS block from display text ─────────────────────────────────
// Uses [^}]* (not +) so it matches empty objects like FIELDS:{} as well as
// FIELDS:{...content...}. Strips trailing block (with or without leading
// newline) and any inline occurrence anywhere in the text.
function stripFields(text) {
  return text
    .replace(/\n?FIELDS:\s*{[^}]*}\s*$/m, "")
    .replace(/FIELDS:\s*{[^}]*}/g, "")
    .trim();
}

// ─── Parse numbered options from AI response ─────────────────────────────────
// Returns array of { number, field, value, shortLabel }
function parseSuggestions(text, formData) {
  const cleaned = stripFields(text);
  const suggestions = [];

  // Match patterns like: "1. Something" "1) Something" "**1.** Something"
  const matches = [...cleaned.matchAll(/(?:^|\n)\s*\*{0,2}(\d+)[.)]?\*{0,2}\s+\*{0,2}["']?([^"'\n*]{8,80})["']?\*{0,2}/gm)];

  matches.slice(0, 4).forEach(m => {
    const num = parseInt(m[1]);
    const val = sanitizeAdValue(
      m[2].trim()
        .replace(/^(tagline:|offer:|option \d+:)\s*/i, "")
        .replace(/\*+/g, "")
    );

    if (!val || val.length < 6) return;

    // Guess which field this is for based on context
    const lowerText = cleaned.toLowerCase();
    const lowerVal = val.toLowerCase();
    let field = "tagline"; // default
    if (lowerText.includes("offer") || lowerText.includes("coupon") || lowerText.includes("deal") ||
        lowerVal.includes("off") || lowerVal.includes("free") || lowerVal.includes("%")) {
      field = "offer";
    }

    suggestions.push({ number: num, field, value: val });
  });

  return suggestions;
}

// ─── Auto-filled field flash notification ─────────────────────────────────────
function FieldFlash({ fields }) {
  if (!fields || Object.keys(fields).length === 0) return null;
  const labels = {
    businessName: "Business Name", industry: "Industry", tagline: "Tagline",
    offer: "Offer", offerFine: "Fine Print", phone: "Phone",
    address: "Address", website: "Website",
  };
  const filled = Object.keys(fields).filter(k => fields[k]);
  if (filled.length === 0) return null;
  return (
    <div style={{
      background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
      padding: "6px 10px", fontSize: 11, color: "#166534",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span>✓</span>
      <span>Auto-filled: <strong>{filled.map(k => labels[k] || k).join(", ")}</strong></span>
    </div>
  );
}

// ─── Single message component ─────────────────────────────────────────────────
function Message({ msg, onApply, formData }) {
  const displayText = stripFields(msg.content);
  const suggestions = msg.role === "assistant" ? parseSuggestions(displayText, formData) : [];

  return (
    <div style={{
      display: "flex", gap: 8,
      flexDirection: msg.role === "user" ? "row-reverse" : "row",
      alignItems: "flex-start",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: msg.role === "assistant" ? "#991b1b" : "#e5e7eb",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, marginTop: 2,
      }}>
        {msg.role === "assistant" ? "✦" : "👤"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: msg.role === "assistant" ? "#fff" : "#991b1b",
          color: msg.role === "assistant" ? "#111" : "#fff",
          borderRadius: msg.role === "assistant" ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
          padding: "10px 14px", fontSize: 13, lineHeight: 1.55,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: msg.role === "assistant" ? "1px solid #f0f0f0" : "none",
          whiteSpace: "pre-wrap",
        }}>
          {displayText}
        </div>

        {/* Auto-fill notification */}
        {msg.autoFilled && Object.keys(msg.autoFilled).length > 0 && (
          <div style={{ marginTop: 5 }}>
            <FieldFlash fields={msg.autoFilled} />
          </div>
        )}

        {/* Numbered choice buttons — prominent, easy to tap */}
        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Tap to choose:
            </div>
            {suggestions.map((s) => (
              <button key={s.number} onClick={() => onApply(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#fff", border: "1.5px solid #e5e7eb",
                  borderRadius: 10, padding: "9px 12px",
                  cursor: "pointer", fontFamily: "sans-serif",
                  textAlign: "left", width: "100%",
                  transition: "all 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#991b1b";
                  e.currentTarget.style.background = "#fef2f2";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.background = "#fff";
                }}
              >
                {/* Number badge */}
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "#991b1b", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, flexShrink: 0,
                }}>
                  {s.number}
                </div>
                {/* Option text */}
                <div style={{ flex: 1, fontSize: 12, color: "#111", fontWeight: 600, lineHeight: 1.3 }}>
                  {s.value}
                </div>
                {/* Apply hint */}
                <div style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>tap →</div>
              </button>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, textAlign: msg.role === "user" ? "right" : "left" }}>
          {msg.time}
        </div>
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#991b1b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✦</div>
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: "4px 16px 16px 16px", padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "flex", gap: 4, alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#991b1b", animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s`, opacity: 0.7 }} />
        ))}
        <style>{`@keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:.7} 30%{transform:translateY(-5px);opacity:1} }`}</style>
      </div>
    </div>
  );
}

function chipStyle(bg, color) {
  return { background: bg, border: "none", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color, fontFamily: "sans-serif" };
}
function now() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdAssistant({ formData, onUpdate, sizeKey = "L" }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hi! I'm your ad consultant. Tell me about your business — what's the name and what do you do? I'll start filling out your ad as we chat.",
    time: now(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Watch for industry changes from the form dropdown and acknowledge
  const prevIndustry = useRef(formData.industry);
  useEffect(() => {
    if (formData.industry && formData.industry !== prevIndustry.current) {
      prevIndustry.current = formData.industry;
      const ind = INDUSTRIES[formData.industry];
      if (ind) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `${formData.industry} — great! Here's a tagline that works well for this industry: "${ind.taglines[0]}". Want me to write 3 options tailored to your business?`,
          time: now(),
        }]);
      }
    }
  }, [formData.industry]);

  const handleApply = useCallback((suggestion) => {
    onUpdate(suggestion.field, suggestion.value);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: `✓ Applied to your ${suggestion.field}: "${suggestion.value}"\n\nYou can see it updating in the preview. Want to tweak it or move on?`,
      autoFilled: { [suggestion.field]: suggestion.value },
      time: now(),
    }]);
  }, [onUpdate]);

  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput("");

    // ── Number shortcut — if user types 1, 2, 3, 4 and last message had options
    if (/^[1-4]$/.test(userText)) {
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant");
      if (lastAssistantMsg) {
        const opts = parseSuggestions(stripFields(lastAssistantMsg.content), formData);
        const chosen = opts.find(o => o.number === parseInt(userText));
        if (chosen) {
          handleApply(chosen);
          return;
        }
      }
    }

    const userMsg = { role: "user", content: userText, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Anthropic requires: messages start with a user role and alternate user/assistant.
    // Our UI inserts non-user-initiated assistant messages (intro greeting, industry
    // change nudge), so we must (a) drop leading assistants and (b) collapse any
    // consecutive same-role messages into one. We also strip the FIELDS:{...} control
    // block from assistant turns so the model isn't re-fed its own metadata trailers.
    const allMsgs = [...messages, userMsg];
    const firstUserIdx = allMsgs.findIndex(m => m.role === "user");
    const trimmed = firstUserIdx >= 0 ? allMsgs.slice(firstUserIdx) : [];
    const history = [];
    for (const m of trimmed) {
      const cleanContent = m.role === "assistant" ? stripFields(m.content) : m.content;
      if (!cleanContent.trim()) continue;
      const prev = history[history.length - 1];
      if (prev && prev.role === m.role) {
        prev.content = `${prev.content}\n\n${cleanContent}`;
      } else {
        history.push({ role: m.role, content: cleanContent });
      }
    }

    try {
      // Use BASE_URL prefix so the request is routed correctly through the
      // artifact path proxy (matches the LandingPage `/api/leads` pattern).
      // Root-relative `/api/...` can escape the artifact's path prefix.
      const response = await fetch(`${import.meta.env.BASE_URL}api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: buildSystemPrompt(formData, sizeKey),
          messages: history,
        }),
      });

      const data = await response.json().catch(() => ({}));
      // Error shape can be Anthropic's `{error: {type, message}}` or our proxy's
      // `{error: "Failed to reach AI service"}` (plain string), so normalize both.
      if (!response.ok || data.error) {
        const errMsg =
          (data.error && typeof data.error === "object" && data.error.message) ||
          (typeof data.error === "string" && data.error) ||
          `Request failed (${response.status})`;
        throw new Error(errMsg);
      }
      if (!data.content) throw new Error("Empty response from AI service");

      const raw = data.content?.[0]?.text || "Sorry, I didn't get a response. Please try again.";

      const fieldUpdates = extractFieldUpdates(raw);
      Object.entries(fieldUpdates).forEach(([field, value]) => {
        onUpdate(field, value);
      });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: raw,
        autoFilled: fieldUpdates,
        time: now(),
      }]);

    } catch (err) {
      console.error("AdAssistant error:", err);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I ran into a connection issue. Please try again.${err?.message ? `\n\n(${err.message})` : ""}`,
        time: now(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, formData, sizeKey, onUpdate, handleApply]);

  const hasContent = formData.businessName || formData.industry;

  const QUICK_ACTIONS = [
    { label: "✍️ Write my tagline", prompt: "Write me 3 tagline options." },
    { label: "🎁 Suggest an offer", prompt: "What's a great coupon offer for my business?" },
    { label: "💡 What's missing?", prompt: "What am I missing from my ad?" },
    { label: "✓ Final review", prompt: "Give my ad a score out of 10 and tell me what to improve." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", background: "#991b1b", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: "2px solid rgba(255,255,255,0.4)" }}>✦</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>Ad Assistant</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>Type your info — I'll fill your form automatically</div>
        </div>
        <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "3px 10px", color: "#fff", fontSize: 10, fontWeight: 700 }}>● LIVE</div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} onApply={handleApply} formData={formData} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Contextual nudge chips */}
      <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {!hasContent && QUICK_ACTIONS.slice(0, 2).map(a => (
            <button key={a.label} onClick={() => sendMessage(a.prompt)} style={chipStyle("#f3f4f6", "#374151")}>{a.label}</button>
          ))}
          {hasContent && !formData.tagline && (
            <button onClick={() => sendMessage("Write me 3 tagline options.")} style={chipStyle("#fef3c7", "#92400e")}>💡 Need a tagline</button>
          )}
          {hasContent && !formData.offer && (
            <button onClick={() => sendMessage("What's the best offer for my business and ad size?")} style={chipStyle("#fef3c7", "#92400e")}>🎁 Need an offer</button>
          )}
          {hasContent && !formData.phone && (
            <button onClick={() => sendMessage("I haven't added my phone number yet.")} style={chipStyle("#fee2e2", "#991b1b")}>⚠️ No phone</button>
          )}
          {formData.tagline && formData.offer && formData.phone && (
            <button onClick={() => sendMessage("Give my ad a score out of 10 and what should I improve?")} style={chipStyle("#f0fdf4", "#166534")}>✓ Final review</button>
          )}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={loading ? "Thinking…" : "Tell me about your business…"}
            disabled={loading}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 24,
              border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
              fontFamily: "system-ui, sans-serif",
              background: loading ? "#f9fafb" : "#fff",
            }}
            onFocus={e => e.target.style.borderColor = "#991b1b"}
            onBlur={e => e.target.style.borderColor = "#e5e7eb"}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              width: 40, height: 40, borderRadius: "50%", border: "none",
              background: input.trim() && !loading ? "#991b1b" : "#e5e7eb",
              color: input.trim() && !loading ? "#fff" : "#9ca3af",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >→</button>
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>
          Just chat naturally — I'll fill your form as we talk
        </div>
      </div>
    </div>
  );
}
