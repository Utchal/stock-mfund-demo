// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import PriceChart from "./PriceChart"; // your chart component
import "./styles.css"; // keep this if you have styles in the project

const DEFAULT_SYMBOL = "RELIANCE.NS";
const DEFAULT_START = "01-01-2020";

function formatNumber(v, decimals = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function toCsvString(history) {
  // history is array of {date, close}
  if (!history || !history.length) return "";
  const header = ["date", "close"];
  const rows = history.map((r) => [r.date, r.close]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  return csv;
}

export default function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [investment, setInvestment] = useState(10000);
  const [data, setData] = useState(null); // raw response from backend
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showNormalized, setShowNormalized] = useState(true);
  const [showIndexes, setShowIndexes] = useState(true);

  // Derived pieces used for UI
  const stockSeries = useMemo(() => {
    if (!data || !data.history) return [];
    return data.history.map((p) => ({ date: p.date, close: p.close }));
  }, [data]);

  const indexes = useMemo(() => {
    // The backend returns an "indexes" array (each index has { symbol, history })
    if (!data || !data.indexes) return [];
    return data.indexes.map((ix) => ({
      symbol: ix.symbol,
      history: ix.history || [],
      start_price: ix.start_price,
      current_price: ix.current_price,
    }));
  }, [data]);

  // Summary fields (safe access)
  const startPrice = data?.start_price ?? null;
  const currentPrice = data?.current_price ?? null;
  const returnPct = data?.return_pct ?? null;
  const annualizedPct = data?.annualized_pct ?? null;
  const units = data?.units ?? null;
  const currentValue = data?.current_value ?? null;

  useEffect(() => {
    // initial load
    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const body = {
        symbol: (symbol || "").trim(),
        start_date: startDate,
        investment_amount: investment ? Number(investment) : undefined,
      };
      const resp = await fetch("/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Server error: ${resp.status} ${errText}`);
      }
      const json = await resp.json();
      setData(json);
    } catch (e) {
      console.error("analysis failed", e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!data || !data.history) return;
    const csv = toCsvString(data.history);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${symbol || "analysis"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-root" style={{ padding: 24 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>PriceHound — Stock & Index Preview</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <label>
            Symbol{" "}
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ width: 150 }} />
          </label>

          <label>
            Start{" "}
            <input value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 120 }} />
          </label>

          <label>
            Investment{" "}
            <input
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              style={{ width: 120 }}
              type="number"
            />
          </label>

          <button onClick={analyze} disabled={loading} style={{ padding: "6px 12px" }}>
            {loading ? "Working..." : "Analyze"}
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <span style={{ marginRight: 8 }}>
                Start: {startPrice ? formatNumber(startPrice, 2) : "--"} • Current:{" "}
                {currentPrice ? formatNumber(currentPrice, 2) : "--"} • Return: {returnPct ? formatNumber(returnPct, 2) : "--"}%
              </span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={showNormalized}
                onChange={(e) => setShowNormalized(e.target.checked)}
              />
              Show normalized
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showIndexes} onChange={(e) => setShowIndexes(e.target.checked)} />
              Show index overlays
            </label>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ color: "crimson", marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Chart */}
      <div style={{ background: "#fff", borderRadius: 8, padding: 20, boxShadow: "0 0 0 1px rgba(0,0,0,.03)" }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>
          {symbol?.toUpperCase()} • start {data?.start_date ?? "--"} • start price {startPrice ? formatNumber(startPrice, 2) : "--"} • current{" "}
          {currentPrice ? formatNumber(currentPrice, 2) : "--"}
        </h2>

        <PriceChart
          stock={stockSeries}
          indexes={showIndexes ? indexes : []}
          normalize={showNormalized}
          height={420}
        />

        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "#888" }}>Legend: </span>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <svg width="18" height="8">
                <rect width="18" height="4" fill="#2f72d6" />
              </svg>
              <span>Stock</span>
            </span>
            {indexes && indexes.length > 0 && (
              <>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <svg width="18" height="8">
                    <rect width="18" height="4" fill="#f39c12" />
                  </svg>
                  <span>^NSEI</span>
                </span>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <svg width="18" height="8">
                    <rect width="18" height="4" fill="#2ecc71" />
                  </svg>
                  <span>^BSESN</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Headlines */}
      <div style={{ display: "flex", gap: 24, marginTop: 22, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          {data && data.headlines && data.headlines.length > 0 ? (
            <div style={{ marginBottom: 18 }}>
              <h3>Latest headlines</h3>
              <ul style={{ paddingLeft: 18 }}>
                {data.headlines.map((h, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>
                    <a href={h.link} target="_blank" rel="noopener noreferrer">
                      {h.title}
                    </a>
                    <div style={{ fontSize: 12, color: "#666" }}>{h.published}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              <h3>Latest headlines</h3>
              <div style={{ color: "#666" }}>No headlines</div>
            </div>
          )}
        </div>

        {/* Summary panel */}
        <aside style={{ width: 360 }}>
          <div style={{ background: "#fafafa", padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>Summary</h3>
            <div>
              <div>
                <strong>Symbol:</strong> {symbol}
              </div>
              <div>
                <strong>Start date:</strong> {data?.start_date ?? "--"}
              </div>
              <div>
                <strong>Start price:</strong> {startPrice ? formatNumber(startPrice, 2) : "--"}
              </div>
              <div>
                <strong>Current price:</strong> {currentPrice ? formatNumber(currentPrice, 2) : "--"}
              </div>
              <div>
                <strong>Return:</strong> {returnPct ? `${formatNumber(returnPct, 2)}%` : "--"}
              </div>
              <div>
                <strong>Annualized:</strong> {annualizedPct ? `${formatNumber(annualizedPct, 2)}%` : "--"}
              </div>
              <div>
                <strong>Units (if invested):</strong> {units ? formatNumber(units, 6) : "--"}
              </div>
              <div>
                <strong>Current Value:</strong> {currentValue ? formatNumber(currentValue, 2) : "--"}
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                <button onClick={downloadCsv} disabled={!data || !data.history}>
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    setSymbol(DEFAULT_SYMBOL);
                    setStartDate(DEFAULT_START);
                    setInvestment(10000);
                    setData(null);
                    setError(null);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* History preview table */}
      <section style={{ marginTop: 22 }}>
        <h3>History (last 10)</h3>
        <div style={{ overflowX: "auto", background: "#fff", borderRadius: 8, padding: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "6px 8px" }}>Date</th>
                <th style={{ padding: "6px 8px" }}>Close</th>
                {indexes && indexes.length > 0 && <th style={{ padding: "6px 8px" }}>Index (first)</th>}
              </tr>
            </thead>
            <tbody>
              {(data?.history || []).slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: "8px" }}>{r.date}</td>
                  <td style={{ padding: "8px" }}>{formatNumber(r.close, 2)}</td>
                  {indexes && indexes.length > 0 && (
                    <td style={{ padding: "8px" }}>
                      {indexes[0] && indexes[0].history && indexes[0].history[i]
                        ? formatNumber(indexes[0].history[i].close, 2)
                        : "-"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}