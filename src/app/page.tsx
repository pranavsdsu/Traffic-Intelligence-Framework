import { getDashboardPayload } from "@/lib/dashboard-data";
import {
  buildKeyInsights,
  formatMarketSlice,
  getRowHighlight,
  highlightReason,
  performanceSummary,
  recommendationSentence,
  tierDisplayLabel,
  type LeaderboardRow,
} from "@/lib/dashboard-stakeholder-copy";

export const dynamic = "force-dynamic";

function tierBadgeClass(t: string) {
  if (t === "high_confidence") return "tier-high";
  if (t === "suppress") return "tier-suppress";
  if (t === "insufficient_data") return "tier-low";
  return "tier-watch";
}

const TIP = {
  vendorScore:
    "Overall quality score combining engagement, cost efficiency, and traffic trust (higher is better).",
  engagement:
    "Percentage of users who showed interest, based on time spent or activity on our tracking path.",
  costEngaged:
    "Average ad spend for each visitor who showed meaningful interest—not for every click.",
  visits: "Total visits we tracked in the scoring period for this vendor and market slice.",
  topGroup:
    "Among the top 20% of vendors in this market slice, with enough visits to compare fairly.",
  marketSlice: "Geography, device type, and vertical—so we compare similar traffic only.",
};

export default async function Home() {
  let data: Awaited<ReturnType<typeof getDashboardPayload>>;
  try {
    data = await getDashboardPayload();
  } catch {
    return (
      <main>
        <h1>Traffic Intelligence</h1>
        <p className="empty">
          We couldn&apos;t reach the database. From the project folder, run{" "}
          <code>npm run setup:env</code>, <code>docker compose up -d</code>,{" "}
          <code>npx prisma db push</code>, <code>npm run db:seed</code>, and{" "}
          <code>npm run jobs:all</code>, then refresh.
        </p>
      </main>
    );
  }

  const { kpis, leaderboard, recommendations, alerts } = data;
  const rows: LeaderboardRow[] = leaderboard.map((r) => ({ ...r }));
  const insights = buildKeyInsights({ leaderboard: rows, alerts });

  return (
    <main>
      <h1>Traffic Intelligence</h1>
      <p className="sub">
        See which traffic sources deliver interested users at a fair cost—using activity we can
        measure on our side (not sales on the client&apos;s site). Suggestions support budget
        decisions; they do not change spend automatically.
      </p>

      <section className="insights-block" aria-labelledby="insights-heading">
        <h2 id="insights-heading">Key insights</h2>
        <ul className="insights-list">
          {insights.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      <div className="kpis">
        <div className="kpi">
          <label title="Sum of tracked spend tied to visits in the database.">Total spend</label>
          <span className="val">${kpis.spend.toFixed(2)}</span>
          <p className="kpi-desc">Money tied to tracked visits across all vendors.</p>
        </div>
        <div className="kpi">
          <label title={TIP.vendorScore}>Average vendor score</label>
          <span className="val">{kpis.portfolioQ.toFixed(1)}</span>
          <p className="kpi-desc">Typical quality level across vendors shown here (higher is better).</p>
        </div>
        <div className="kpi">
          <label title="Visits where users met our interest bar.">Engaged visits</label>
          <span className="val">{kpis.engagedSessions}</span>
          <p className="kpi-desc">Users who showed meaningful interest, not just a quick click.</p>
        </div>
        <div className="kpi">
          <label title="Every visit we tracked and closed in the system.">Total visits</label>
          <span className="val">{kpis.totalSessions}</span>
          <p className="kpi-desc">All visits counted—includes both engaged and not engaged.</p>
        </div>
        <div className="kpi">
          <label title={TIP.costEngaged}>Average cost per engaged user</label>
          <span className="val">{kpis.cpe != null ? `$${kpis.cpe.toFixed(2)}` : "—"}</span>
          <p className="kpi-desc">What you pay on average for each interested visitor.</p>
        </div>
        <div className="kpi">
          <label title="Items that need a look from the team.">Open alerts</label>
          <span className="val">{kpis.openAlerts}</span>
          <p className="kpi-desc">Open items that may need review (see Alerts below).</p>
        </div>
      </div>

      <section>
        <h2>Vendor leaderboard</h2>
        <p className="section-lead">
          Compare sources in the same market slice.{" "}
          <span className="hint" title={TIP.marketSlice}>
            What is a market slice?
          </span>
        </p>
        {leaderboard.length === 0 ? (
          <p className="empty">No scores yet. Run the scoring jobs after loading sample data.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Vendor</th>
                  <th title={TIP.marketSlice}>Market slice</th>
                  <th title={TIP.vendorScore}>
                    <span className="th-label">Vendor score</span>
                  </th>
                  <th title={TIP.engagement}>
                    <span className="th-label">Engagement rate</span>
                  </th>
                  <th title={TIP.costEngaged}>
                    <span className="th-label">Cost per engaged user</span>
                  </th>
                  <th title={TIP.visits}>
                    <span className="th-label">Total visits</span>
                  </th>
                  <th>Trust level</th>
                  <th title={TIP.topGroup}>Top group</th>
                  <th>Performance summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const highlight = getRowHighlight(row, rows);
                  const hi = highlightReason(highlight);
                  const rowClass =
                    highlight === "top_performer"
                      ? "row row--good"
                      : highlight === "needs_attention"
                        ? "row row--bad"
                        : "row";
                  return (
                    <tr key={`${row.vendorId}-${row.stratumKey}`} className={rowClass}>
                      <td className="td-status">
                        {highlight === "top_performer" && (
                          <span className="status-pill status-pill--good" title={hi.sub}>
                            {hi.icon} Top performer
                          </span>
                        )}
                        {highlight === "needs_attention" && (
                          <span className="status-pill status-pill--bad" title={hi.sub}>
                            {hi.icon} Needs attention
                          </span>
                        )}
                        {highlight === "neutral" && <span className="muted-dash">—</span>}
                      </td>
                      <td className="td-strong">{row.vendorName}</td>
                      <td>{formatMarketSlice(row.stratumKey)}</td>
                      <td>{row.qDisplay.toFixed(1)}</td>
                      <td>{(row.erShrunk * 100).toFixed(1)}%</td>
                      <td>{row.cpe != null ? `$${row.cpe.toFixed(2)}` : "—"}</td>
                      <td>{row.sessions}</td>
                      <td>
                        <span className={`badge ${tierBadgeClass(row.tier)}`}>
                          {tierDisplayLabel(row.tier)}
                        </span>
                      </td>
                      <td>
                        {row.top20 ? (
                          <span className="badge badge--top-group" title={TIP.topGroup}>
                            ✅ Yes
                          </span>
                        ) : (
                          <span className="muted-dash">—</span>
                        )}
                      </td>
                      <td className="td-summary">{performanceSummary(row, rows)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Budget suggestions</h2>
        <p className="section-lead">
          Plain-language next steps. Your team still decides what to do in each buying platform.
        </p>
        {recommendations.length === 0 ? (
          <p className="empty">No active suggestions right now.</p>
        ) : (
          <div className="cards">
            {recommendations.map((r) => (
              <div className="card card--rec" key={r.id}>
                <p className="rec-sentence">{recommendationSentence(r)}</p>
                <p className="rec-meta">
                  Confidence:{" "}
                  {r.confidence === "high"
                    ? "✅ High"
                    : r.confidence === "low"
                      ? "⚠️ Low"
                      : "Average"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Alerts</h2>
        {alerts.length === 0 ? (
          <p className="empty">No open alerts.</p>
        ) : (
          <div>
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`alert ${a.severity === "critical" ? "critical" : ""}`}
              >
                <strong>
                  {a.severity === "critical" ? "❌ " : "⚠️ "}
                  {a.title}
                </strong>
                <div className="meta">
                  {a.alertType === "fraud_risk"
                    ? "Traffic risk"
                    : a.alertType === "quality_low"
                      ? "Quality vs peers"
                      : a.alertType}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
