import { getDashboardPayload } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

function tierClass(t: string) {
  if (t === "high_confidence") return "tier-high";
  if (t === "suppress") return "tier-suppress";
  if (t === "insufficient_data") return "tier-low";
  return "tier-watch";
}

export default async function Home() {
  let data: Awaited<ReturnType<typeof getDashboardPayload>>;
  try {
    data = await getDashboardPayload();
  } catch {
    return (
      <main>
        <h1>Traffic Intelligence</h1>
        <p className="empty">
          Database unavailable. Copy <code>.env.example</code> to <code>.env</code>, run{" "}
          <code>docker compose up -d</code>, then <code>npx prisma db push</code> and{" "}
          <code>npm run db:seed</code> and <code>npm run jobs:all</code>.
        </p>
      </main>
    );
  }

  const { kpis, leaderboard, recommendations, alerts } = data;

  return (
    <main>
      <h1>Traffic Intelligence</h1>
      <p className="sub">
        Proxy-based vendor quality (no client conversions). Top 20% = P80+ in stratum with enough
        sessions. Recommendations are capped suggestions—not auto-bid.
      </p>

      <div className="kpis">
        <div className="kpi">
          <label>Spend (sum sessions)</label>
          <span className="val">${kpis.spend.toFixed(2)}</span>
        </div>
        <div className="kpi">
          <label>Portfolio Q (avg)</label>
          <span className="val">{kpis.portfolioQ.toFixed(1)}</span>
        </div>
        <div className="kpi">
          <label>Engaged sessions</label>
          <span className="val">{kpis.engagedSessions}</span>
        </div>
        <div className="kpi">
          <label>CPE ($ / engaged)</label>
          <span className="val">{kpis.cpe != null ? `$${kpis.cpe.toFixed(2)}` : "—"}</span>
        </div>
        <div className="kpi">
          <label>Open alerts</label>
          <span className="val">{kpis.openAlerts}</span>
        </div>
      </div>

      <section>
        <h2>Vendor leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="empty">No scores yet. Run jobs after seeding.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Stratum</th>
                  <th>Q</th>
                  <th>ER (shrunk)</th>
                  <th>CPE</th>
                  <th>Sessions</th>
                  <th>Tier</th>
                  <th>Top 20%</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={`${row.vendorId}-${row.stratumKey}`}>
                    <td>{row.vendorName}</td>
                    <td>
                      <code style={{ fontSize: "0.8rem" }}>{row.stratumKey}</code>
                    </td>
                    <td>{row.qDisplay.toFixed(1)}</td>
                    <td>{(row.erShrunk * 100).toFixed(1)}%</td>
                    <td>{row.cpe != null ? `$${row.cpe.toFixed(2)}` : "—"}</td>
                    <td>{row.sessions}</td>
                    <td>
                      <span className={`badge ${tierClass(row.tier)}`}>{row.tier}</span>
                    </td>
                    <td>
                      {row.top20 ? (
                        <span className="badge top">Top 20%</span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Recommendations</h2>
        {recommendations.length === 0 ? (
          <p className="empty">No active recommendations.</p>
        ) : (
          <div className="cards">
            {recommendations.map((r) => (
              <div className="card" key={r.id}>
                <h3>
                  {r.vendor.name} — <strong>{r.action}</strong>{" "}
                  <span className="meta">({r.confidence} confidence)</span>
                </h3>
                <div className="meta">{r.reasonCodes.join(", ") || "—"}</div>
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
                <strong>{a.title}</strong>
                <div className="meta">{a.alertType}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
