// PriceChart.jsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/*
Props:
 - history: [{date: "YYYY-MM-DD", close: number}, ...]   // stock series
 - benchmarks: { nifty?: [{date, close}], sensex?: [{date, close}] }
 - normalize: boolean (default true) -> normalize each series to 100 at its first datapoint
 - height: optional (default 380)
*/

function fmtDateLabel(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  } catch {
    return d;
  }
}

function mergeSeries(stock = [], benchmarks = {}) {
  // Build map keyed by date with stock/index closes
  const map = new Map();
  const push = (arr, keyName) => {
    if (!Array.isArray(arr)) return;
    for (const r of arr) {
      const date = r.date || r.dt || r.x;
      if (!date) continue;
      const e = map.get(date) || { date };
      if (r.close !== undefined) e[keyName] = r.close;
      if (r.stock !== undefined) e.stock = r.stock;
      if (r.index !== undefined) e.index = r.index;
      map.set(date, e);
    }
  };

  push(stock, "stock");
  if (benchmarks.nifty) push(benchmarks.nifty, "nifty");
  if (benchmarks.sensex) push(benchmarks.sensex, "sensex");

  const arr = Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  return arr;
}

function normalizeSeries(data, keys = ["stock", "nifty", "sensex"]) {
  // create a copy and normalize each key so first non-null value becomes 100
  const first = {};
  for (const k of keys) first[k] = null;

  for (const row of data) {
    for (const k of keys) {
      if (first[k] === null && row[k] != null) first[k] = row[k];
    }
    // if all found, break early
    if (Object.values(first).every((v) => v !== null)) break;
  }

  // produce normalized copy
  return data.map((row) => {
    const r = { ...row };
    for (const k of keys) {
      if (r[k] != null && first[k] != null && first[k] !== 0) {
        r[`${k}_norm`] = (r[k] / first[k]) * 100;
      } else {
        r[`${k}_norm`] = null;
      }
    }
    return r;
  });
}

export default function PriceChart({ history = [], benchmarks = {}, normalize = true, height = 380 }) {
  const merged = useMemo(() => mergeSeries(history, benchmarks), [history, benchmarks]);
  if (!merged || merged.length === 0) {
    return (
      <div style={{ minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        No series available to render chart.
      </div>
    );
  }

  // choose keys we might plot
  const hasStock = merged.some((d) => d.stock != null);
  const hasNifty = merged.some((d) => d.nifty != null);
  const hasSensex = merged.some((d) => d.sensex != null);

  // normalized data (if requested) - adds stock_norm, nifty_norm, sensex_norm
  const plotted = useMemo(() => {
    if (!normalize) return merged;
    return normalizeSeries(merged, ["stock", "nifty", "sensex"]);
  }, [merged, normalize]);

  // keys to use depending on normalize toggle
  const stockKey = normalize ? "stock_norm" : "stock";
  const niftyKey = normalize ? "nifty_norm" : "nifty";
  const sensexKey = normalize ? "sensex_norm" : "sensex";

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={plotted} margin={{ top: 12, right: 30, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDateLabel} minTickGap={30} />
          <YAxis allowDecimals />
          <Tooltip formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)} />
          <Legend verticalAlign="bottom" height={36} />

          {hasNifty && (
            <Line
              type="monotone"
              dataKey={niftyKey}
              stroke="#FF8A00"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={true}
              name={normalize ? "Nifty (index, normalized)" : "Nifty"}
            />
          )}

          {hasSensex && (
            <Line
              type="monotone"
              dataKey={sensexKey}
              stroke="#AA00CC"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={true}
              name={normalize ? "Sensex (index, normalized)" : "Sensex"}
            />
          )}

          {hasStock && (
            <Line
              type="monotone"
              dataKey={stockKey}
              stroke="#2F86F6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={true}
              name={normalize ? "Stock (normalized)" : "Stock"}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}