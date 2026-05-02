import { useState, useRef, useEffect, useCallback } from "react";
import { INDUSTRIES } from "./industryAssets";

// ─────────────────────────────────────────────────────────────────────────────
// AD ASSISTANT — AI-powered ad design consultant
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(formData, sizeKey) {
  const ind = INDUSTRIES[formData.industry] || {};
  const sizeName = { XL: 'Extra Large (4×5")', L: 'Large (4×3")', M: 'Medium (3×2")', S: 'Small (3×1.5")' }[sizeKey] || sizeKey;

  return `You are an expert print advertising consultant helping a local business owner design their ad for the My Town Postcard — a 9×12 co-op postcard reaching 5,000 homes in Habersham County, Georgia.

Your job is to help them create the most effective possible ad. You give specific, actionable suggestions — not generic advice. You write actual copy they can use immediately.

CURRENT AD STATE:

- Business Name: ${formData.businessName || "not entered yet"}
- Industry: ${formData.industry || "not selected yet"}
- Ad Size: ${sizeName}
- Tagline: ${formData.tagline || "empty"}
- Offer/Coupon: ${formData.offer || "empty"}
- Offer Fine Print: ${formData.offerFine || "empty"}
- Phone: ${formData.phone || "empty"}
- Address: ${formData.address || "empty"}
- Website: ${formData.website || "none"}
- Has Logo: ${formData.logo ? "yes" : "no"}
- Has Photo: ${formData.photo ? "yes" : "no"}

INDUSTRY CONTEXT:
${formData.industry ? `
- Suggested taglines for ${formData.industry}: ${(ind.taglines || []).join(" | ")}
- Typical menu items/services: ${(ind.menu || []).join(", ")}
- Brand colors: ${ind.colors ? `primary ${ind.colors.primary}, accent ${ind.colors.accent}` : "not available"}
` : "No industry selected yet."}

AD SIZE GUIDANCE:

- Extra Large: Hero spot, maximum impact. Use bold headline, 3-4 service bullets, large offer, phone prominent.
- Large: Premium placement. Strong headline, 2-3 bullets, clear offer, all contact info.
- Medium: Good visibility. Punchy headline, 1-2 highlights, offer, phone + address.
- Small: Banner-style. Business name, ONE compelling offer, phone only.

YOUR PERSONALITY:

- Direct and specific — always give the actual copy, not just advice
- Encouraging but honest — if something is weak, say so and fix it
- Local-focused — reference Clarkesville, Habersham County, "local homeowners" naturally
- Keep responses SHORT — 2-4 sentences max unless writing actual copy
- Use casual, friendly language — you're a knowledgeable neighbor, not a corporate consultant

WHEN SUGGESTING COPY:

- Format taglines and offers clearly so user can copy them
- Always explain WHY a suggestion works in one sentence
- Offer 2-3 alternatives when possible so they can choose

WHAT YOU CAN UPDATE:
When a user accepts a suggestion, tell them you're updating the field. You cannot update fields yourself — just tell the user clearly which field to update and with what text, or they can click the Apply button that appears with your suggestions.

IMPORTANT: Keep every response under 150 words. Be specific to THEIR business, not generic.`;
}

const QUICK_ACTIONS = [
  { label: "✍️ Write my tagline", prompt: "Write me 3 tagline options for my business." },
  { label: "🎁 Suggest an offer", prompt: "What's a great coupon offer for my type of business?" },
  { label: "📝 Improve my copy", prompt: "Look at what I have so far and tell me what to improve." },
  { label: "📸 Do I need a photo?", prompt: "Should I upload a photo for my ad size? What kind works best?" },
  { label: "💡 What's missing?", prompt: "What important information am I missing from my ad?" },
  { label: "📱 QR code advice", prompt: "Should I add a website and QR code to my ad?" },
];

