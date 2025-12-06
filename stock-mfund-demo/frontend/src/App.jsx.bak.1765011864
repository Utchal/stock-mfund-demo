// App.jsx
import React, { useEffect, useState, useRef } from "react";
import Plot from "react-plotly.js";
import "./styles.css";

/*
  App.jsx - Stock + Index viewer
  - Adds Index selector dropdown (None, ^NSEI, ^BSESN)
  - Plots Stock and selected Index (index plotted on secondary y-axis when not normalized)
  - Normalize to 100 option available
  - Handles multiple shapes of backend response:
      - result.history  (stock history list)
      - result.indices (array of { symbol, history: [...] })
    Older variants: result.indexes or result.indicesMap are also checked.
*/

function parseHistory(list) {
  // input: [{date: "2020-01-01", close: 123.45}, ...]
  if (!Array.isArray(list)) return { x: [], y: [] };
  const x = list.map((r) => r.date);
  const y = list.map((r) => r.close);
  return { x, y };
}

export default function App() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [start, setStart] = useState("01-01-2020");
  const [invest, setInvest] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState("^NSEI");
  const [normalize, setNormalize] = useState(true);
  const [error, setError] = useState(null);

  const indexOptions = [
    { label: "None", value: "None" },
    { label: "Nifty 50 (^NSEI)", value: "^NSEI" },
    { label: "Sensex (^BSESN)", value: "^BSESN" },
  ];

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        symbol: symbol,
        start_date: start,
        investment_amount: invest ? Number(invest) : undefined,
      };

      // try local backend first (port 8000).
      // If frontend reverse proxy is used, you may change endpoint.
      const resp = await fetch("http://127.0.0.1:8000/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Server error ${resp.status}: ${text}`);
      }

      const data = await resp.json();
      setResult(data);

      // If backend returned multiple indices, and user has default selectedIndex,
      // keep selectedIndex if available, otherwise set to first available index.
      const indices = gatherIndicesFromResult(data);
      if (indices.length > 0) {
        const found = indices.find((i) => i.symbol === selectedIndex);
        if (!found) {
          // choose first available
          setSelectedIndex(indices[0].symbol);
        }
      }
    } catch (err) {
      console.error("fetchAnalysis error", err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // collect indices from various possible response shapes
  function gatherIndicesFromResult(res) {
    if (!res) return [];
    // prefer standardized names: result.indices (array)
    if (Array.isArray(res.indices)) return res.indices.map((x) => ({ symbol: x.symbol, history: x.history }));
    if (Array.isArray(res.indexes)) return res.indexes.map((x) => ({ symbol: x.symbol, history: x.history }));
    if (Array.isArray(res.indicesMap)) {
      return res.indicesMap; // assume already shape [{symbol, history}]
    }
    // Some older returned "indices" as nested in result (e.g. result.indices = [{symbol, history}])
    // If backend included the index's history as separate key like res.indexHistory or res.index, try both:
    if (res.index && res.index.history) return [{ symbol: res.index.symbol || "INDEX", history: res.index.history }];
    // fallback: if result contains keys that look like index symbols (e.g., ^NSEI)
    const detected = [];
    Object.keys(res).forEach((k) => {
      if (k === "history") return;
      if (k.startsWith("^") || k.toUpperCase().includes("NSE") || k.toUpperCase().includes("BSE")) {
        const val = res[k];
        if (val && Array.isArray(val.history)) {
          detected.push({ symbol: k, history: val.history });
        }
      }
    });
    return detected;
  }

  // Prepare traces for Plotly
  function makeTraces() {
    if (!result) return [];
    // stock history is expected in result.history (array)
    const stockHist = result.history || result.history_stock || (result.stock ? result.stock.history : null);
    const stockSeries = parseHistory(stockHist || []);

    // Get indices collection
    const indices = gatherIndicesFromResult(result);

    // find selectedIndex series if present
    let indexSeries = { x: [], y: [] };
    if (selectedIndex && selectedIndex !== "None") {
      // find in indices list
      const found = indices.find((it) => it.symbol === selectedIndex);
      if (found && found.history) indexSeries = parseHistory(found.history);
      else {
        // maybe backend returned index under result.indicesMap[selectedIndex]
        if (result.indicesMap && result.indicesMap[selectedIndex]) {
          indexSeries = parseHistory(result.indicesMap[selectedIndex].history || []);
        }
      }
    }

    // If normalize requested, convert both series to index=100 at first visible point
    if (normalize) {
      const baseStock = stockSeries.y && stockSeries.y.length ? stockSeries.y[0] : null;
      const baseIndex = indexSeries.y && indexSeries.y.length ? indexSeries.y[0] : null;
      const sY = baseStock ? stockSeries.y.map((v) => (v / baseStock) * 100) : [];
      const iY = baseIndex ? indexSeries.y.map((v) => (v / baseIndex) * 100) : [];
      const stockTrace = {
        x: stockSeries.x,
        y: sY,
        name: "Stock",
        mode: "lines",
        line: { shape: "spline", smoothing: 0.5 },
        hovertemplate: "%{x}<br>Stock: %{y:.2f}<extra></extra>",
        yaxis: "y",
      };
      const traces = [stockTrace];
      if (selectedIndex && selectedIndex !== "None" && iY.length) {
        traces.push({
          x: indexSeries.x,
          y: iY,
          name: "Index",
          mode: "lines",
          line: { shape: "spline", smoothing: 0.5, dash: "dash", width: 2, color: "#ff7f0e" },
          hovertemplate: "%{x}<br>Index: %{y:.2f}<extra></extra>",
          yaxis: "y",
        });
      }
      return traces;
    } else {
      // not normalized -> use secondary y-axis for index (y2)
      const stockTrace = {
        x: stockSeries.x,
        y: stockSeries.y,
        name: "Stock",
        mode: "lines",
        line: { shape: "spline", smoothing: 0.5 },
        hovertemplate: "%{x}<br>Stock: %{y:.2f}<extra></extra>",
        yaxis: "y",
      };
      const traces = [stockTrace];
      if (selectedIndex && selectedIndex !== "None" && indexSeries.y.length) {
        traces.push({
          x: indexSeries.x,
          y: indexSeries.y,
          name: "Index",
          mode: "lines",
          line: { shape: "spline", smoothing: 0.5, dash: "dash", width: 2, color: "#ff7f0e" },
          hovertemplate: "%{x}<br>Index: %{y:.2f}<extra></extra>",
          yaxis: "y2",
        });
      }
      return traces;
    }
  }

  // layout for Plotly
  function makeLayout() {
    const baseLayout = {
      margin: { t: 20, r: 60, b: 60, l: 60 },
      legend: { orientation: "h", xanchor: "center", x: 0.5, y: -0.15 },
      xaxis: { tickformat: "%b %Y", showgrid: true },
      yaxis: { title: "", showgrid: true },
      height: 420,
      plot_bgcolor: "#ffffff",
      paper_bgcolor: "#ffffff",
    };

    if (!normalize) {
      // if index exists we provide a y2 axis on right
      baseLayout.yaxis2 = {
        overlaying: "y",
        side: "right",
        title: "",
        showgrid: false,
      };
    }
    return baseLayout;
  }

  const traces = makeTraces();
  const layout = makeLayout();

  // Utilities to show header metrics in top-right small summary
  function topSummary() {
    if (!result) return "";
    const startP = result.start_price || "-";
    const currentP = result.current_price || "-";
    const ret = result.return_pct ? `${Number(result.return_pct).toFixed(1)}%` : "-";
    return `Start: ${startP} • Current: ${currentP} • Return: ${ret}`;
  }

  // on first load, fetch automatically
  useEffect(() => {
    fetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // index options shown depend on what backend returned
  const availableIndices = (() => {
    const defaultList = indexOptions;
    if (!result) return defaultList;
    const indicesFromBackend = gatherIndicesFromResult(result);
    if (!indicesFromBackend || !indicesFromBackend.length) return defaultList;
    // build option list from what backend returned
    const built = [{ label: "None", value: "None" }, ...indicesFromBackend.map((i) => ({ label: i.symbol, value: i.symbol }))];
    return built;
  })();

  return (
    <div style={{ padding: 18, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>Stock + Index Viewer</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label>
          Symbol
          <input style={{ marginLeft: 6, padding: 8 }} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </label>

        <label>
          Start
          <input style={{ marginLeft: 6, padding: 8 }} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>

        <label>
          Invest ₹
          <input style={{ marginLeft: 6, padding: 8, width: 110 }} value={invest} onChange={(e) => setInvest(e.target.value)} />
        </label>

        <button onClick={fetchAnalysis} style={{ padding: "10px 14px" }}>
          {loading ? "Loading..." : "Run"}
        </button>

        <div style={{ marginLeft: "auto", color: "#444", alignSelf: "center" }}>{topSummary()}</div>
      </div>

      <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Results for <em>{symbol}</em> {result && result.generated_at ? `(as of ${result.generated_at})` : ""}</div>

          <div style={{ background: "#fafafa", borderRadius: 6, padding: 18, minHeight: 220 }}>
            <h2 style={{ marginTop: 0 }}>{symbol} — Summary</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 6 }}>
              <div>Start Date</div><div style={{ textAlign: "right" }}>{result ? result.start_date : "-"}</div>
              <div>Start Price</div><div style={{ textAlign: "right" }}>{result ? result.start_price : "-"}</div>
              <div>Current Price</div><div style={{ textAlign: "right" }}>{result ? result.current_price : "-"}</div>
              <div>Return %</div><div style={{ textAlign: "right" }}>{result ? (result.return_pct !== undefined ? `${Number(result.return_pct).toFixed(1)}%` : "-") : "-"}</div>
              <div>Annualized %</div><div style={{ textAlign: "right" }}>{result ? (result.annualized_pct !== undefined ? `${Number(result.annualized_pct).toFixed(1)}%` : "-") : "-"}</div>
              <div>Days</div><div style={{ textAlign: "right" }}>{result ? (result.history_points || "-") : "-"}</div>
              <div>Units (if invested)</div><div style={{ textAlign: "right" }}>{result ? (result.units ? Number(result.units).toFixed(6) : "-") : "-"}</div>
              <div>Current Value</div><div style={{ textAlign: "right" }}>{result ? (result.current_value ? Number(result.current_value).toFixed(2) : "-") : "-"}</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ marginTop: 0 }}>Price Chart</h2>
            <div>
              <label style={{ marginRight: 8 }}>
                Index:
                <select value={selectedIndex} onChange={(e) => setSelectedIndex(e.target.value)} style={{ marginLeft: 8 }}>
                  {availableIndices.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>

              <label style={{ marginLeft: 12 }}>
                <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> Normalize to 100
              </label>
            </div>
          </div>

          <div style={{ borderRadius: 8, background: "#fff", padding: 12 }}>
            {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
            <Plot
              data={traces}
              layout={layout}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: "100%" }}
            />
            <div style={{ textAlign: "center", marginTop: 6, color: "#2b6cb0", fontWeight: 600 }}>
              <span style={{ marginRight: 10 }}>◌</span> Stock &nbsp;&nbsp;
              {selectedIndex && selectedIndex !== "None" && <span style={{ color: "#ff7f0e", marginLeft: 12 }}>◌</span>} Index
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h3>Latest News</h3>
        <ul>
          {result && result.headlines && result.headlines.length > 0 ? result.headlines.map((h, i) => (
            <li key={i}><a href={h.link} target="_blank" rel="noreferrer">{h.title}</a><div style={{ fontSize: 12, color: "#666" }}>{h.published}</div></li>
          )) : <li>No recent news found.</li>}
        </ul>
      </div>
    </div>
  );
}