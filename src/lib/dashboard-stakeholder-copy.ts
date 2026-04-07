/**
 * Presentation-only copy for media buyers / marketing.
 * Does not change scoring logic — uses existing dashboard payload fields.
 */

export type LeaderboardRow = {
  vendorId: string;
  vendorName: string;
  stratumKey: string;
  qDisplay: number;
  erShrunk: number;
  cpe: number | null;
  sessions: number;
  tier: string;
  percentile: number | null;
  anoRisk: number;
  top20: boolean;
};

/** Readable slice label, e.g. "US · Mobile · Automotive" */
export function formatMarketSlice(stratumKey: string): string {
  const parts = stratumKey.split("|");
  if (parts.length < 3) return stratumKey;
  const [geo, device, vertical] = parts;
  const dev =
    device === "mobile"
      ? "Mobile"
      : device === "desktop"
        ? "Desktop"
        : device === "tablet"
          ? "Tablet"
          : device;
  const vert = vertical ? vertical.charAt(0).toUpperCase() + vertical.slice(1) : "";
  return `${geo} · ${dev} · ${vert}`;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export type RowHighlight = "top_performer" | "needs_attention" | "neutral";

export function getRowHighlight(row: LeaderboardRow, allRows: LeaderboardRow[]): RowHighlight {
  if (row.tier === "suppress" || row.anoRisk >= 55) return "needs_attention";
  if (
    row.top20 &&
    row.anoRisk < 50 &&
    row.sessions >= 30 &&
    row.tier !== "suppress"
  ) {
    return "top_performer";
  }
  if (
    row.percentile !== null &&
    row.percentile <= 0.25 &&
    row.sessions >= 30 &&
    !row.top20
  ) {
    return "needs_attention";
  }
  if (allRows.length >= 2) {
    const byScore = [...allRows].sort((a, b) => a.qDisplay - b.qDisplay);
    const weakest = byScore[0];
    if (
      weakest &&
      row.vendorId === weakest.vendorId &&
      row.stratumKey === weakest.stratumKey &&
      row.anoRisk < 55
    ) {
      return "needs_attention";
    }
  }
  return "neutral";
}

export function highlightReason(h: RowHighlight): { icon: string; label: string; sub: string } {
  if (h === "top_performer") {
    return {
      icon: "✅",
      label: "Top performer",
      sub: "High engagement and efficient cost compared with similar traffic.",
    };
  }
  if (h === "needs_attention") {
    return {
      icon: "❌",
      label: "Needs attention",
      sub: "Low engagement, higher cost, or elevated traffic risk compared with peers.",
    };
  }
  return { icon: "", label: "", sub: "" };
}

/** Plain-English performance summary for one vendor row */
export function performanceSummary(row: LeaderboardRow, peers: LeaderboardRow[]): string {
  const ers = peers.map((p) => p.erShrunk);
  const cpes = peers.map((p) => p.cpe).filter((c): c is number => c != null && c > 0);
  const medEr = median(ers);
  const medCpe = median(cpes);

  const erOk = medEr != null && row.erShrunk >= medEr - 0.03;
  const erLow = medEr != null && row.erShrunk < medEr - 0.05;
  const costOk = medCpe != null && row.cpe != null && row.cpe <= medCpe * 1.15;
  const costHigh = medCpe != null && row.cpe != null && row.cpe > medCpe * 1.2;

  if (row.anoRisk >= 55) {
    return "Traffic shows unusual patterns that may indicate non-human or low-trust activity, which reduces confidence in this source.";
  }
  if (row.tier === "suppress") {
    return "Risk level is high enough that scaling spend is not recommended until patterns improve.";
  }
  if (row.sessions < 30) {
    return "Not enough visits yet to judge fairly—wait for more traffic before big budget moves.";
  }
  if (row.top20 && erOk && costOk && row.anoRisk < 40) {
    return "High engagement and strong cost efficiency versus similar traffic—this is a strong performer.";
  }
  if (row.top20) {
    return "Ranks in the top group for this market slice, with solid engagement or cost versus peers.";
  }
  if (erLow && costHigh) {
    return "Weaker engagement and higher cost than similar traffic—efficiency is below average.";
  }
  if (erLow) {
    return "Engagement is lower than comparable sources—users are less likely to show meaningful interest.";
  }
  if (costHigh) {
    return "Cost per engaged user is higher than peers—you pay more for each interested visitor.";
  }
  if (row.percentile !== null && row.percentile < 0.35) {
    return "Below most peers on overall score for this slice—worth monitoring or testing alternatives.";
  }
  if (row.tier === "watchlist") {
    return "Mixed signals: performance is not clearly strong or clearly weak—review before scaling.";
  }
  return "Performance is in a normal range for this market slice—no extreme highs or lows.";
}

export function tierDisplayLabel(tier: string): string {
  switch (tier) {
    case "high_confidence":
      return "Strong signal";
    case "watchlist":
      return "Review suggested";
    case "suppress":
      return "High risk";
    case "insufficient_data":
      return "Need more data";
    default:
      return tier.replace(/_/g, " ");
  }
}

export type RecWithVendor = {
  action: string;
  vendor: { name: string };
  confidence: string;
  reasonCodes: string[];
};

export function recommendationSentence(r: RecWithVendor): string {
  const name = r.vendor.name;
  switch (r.action) {
    case "scale":
      return `${name}: Consider increasing budget. This source shows strong engagement and cost efficiency compared with similar traffic.`;
    case "cut":
      return `${name}: Consider reducing or pausing spend. Traffic risk is elevated and does not meet our trust bar for scaling.`;
    case "test_more":
      return `${name}: Keep testing with a modest amount. There are not enough visits yet to say whether this source is strong or weak.`;
    case "hold":
    default:
      if (r.reasonCodes.includes("below_median_or_watchlist")) {
        return `${name}: Keep current budget for now. Performance is average or mixed—no strong signal to scale or cut.`;
      }
      return `${name}: Keep current budget. Performance is in a normal range and does not show a strong reason to change spend yet.`;
  }
}

export type KpiInsightPayload = {
  leaderboard: LeaderboardRow[];
  alerts: { alertType: string; severity: string }[];
};

export function buildKeyInsights(payload: KpiInsightPayload): string[] {
  const { leaderboard, alerts } = payload;
  const lines: string[] = [];
  if (leaderboard.length === 0) {
    lines.push("Add traffic and run the scoring jobs to see vendor insights.");
    return lines;
  }

  const sorted = [...leaderboard].sort((a, b) => b.qDisplay - a.qDisplay);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;

  lines.push(
    `Top performing vendor: ${best.vendorName} (strong overall score for ${formatMarketSlice(best.stratumKey)}).`,
  );

  if (sorted.length > 1 && best.vendorId !== worst.vendorId) {
    lines.push(
      `Lowest on dashboard ranking: ${worst.vendorName} (weaker score for ${formatMarketSlice(worst.stratumKey)}—see table for detail).`,
    );
  }

  const riskVendors = leaderboard.filter((r) => r.anoRisk >= 55);
  if (riskVendors.length === 1) {
    lines.push(
      `1 vendor (${riskVendors[0]!.vendorName}) is flagged for elevated traffic risk—review before increasing spend.`,
    );
  } else if (riskVendors.length > 1) {
    lines.push(
      `${riskVendors.length} vendors show elevated traffic risk patterns—review those rows before scaling.`,
    );
  }

  const fraudAlerts = alerts.filter((a) => a.alertType === "fraud_risk" || a.severity === "critical");
  if (fraudAlerts.length > 0 && riskVendors.length === 0) {
    lines.push(`${fraudAlerts.length} open alert(s) related to quality or risk—see Alerts below.`);
  }

  return lines;
}
