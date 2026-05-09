interface MailboxLogoProps {
  height?: number;
}

export function MailboxLogo({ height = 64 }: MailboxLogoProps) {
  const w = Math.round(height * 56 / 82);
  return (
    <svg width={w} height={height} viewBox="0 0 56 82" fill="none" aria-hidden="true">

      {/* ── POST & BASE ── */}
      <rect x="22" y="66" width="12" height="16" rx="2" fill="#7f1d1d"/>
      <rect x="14" y="64" width="28" height="5" rx="2.5" fill="#7f1d1d"/>

      {/* ── ENVELOPE (drawn first so mailbox body clips its lower portion) ── */}
      {/* Envelope body — cream white, maroon border */}
      <rect x="7" y="2" width="42" height="30" rx="3" fill="#fef2f2" stroke="#991b1b" strokeWidth="2"/>
      {/* Envelope flap V crease */}
      <path d="M7 2 L28 19 L49 2" stroke="#b91c1c" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* Stamp area */}
      <rect x="37" y="7" width="9" height="12" rx="1.5" fill="#fca5a5" stroke="#b91c1c" strokeWidth="1"/>
      <rect x="38.5" y="8.5" width="6" height="9" rx="0.5" fill="#991b1b" opacity="0.3"/>
      {/* Address lines */}
      <rect x="10" y="22" width="19" height="2" rx="1" fill="#d1d5db"/>
      <rect x="10" y="26" width="14" height="2" rx="1" fill="#d1d5db"/>

      {/* ── MAILBOX BODY (renders over bottom portion of envelope) ── */}
      <rect x="4" y="30" width="48" height="36" rx="5" fill="#991b1b"/>
      {/* Top edge highlight */}
      <rect x="4" y="30" width="48" height="6" rx="5" fill="#dc2626" opacity="0.25"/>
      {/* Front door recess panel */}
      <rect x="10" y="42" width="26" height="17" rx="3" fill="#7f1d1d" opacity="0.45"/>
      <rect x="11" y="43" width="24" height="15" rx="2" fill="#7f1d1d" opacity="0.25"/>

      {/* ── SLOT HOUSING (top ledge, renders above mailbox body and envelope bottom) ── */}
      <rect x="2" y="26" width="52" height="9" rx="4.5" fill="#7f1d1d"/>
      {/* The slot opening (dark gap) — shows envelope entering */}
      <rect x="8" y="28" width="40" height="4.5" rx="1" fill="#1a0000"/>
      {/* Slot inner shadow */}
      <rect x="9" y="28.5" width="38" height="2" rx="0.5" fill="#0a0000" opacity="0.6"/>

      {/* ── RAISED FLAG (right side) ── */}
      <rect x="49" y="40" width="3" height="20" rx="1.5" fill="#7f1d1d"/>
      <rect x="42" y="35" width="10" height="8" rx="2" fill="#dc2626"/>
      <rect x="43" y="36" width="8" height="2.5" rx="1" fill="#ef4444" opacity="0.5"/>

      {/* ── ENVELOPE TOP RE-DRAWN (on top of slot housing so it appears in front) ── */}
      {/* This redraw makes the envelope look like it's coming UP out of the slot */}
      <rect x="7" y="2" width="42" height="27" rx="3" fill="#fef2f2" stroke="#991b1b" strokeWidth="2"/>
      <path d="M7 2 L28 19 L49 2" stroke="#b91c1c" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <rect x="37" y="7" width="9" height="12" rx="1.5" fill="#fca5a5" stroke="#b91c1c" strokeWidth="1"/>
      <rect x="38.5" y="8.5" width="6" height="9" rx="0.5" fill="#991b1b" opacity="0.3"/>
      <rect x="10" y="22" width="19" height="2" rx="1" fill="#d1d5db"/>
      <rect x="10" y="26" width="14" height="2" rx="1" fill="#d1d5db"/>

    </svg>
  );
}