function parseSuggestions(text, formData) {
  const suggestions = [];

  const taglineMatch = text.match(/(?:tagline|slogan)[:]\s*["']?([^"'\n]{10,80})["']?/i);
  if (taglineMatch && taglineMatch[1].trim() !== formData.tagline) {
    suggestions.push({ field: "tagline", label: "Set Tagline", value: taglineMatch[1].trim() });
  }

  const offerMatch = text.match(/(?:offer|coupon|special|deal)[:]\s*["']?([^"'\n]{5,60})["']?/i);
  if (offerMatch && offerMatch[1].trim() !== formData.offer) {
    suggestions.push({ field: "offer", label: "Set Offer", value: offerMatch[1].trim() });
  }

  const numberedOptions = [...text.matchAll(/(?:^|\n)\s*(?:\d+[.)]\s*|[-•]\s*)["']?([A-Z][^"'\n]{10,70})["']?/gm)];
  if (numberedOptions.length >= 2) {
    numberedOptions.slice(0, 3).forEach((m, i) => {
      const val = m[1].trim();
      if (val !== formData.tagline && val !== formData.offer) {
        suggestions.push({ field: "tagline", label: `Use Option ${i + 1}`, value: val });
      }
    });
  }

  return suggestions.slice(0, 3);
}

function Message({ msg, onApply, formData }) {
  const suggestions = msg.role === "assistant" ? parseSuggestions(msg.content, formData) : [];

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
          padding: "10px 14px",
          fontSize: 13,
          lineHeight: 1.55,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: msg.role === "assistant" ? "1px solid #f0f0f0" : "none",
          whiteSpace: "pre-wrap",
        }}>
          {msg.content}
        </div>

        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onApply(s)}
                style={{
                  background: "#fff", border: "1.5px solid #991b1b", color: "#991b1b",
                  borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: "sans-serif",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.target.style.background = "#991b1b"; e.target.style.color = "#fff"; }}
                onMouseLeave={e => { e.target.style.background = "#fff"; e.target.style.color = "#991b1b"; }}
              >
                ✓ {s.label}: "{s.value.slice(0, 25)}{s.value.length > 25 ? "…" : ""}"
              </button>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3,
          textAlign: msg.role === "user" ? "right" : "left" }}>
          {msg.time}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: "#991b1b",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
      }}>✦</div>
      <div style={{
        background: "#fff", border: "1px solid #f0f0f0",
        borderRadius: "4px 16px 16px 16px", padding: "12px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#991b1b",
            animation: "bounce 1.2s infinite",
            animationDelay: `${i * 0.2}s`,
            opacity: 0.7,
          }} />
        ))}
        <style>{`@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.7; } 30% { transform: translateY(-5px); opacity: 1; } }`}</style>
      </div>
    </div>
  );
}

