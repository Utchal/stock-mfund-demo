// frontend/src/App.jsx
import React, { useState, useEffect } from "react";
import PriceChart from "./PriceChart";
import NewsList from "./NewsList";

/*
App.jsx
- Fetches analysis from backend at POST /analysis
- Shows a loading spinner and error messages
- Passes stock history + benchmarks to PriceChart
- Displays news via NewsList
- Provides "Download CSV" button (calls /history_csv)
*/

function formatGeneratedAt(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  } catch {
    return ts;
  }
}

export default function App() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [startDate, setStartDate] = useState("01-01-2020"); // DD-MM-YYYY expected by backend
  const [investment, setInvestment] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [normalizeChart, setNormalizeChart] = useState(true);
  const backendBase = "http://127.0.0.1:8000";

  // Optionally: load last analysis from window (dev convenience)
  useEffect(() => {
    if (window.__lastAnalysis) {
      setAnalysis(window.__lastAnalysis);
    }
  }, []);

  async function runAnalysis() {
    setError(null);
    setAnalysis(null);
    setLoading(true);

    try {
      const payload = {
        symbol: symbol?.trim(),
        start_date: startDate?.trim(),
        investment_amount: investment ? Number(investment) : null,
      };

      const resp = await fetch(`${backendBase}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok) {
        // backend returns an error JSON shape { error: "...", detail: "..." } often
        const detail = data?.detail || data?.error || JSON.stringify(data);
        setError(detail);
        setLoading(false);
        return;
      }

      // Save to window for debugging convenience
      try {
        window.__lastAnalysis = data;
      } catch (e) {
        // ignore if not allowed in some environments
      }

      setAnalysis(data);
    } catch (e) {
      console.error("Analysis error:", e);
      setError(e.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    // backend endpoint expected: /history_csv?symbol=...&start_date=...
    const url = `${backendBase}/history_csv?symbol=${encodeURIComponent(symbol)}&start_date=${encodeURIComponent(
      startDate
    )}`;
    // navigate browser to URL
    window.location.href = url;
  }

  // Defensive helper to extract benchmarks from backend response
  function buildBenchmarksFromAnalysis(a) {
    if (!a) return {};
    // new backend shape: a.benchmarks?.nifty / .sensex
    if (a.benchmarks && (a.benchmarks.nifty || a.benchmarks.sensex)) {
      return {
        nifty: a.benchmarks.nifty || [],
        sensex: a.benchmarks.sensex || [],
      };
    }

    // older/alternate shape: a.index_history or a.index or a.main.index_history
    // try a few places defensively
    if (a.index_history) {
      // assume index_history is the benchmark (nifty) series
      return { nifty: a.index_history || [] };
    }
    if (a.main && a.main.index_history) {
      return { nifty: a.main.index_history || [] };
    }

    // if the backend included a combined history structure with index keys inside main.history,
    // our PriceChart merge logic accepts entries with `index` or `nifty` keys too.
    return {};
  }

  const headlines = analysis?.headlines || [];
  const stockHistory = (analysis && analysis.main && analysis.main.history) || [];
  const benchmarks = buildBenchmarksFromAnalysis(analysis);

  return (
    <div style={{ padding: 25, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 36, marginBottom: 18 }}>Stock & Mutual Fund Analysis — Demo</h1>

      <div style={{ display: "flex", gap: 20, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <label>Symbol</label>
          <br />
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{ padding: 6, width: 220 }}
          />
        </div>

        <div>
          <label>Start Date (DD-MM-YYYY)</label>
          <br />
          <input
            type="text"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: 6, width: 160 }}
          />
        </div>

        <div>
          <label>Investment (optional)</label>
          <br />
          <input
            type="number"
            value={investment}
            onChange={(e) => setInvestment(e.target.value)}
            style={{ padding: 6, width: 140 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={runAnalysis}
            style={{
              padding: "8px 16px",
              height: 42,
              cursor: "pointer",
              marginTop: 18,
              borderRadius: 4,
              border: "2px solid #222",
              background: "#f7f7f7",
            }}
            disabled={loading}
          >
            Analyze
          </button>

          <button
            onClick={downloadCSV}
            style={{ marginTop: 18, marginLeft: 8, background: "none", border: "none", color: "blue", cursor: "pointer" }}
          >
            Download CSV
          </button>
        </div>
      </div>

      {analysis && (
        <div style={{ marginBottom: 10, fontStyle: "italic" }}>
          Results for <b>{analysis.main?.symbol}</b> (as of {formatGeneratedAt(analysis.generated_at)})
        </div>
      )}

      {error && (
        <div style={{ color: "crimson", marginTop: 10 }}>
          <strong>Error:</strong> {String(error)}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 40, fontSize: 20, fontWeight: "bold", color: "#444" }}>
          <span style={{ marginRight: 10 }}>🔄</span> Loading… please wait
        </div>
      )}

      {/* Main result area */}
      {analysis && !loading && (
        <div style={{ display: "flex", gap: 40, marginTop: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 360, background: "#fafafa", padding: 20, borderRadius: 6, border: "1px solid #eee" }}>
            <h2 style={{ marginTop: 0 }}>{analysis.main?.symbol} — Analysis</h2>

            <table style={{ width: "100%", marginTop: 10 }}>
              <tbody>
                <tr>
                  <td><strong>Start Date</strong></td>
                  <td style={{ textAlign: "right" }}>{analysis.main?.start_date}</td>
                </tr>
                <tr>
                  <td><strong>Start Price</strong></td>
                  <td style={{ textAlign: "right" }}>{analysis.main?.start_price}</td>
                </tr>
                <tr>
                  <td><strong>Current Price</strong></td>
                  <td style={{ textAlign: "right" }}>{analysis.main?.current_price}</td>
                </tr>
                <tr>
                  <td><strong>Return %</strong></td>
                  <td style={{ textAlign: "right" }}>{analysis.main?.return_percent}%</td>
                </tr>
                <tr>
                  <td><strong>Annualized %</strong></td>
                  <td style={{ textAlign: "right" }}>{analysis.main?.annualized_return_percent}%</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ marginTop: 24 }}>Preview (first 5 history points)</h3>
            <pre style={{ maxHeight: 200, overflow: "auto", background: "#fff", padding: 12, borderRadius: 4 }}>
              {JSON.stringify((analysis.main?.history || []).slice(0, 5), null, 2)}
            </pre>
          </div>

          <div style={{ flex: 1.1, minWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ marginTop: 0 }}>Price Chart</h2>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={normalizeChart}
                    onChange={(e) => setNormalizeChart(Boolean(e.target.checked))}
                    style={{ marginRight: 6 }}
                  />
                  Normalize to 100
                </label>
              </div>
            </div>

            <div style={{ background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #eee" }}>
              <PriceChart history={stockHistory} benchmarks={benchmarks} normalize={normalizeChart} height={380} />
            </div>
          </div>
        </div>
      )}

      {/* News section */}
      <div style={{ marginTop: 40 }}>
        <NewsList news={headlines} />
      </div>
    </div>
  );
}