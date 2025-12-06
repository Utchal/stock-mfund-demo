// frontend/src/PriceChart.jsx
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

/**
 * PriceChart.jsx
 *
 * Props:
 *  - history: array of { date: "YYYY-MM-DD", close: number }  <-- stock series
 *  - indexHistory: optional array of { date, close }            <-- index / benchmark
 *  - overlayIndex: boolean (default true)                      <-- whether to show index
 *
 * Produces a merged series with both 'stock' and 'index' keys and
 * renders two lines with separate Y axes (index on the right).
 */

function formatDateLabel(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  } catch (e) {
    return d;
  }
}

function isoDateString(d) {
  // Accept either Date or string; return YYYY-MM-DD
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return d;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function PriceChart({
  history = [],
  indexHistory = [],
  overlayIndex = true,
}) {
  // Build merged array with {date, stock, index} -- date ascending
  const merged = useMemo(() => {
    // helper to accept multiple input shapes
    const normArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map((r) => {
        // r might be {date, close}, or {date, stock, index}, or {dt, close}, or {x, close}
        const dateRaw = r.date ?? r.dt ?? r.x ?? r[0] ?? null;
        const date = dateRaw ? isoDateString(dateRaw) : null;
        // Accept close, Close, adjclose, adjClose etc
        const close =
          r.close ??
          r.Close ??
          r.adjClose ??
          r["Adj Close"] ??
          r.adj_close ??
          r.adjclose;
        // Accept named keys
        const stock = r.stock;
        const index = r.index;
        return { date, close, stock, index };
      });
    };

    const stockArr = normArray(history);
    const idxArr = normArray(indexHistory);

    // If `history` appears to already contain both stock & index (look at first item)
    const sample = stockArr.length > 0 ? stockArr[0] : null;
    let containsBoth = false;
    if (sample && (sample.stock !== undefined || sample.index !== undefined)) {
      containsBoth = true;
    }

    const map = new Map();

    const push = (arr, keyFrom, keyTo) => {
      for (const item of arr) {
        if (!item || !item.date) continue;
        const d = item.date;
        const existing = map.get(d) || { date: d };
        // prefer explicit stock/index if present
        if (keyTo === "stock") {
          // derive value: prefer item.stock then item.close
          const val = item.stock ?? item.close ?? null;
          existing.stock = val !== undefined ? val : existing.stock;
        } else if (keyTo === "index") {
          const val = item.index ?? item.close ?? null;
          existing.index = val !== undefined ? val : existing.index;
        }
        map.set(d, existing);
      }
    };

    if (containsBoth) {
      // history already has both keys
      push(stockArr, "close", "stock"); // this will set stock using stock/close
      // if index present in same history entries, it was set above via sample detection +
      // item.index assignment in normArray; ensure index from history pushed too:
      // push again treating history elements' index values
      for (const it of stockArr) {
        if (!it.date) continue;
        const ex = map.get(it.date) || { date: it.date };
        if (it.index !== undefined) ex.index = it.index;
        map.set(it.date, ex);
      }
    } else {
      // treat history as stock series, indexHistory as index series
      push(stockArr, "close", "stock");
      push(idxArr, "close", "index");
    }

    // Now ensure that every date has both keys (may be null)
    const dates = Array.from(map.keys()).sort();
    const arr = dates.map((d) => {
      const e = map.get(d) || { date: d };
      return {
        date: d,
        stock: e.stock !== undefined ? e.stock : null,
        index: e.index !== undefined ? e.index : null,
      };
    });

    return arr;
  }, [history, indexHistory]);

  if (!merged || merged.length === 0) {
    return (
      <div style={{ minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        No series available to render chart.
      </div>
    );
  }

  // detect whether we have non-null index values
  const hasIndex = overlayIndex && merged.some((d) => d.index !== null && d.index !== undefined);

  return (
    <div style={{ width: "100%", height: 420 }}>
      <ResponsiveContainer>
        <LineChart data={merged} margin={{ top: 12, right: 50, left: 20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatDateLabel} minTickGap={20} />
          <YAxis yAxisId="left" allowDecimals={true} />
          {hasIndex && <YAxis yAxisId="right" orientation="right" allowDecimals={true} />}
          <Tooltip
            labelFormatter={(lab) => {
              try {
                return new Date(lab).toLocaleString();
              } catch {
                return lab;
              }
            }}
            formatter={(value, name) => {
              if (value === null || value === undefined) return ["—", name];
              if (typeof value === "number") return [value.toFixed(2), name];
              return [String(value), name];
            }}
          />
          <Legend verticalAlign="bottom" height={36} />

          {/* Render index first (behind) */}
          {hasIndex && (
            <Line
              type="monotone"
              dataKey="index"
              stroke="#ff8a00"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={true}
              name="Index"
              yAxisId="right"
            />
          )}

          {/* Stock line on left axis */}
          <Line
            type="monotone"
            dataKey="stock"
            stroke="#2f86f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={true}
            name="Stock"
            yAxisId="left"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}