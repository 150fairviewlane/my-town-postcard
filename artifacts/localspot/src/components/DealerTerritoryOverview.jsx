import { useState } from "react";
import MiniAdPickerGrid from "./MiniAdPickerGrid";

const RED = "#7B1418";
const GOLD = "#C9A84C";

function formatMoney(cents) {
  if (!cents) return "$0";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function PublishedPill({ isPublished }) {
  return (
    <span style={{
      background: isPublished ? "#f0fdf4" : "#f3f4f6",
      color: isPublished ? "#15803d" : "#6b7280",
      borderRadius: 999,
      padding: "2px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.4,
    }}>
      {isPublished ? "Live" : "Draft"}
    </span>
  );
}

function FillBar({ sold, total }) {
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
          {sold} / {total} sold
        </span>
        <span style={{ fontSize: 12, color: pct >= 80 ? "#15803d" : pct >= 50 ? "#92400e" : "#6b7280", fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div style={{ background: "#f3f4f6", borderRadius: 999, height: 7, overflow: "hidden" }}>
        <div style={{
          background: pct >= 80 ? "#15803d" : pct >= 50 ? GOLD : RED,
          width: `${pct}%`, height: "100%", borderRadius: 999,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "18px 20px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)", flex: "1 1 140px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || "#111", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function TerritoryCard({ campaign, showRevenue }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!campaign.pageUrl) return;
    navigator.clipboard.writeText(campaign.pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const moneyLabel = showRevenue ? "Revenue" : "Your Commission";
  const moneyCents = showRevenue ? campaign.revenueCents : campaign.commissionCents;
  const campaignLabel = campaign.label || campaign.cityList || campaign.campaignName;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "20px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
      border: "1px solid #f0ece6",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20, color: "#111", letterSpacing: 0.5, lineHeight: 1.2,
            marginBottom: 4,
          }}>
            {campaignLabel}
          </div>
          {campaign.slug && (
            <div style={{ fontSize: 11.5, color: "#9ca3af", fontFamily: "monospace" }}>
              /{campaign.slug}
            </div>
          )}
        </div>
        <PublishedPill isPublished={campaign.isPublished} />
      </div>

      <FillBar sold={campaign.soldSpots} total={campaign.totalSpots} />

      {/* 30-day selling goal — only shown when firstPaidAt is set and goal not yet reached */}
      {campaign.firstPaidAt && campaign.soldSpots < 12 && (() => {
        const daysElapsed = Math.floor(
          (Date.now() - new Date(campaign.firstPaidAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysLeft = Math.max(0, 30 - daysElapsed);
        const goalPct = Math.min(100, Math.round((campaign.soldSpots / 12) * 100));
        const overdue = daysElapsed >= 30;
        return (
          <div style={{
            background: overdue ? "#fff7ed" : "#f9f5f0",
            border: `1px solid ${overdue ? "#fed7aa" : "#e8e0d4"}`,
            borderRadius: 10, padding: "12px 14px",
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 800, color: overdue ? "#c2410c" : GOLD,
              textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
            }}>
              {overdue ? `30-Day Goal — Day ${daysElapsed}` : "30-Day Selling Goal"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
              <span><strong style={{ color: RED }}>{campaign.soldSpots}</strong> of 12 spots filled</span>
              <span style={{ color: overdue ? "#c2410c" : daysLeft <= 5 ? "#92400e" : "#6b7280", fontWeight: 700 }}>
                {overdue ? `+${daysElapsed - 30}d over` : `${daysLeft}d left`}
              </span>
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: 999, height: 6, overflow: "hidden" }}>
              <div style={{
                width: `${goalPct}%`, height: "100%", borderRadius: 999,
                background: goalPct >= 80 ? "#15803d" : overdue ? "#c2410c" : GOLD,
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        );
      })()}

      {campaign.spots && campaign.spots.length > 0 && (
        <MiniAdPickerGrid spots={campaign.spots} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{moneyLabel}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: RED, fontFamily: "'Bebas Neue', sans-serif" }}>
            {formatMoney(moneyCents)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Households</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111", fontFamily: "'Bebas Neue', sans-serif" }}>
            ~{(campaign.estimatedHouseholds || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Available</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#374151" }}>
            {campaign.availableSpots}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Total Spots</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#374151" }}>
            {campaign.totalSpots}
          </div>
        </div>
        {campaign.zipCount != null && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>ZIP Codes Served</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>
              {campaign.zipCount.toLocaleString()} ZIPs
            </div>
          </div>
        )}
      </div>

      {campaign.pageUrl && (
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={campaign.pageUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1, textAlign: "center",
              background: RED, color: "#fff",
              border: "none", borderRadius: 8,
              padding: "9px 12px", fontSize: 12.5, fontWeight: 800,
              textDecoration: "none", cursor: "pointer",
            }}
          >
            View {campaignLabel} Page ↗
          </a>
          <button
            onClick={copyLink}
            style={{
              background: copied ? "#f0fdf4" : "#f9fafb",
              color: copied ? "#15803d" : "#374151",
              border: copied ? "1.5px solid #86efac" : "1.5px solid #e5e7eb",
              borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 800,
              cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s",
            }}
          >
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * DealerTerritoryOverview
 *
 * Shared presentational component for both the admin dealer detail page
 * and the dealer's own dashboard.
 *
 * Props:
 *   campaigns  — array from GET /api/admin/dealers/:id or GET /api/dealers/portal-data
 *   totals     — { totalSpotsAcrossAll, totalSoldAcrossAll, totalRevenueCentsAcrossAll, totalCommissionCentsAcrossAll }
 *                OR { totalRevenueCents, totalCommissionCents } (portal-data shape)
 *   showRevenue — true → show raw revenue (admin); false → show commission (dealer)
 */
export default function DealerTerritoryOverview({ campaigns = [], totals = {}, showRevenue }) {
  const totalSpots    = totals.totalSpotsAcrossAll ?? campaigns.reduce((s, c) => s + (c.totalSpots ?? 0), 0);
  const totalSold     = totals.totalSoldAcrossAll  ?? campaigns.reduce((s, c) => s + (c.soldSpots ?? 0), 0);
  const fillRate      = totalSpots > 0 ? Math.round((totalSold / totalSpots) * 100) : 0;

  const revenueCentsTotal     = totals.totalRevenueCentsAcrossAll ?? totals.totalRevenueCents ?? 0;
  const commissionCentsTotal  = totals.totalCommissionCentsAcrossAll ?? totals.totalCommissionCents ?? 0;

  const moneyTotal      = showRevenue ? revenueCentsTotal : commissionCentsTotal;
  const moneyTotalLabel = showRevenue ? "Total Revenue" : "Your Commission";

  if (campaigns.length === 0) {
    return (
      <div style={{
        background: "#fff", borderRadius: 14, padding: 40, textAlign: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#374151", marginBottom: 6 }}>
          No territory campaigns yet
        </div>
        <div style={{ fontSize: 13.5, color: "#9ca3af" }}>
          {showRevenue
            ? "Landing page campaigns will appear here once the dealer's territory is provisioned."
            : "Your campaign pages will appear here once they're set up — usually within 1 business day of your signup."}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Overall stats ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard
          label="Total Spots"
          value={totalSpots}
          sub="across all territories"
        />
        <StatCard
          label="Spots Sold"
          value={totalSold}
          color={RED}
          sub={`${totalSpots - totalSold} remaining`}
        />
        <StatCard
          label={moneyTotalLabel}
          value={formatMoney(moneyTotal)}
          color={RED}
          sub={showRevenue ? undefined : "70% of ad profit"}
        />
        <StatCard
          label="Fill Rate"
          value={`${fillRate}%`}
          color={fillRate >= 80 ? "#15803d" : fillRate >= 50 ? "#92400e" : "#374151"}
          sub={totalSpots > 0 ? `${totalSold} of ${totalSpots}` : "No spots yet"}
        />
      </div>

      {/* ── Territory cards ──────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22, color: "#111", letterSpacing: 0.5,
        }}>
          Territories ({campaigns.length})
        </div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
      }}>
        {campaigns.map((c) => (
          <TerritoryCard
            key={c.campaignId}
            campaign={c}
            showRevenue={showRevenue}
          />
        ))}
      </div>

      {/* ── Dealer guide link (dealer view only) ─────────────────────── */}
      {!showRevenue && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <a
            href="/dealers/guide"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13.5,
              fontWeight: 600,
              color: "#7B1418",
              textDecoration: "none",
              padding: "0.45rem 1rem",
              borderRadius: 7,
              border: "1px solid #E4D4A8",
              background: "#FBF7EF",
            }}
          >
            📖 Dealer Guide
          </a>
        </div>
      )}
    </>
  );
}
