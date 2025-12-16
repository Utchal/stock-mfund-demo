import { useState } from "react";

const API_URL = "http://localhost:8000/analysis";

function App() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [startDate, setStartDate] = useState("03-01-2020");
  const [investment, setInvestment] = useState(10000);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runAnalysis = async () => {
    console.log("RUN BUTTON CLICKED");

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: symbol,
          start_date: startDate,
          investment: Number(investment),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text);
      }

      const data = await response.json();
      console.log("API RESULT:", data);
      setResult(data);
    } catch (err) {
      console.error("API ERROR:", err);
      setError("Failed to fetch data from backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      {/* DEBUG MARKER — confirms correct App.jsx */}
      <h2 style={{ color: "red" }}>APP FILE ACTIVE</h2>

      <h1>Stock Analyzer</h1>

      <div style={{ marginBottom: 16 }}>
        <label>Symbol </label>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ marginRight: 8 }}
        />

        <label>Start Date </label>
        <input
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="DD-MM-YYYY"
          style={{ marginRight: 8 }}
        />

        <label>Investment ₹ </label>
        <input
          type="number"
          value={investment}
          onChange={(e) => setInvestment(e.target.value)}
          style={{ marginRight: 8 }}
        />

        <button onClick={runAnalysis} disabled={loading}>
          {loading ? "Running..." : "Run"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <h2>Summary</h2>

          <p><strong>Symbol:</strong> {result.symbol}</p>
          <p><strong>Start price:</strong> ₹{result.start_price}</p>
          <p><strong>Current price:</strong> ₹{result.current_price}</p>
          <p><strong>Return:</strong> {result.return_pct}%</p>
          <p><strong>Annualized:</strong> {result.annualized_pct}%</p>
          <p><strong>Current Value:</strong> ₹{result.current_value}</p>

          <h3 style={{ marginTop: 20 }}>Raw API Response</h3>
          <pre
            style={{
              background: "#f4f4f4",
              padding: 12,
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;