export default function AdAssistant({ formData, onUpdate, sizeKey = "L" }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: formData.businessName
        ? `Hi! I'm your ad consultant. I can see you're building an ad for ${formData.businessName} — let's make it great! What do you need help with?`
        : "Hi! I'm your ad consultant. I'll help you write great copy, suggest offers, and make sure your ad stands out. What's your business name?",
      time: now(),
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const prevIndustry = useRef(formData.industry);
  useEffect(() => {
    if (formData.industry && formData.industry !== prevIndustry.current) {
      prevIndustry.current = formData.industry;
      const ind = INDUSTRIES[formData.industry];
      if (ind) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Great choice — ${formData.industry}! I have some good ideas for this category. One quick tip: "${ind.taglines[0]}" is the kind of punchy tagline that works well. Want me to write 3 options tailored to your business?`,
          time: now(),
        }]);
      }
    }
  }, [formData.industry]);

  const sendMessage = useCallback(async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;

    setInput("");
    const userMsg = { role: "user", content: userText, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch("/api/ad-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 400,
          system: buildSystemPrompt(formData, sizeKey),
          messages: history,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const reply = data.content?.[0]?.text || "Sorry, I didn't get a response. Please try again.";
      setMessages(prev => [...prev, { role: "assistant", content: reply, time: now() }]);

    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I ran into an issue connecting to the AI. Please check your API key is set up correctly.",
        time: now(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, formData, sizeKey]);

  const handleApply = useCallback((suggestion) => {
    onUpdate(suggestion.field, suggestion.value);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: `✓ Updated your ${suggestion.field} to: "${suggestion.value}" — you can see it in the preview. Want to tweak it or move on to something else?`,
      time: now(),
    }]);
  }, [onUpdate]);

  const hasContent = formData.businessName || formData.industry;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#f8fafc", fontFamily: "system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", background: "#991b1b",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, border: "2px solid rgba(255,255,255,0.4)",
        }}>✦</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>Ad Assistant</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>
            AI-powered · Claude Haiku
          </div>
        </div>
        <div style={{
          marginLeft: "auto", background: "rgba(255,255,255,0.2)",
          borderRadius: 12, padding: "3px 10px",
          color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
        }}>
          ● LIVE
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px 14px",
        display: "flex", flexDirection: "column", gap: 12,
        background: "#f8fafc",
      }}>
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} onApply={handleApply} formData={formData} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      {!hasContent && messages.length <= 2 && (
        <div style={{ padding: "0 14px 10px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Quick Start
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK_ACTIONS.slice(0, 4).map((action) => (
              <button key={action.label} onClick={() => sendMessage(action.prompt)}
                style={{
                  background: "#fff", border: "1.5px solid #e5e7eb",
                  borderRadius: 20, padding: "5px 12px", fontSize: 11,
                  fontWeight: 600, cursor: "pointer", color: "#374151",
                  fontFamily: "sans-serif", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.target.style.borderColor = "#991b1b"; e.target.style.color = "#991b1b"; }}
                onMouseLeave={e => { e.target.style.borderColor = "#e5e7eb"; e.target.style.color = "#374151"; }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contextual suggestions */}
      {hasContent && !loading && (
        <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {!formData.tagline && (
              <button onClick={() => sendMessage("Write me 3 tagline options for my business.")}
                style={chipStyle("#fef3c7", "#92400e")}>
                💡 Need a tagline
              </button>
            )}
            {!formData.offer && (
              <button onClick={() => sendMessage("What's the best offer/coupon for my business type and ad size?")}
                style={chipStyle("#fef3c7", "#92400e")}>
                🎁 Need an offer
              </button>
            )}
            {!formData.phone && (
              <button onClick={() => sendMessage("How important is it to include my phone number?")}
                style={chipStyle("#fee2e2", "#991b1b")}>
                ⚠️ No phone added
              </button>
            )}
            {!formData.photo && (
              <button onClick={() => sendMessage("I haven't uploaded a photo. Will the stock photo work?")}
                style={chipStyle("#e0f2fe", "#0369a1")}>
                📸 No photo yet
              </button>
            )}
            {formData.tagline && formData.offer && formData.phone && (
              <button onClick={() => sendMessage("My ad looks complete. Can you do a final review and give me a score out of 10?")}
                style={chipStyle("#f0fdf4", "#166534")}>
                ✓ Final review
              </button>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 14px 14px", borderTop: "1px solid #e5e7eb",
        background: "#fff", flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={loading ? "Thinking…" : "Ask anything about your ad…"}
            disabled={loading}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 24,
              border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
              fontFamily: "system-ui, sans-serif", background: loading ? "#f9fafb" : "#fff",
              transition: "border-color 0.15s",
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
              transition: "all 0.15s", flexShrink: 0,
            }}
          >
            →
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>
          Press Enter to send · Suggestions can be applied with one click
        </div>
      </div>
    </div>
  );
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function chipStyle(bg, color) {
  return {
    background: bg, border: "none", borderRadius: 20,
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    cursor: "pointer", color, fontFamily: "sans-serif",
  };
}
