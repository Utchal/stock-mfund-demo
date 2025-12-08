import React, { useEffect, useState } from "react";
import PriceChart from "./PriceChart";
import "./styles.css";

function formatNumber(n, digits = 2) {
  if (n === null || n === undefined) return "-";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function App() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [startDate, setStartDate] = useState("01-01-2020");
  const [investment, setInvestment] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [viewMode, setViewMode] = useState("normalized"); // 'normalized' or 'absolute'
  const [showOverlays, setShowOverlays] = useState(true);
  const [error, setError] = useState(null);

  // helper to call backend
  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const payload = {
        symbol: symbol.trim(),
        start_date: startDate,
        investment_amount: investment ? Number(investment) : null,
      };

      const resp = await fetch("/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json.detail || `Backend error: ${resp.status}`);
      }

      const json = await resp.json();
      setAnalysis(json);
    } catch (e) {
      console.error("analysis error:", e);
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // run initially once so page shows data
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPrice = analysis?.start_price ?? null;
  const currentPrice = analysis?.current_price ?? null;
  const returnPct = analysis?.return_pct ?? null;
  const annualized = analysis?.annualized_pct ?? null;

  return (
    <div className="app-container">
      <header className="topbar">
        <h1>PriceHound — Stock & Index Preview</h1>
        <div className="controls-row">
          <label>Symbol
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </label>

          <label>Start
            <input value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          <label>Investment
            <input value={investment} onChange={(e) => setInvestment(e.target.value)} placeholder="optional" />
          </label>

          <button className="btn" onClick={runAnalysis} disabled={loading}>
            {loading ? "Running..." : "Analyze"}
          </button>
        </div>

        <div className="view-controls">
          <label className="radio">
            <input type="radio" name="view" checked={viewMode === "normalized"} onChange={() => setViewMode("normalized")} />
            Normalized (start = 100)
          </label>
          <label className="radio">
            <input type="radio" name="view" checked={viewMode === "absolute"} onChange={() => setViewMode("absolute")} />
            Absolute (actual prices)
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={showOverlays} onChange={(e) => setShowOverlays(e.target.checked)} />
            Show index overlays
          </label>

          <div className="summary-inline">
            <span>Start: {startPrice ? formatNumber(startPrice, 2) : "-"}</span>
            <span> • Current: {currentPrice ? formatNumber(currentPrice, 2) : "-"}</span>
            <span> • Return: {returnPct ? `${formatNumber(returnPct, 2)}%` : "-"}</span>
            <span> • Annualized: {annualized ? `${formatNumber(annualized, 2)}%` : "-"}</span>
          </div>
        </div>
      </header>

      <main>
        <section className="chart-card">
          <h2 style={{ margin: 0 }}>{symbol.toUpperCase()} • start {analysis?.start_date ?? "-"} • start price {startPrice ? formatNumber(startPrice,2) : "-"} • current {currentPrice ? formatNumber(currentPrice,2) : "-"}</h2>

          <div style={{ height: 480 }}>
            <PriceChart
              history={analysis?.history ?? []}
              indexes={analysis?.indexes ?? []}
              viewMode={viewMode}
              showOverlays={showOverlays}
            />
          </div>
        </section>

        <section className="content-row">
          <div className="left-col">
            <h3>History (last 10)</h3>
            <table className="history-table">
              <thead><tr><th>Date</th><th>Close</th><th>Index (first)</th></tr></thead>
              <tbody>
                {(analysis?.history ?? []).slice(-10).reverse().map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{formatNumber(r.close, 2)}</td>
                    <td>{/* placeholder; index columns shown in separate table if needed */}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="right-col">
            <div className="news-card">
              <h3>Latest headlines</h3>
              {analysis?.headlines && analysis.headlines.length ? (
                <ul className="news-list">
                  {analysis.headlines.map((h, i) => (
                    <li key={i}>
                      <a href={h.link} target="_blank" rel="noreferrer">{h.title}</a>
                      <div className="pub">{h.published}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>No headlines</div>
              )}
            </div>

            <div className="summary-card">
              <h3>Summary</h3>
              <div><strong>Symbol:</strong> {analysis?.symbol ?? "-"}</div>
              <div><strong>Start date:</strong> {analysis?.start_date ?? "-"}</div>
              <div><strong>Start price:</strong> {startPrice ? formatNumber(startPrice,2) : "-"}</div>
              <div><strong>Current price:</strong> {currentPrice ? formatNumber(currentPrice,2) : "-"}</div>
              <div><strong>Return:</strong> {returnPct ? `${formatNumber(returnPct,2)}%` : "-"}</div>
              <div><strong>Annualized:</strong> {annualized ? `${formatNumber(annualized,2)}%` : "-"}</div>
              <div><strong>Units (if invested):</strong> {analysis?.units ? formatNumber(analysis.units,6) : "-"}</div>
              <div><strong>Current value:</strong> {analysis?.current_value ? formatNumber(analysis.current_value,2) : "-"}</div>

              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => {
                  // download CSV of history (simple)
                  if (!analysis?.history) return;
                  const rows = analysis.history;
                  const csv = [
                    ["date","close"].join(","),
                    ...rows.map(r => `${r.date},${r.close}`)
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${symbol}_history.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>Download CSV</button>

                <button style={{ marginLeft: 8 }} className="btn" onClick={() => {
                  setSymbol("RELIANCE.NS");
                  setStartDate("01-01-2020");
                  setInvestment("");
                  setAnalysis(null);
                }}>Reset</button>
              </div>
            </div>
          </aside>
        </section>
      </main>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}