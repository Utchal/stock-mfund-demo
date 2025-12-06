// src/PriceChart.jsx
import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend
);

/**
 * Align series by date and optionally normalize them (start = 100).
 * Input:
 *   stock: [{date: "YYYY-MM-DD", close: number}, ...]
 *   indexes: [{symbol, history: [{date, close}, ...]}, ...]
 */
function alignSeries(primary, others = []) {
  // build set of all dates (use primary's dates as baseline for plotting)
  const dateSet = new Set(primary.map((r) => r.date));
  // ensure other dates are included (so indexes don't truncate)
  others.forEach((ix) => ix.history.forEach((r) => dateSet.add(r.date)));
  const dates = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));

  const mapSeries = (arr) => {
    const m = new Map(arr.map((r) => [r.date, r.close]));
    return dates.map((d) => (m.has(d) ? m.get(d) : null));
  };

  const primaryVals = mapSeries(primary);
  const otherVals = others.map((ix) => ({ symbol: ix.symbol, vals: mapSeries(ix.history) }));

  return { dates, primaryVals, otherVals };
}

function normalizeArray(arr) {
  // find first non-null
  const idx = arr.findIndex((v) => v !== null && v !== undefined);
  if (idx === -1) return arr.map(() => null);
  const start = arr[idx];
  if (!start || start === 0) return arr.map(() => null);
  return arr.map((v) => (v === null || v === undefined ? null : (v / start) * 100));
}

function buildDatasets(dates, primaryVals, otherVals, normalize) {
  const datasets = [];

  const pVals = normalize ? normalizeArray(primaryVals) : primaryVals;
  datasets.push({
    label: "Stock",
    data: dates.map((d, i) => ({ x: d, y: pVals[i] })),
    borderColor: "#2f72d6",
    backgroundColor: "rgba(47,114,214,0.06)",
    pointRadius: 0.5,
    tension: 0.15,
  });

  const palette = ["#f39c12", "#2ecc71", "#9b59b6", "#e74c3c"];
  otherVals.forEach((ix, idx) => {
    const vals = normalize ? normalizeArray(ix.vals) : ix.vals;
    datasets.push({
      label: ix.symbol,
      data: dates.map((d, i) => ({ x: d, y: vals[i] })),
      borderColor: palette[idx % palette.length],
      backgroundColor: "transparent",
      borderDash: [6, 4],
      pointRadius: 0,
      tension: 0.15,
      yAxisID: normalize ? "y" : `y${idx > 0 ? idx + 1 : ""}`, // allow multiple axes if absolute
    });
  });

  return datasets;
}

export default function PriceChart({ stock = [], indexes = [], normalize = true, height = 420 }) {
  const { dates, primaryVals, otherVals } = useMemo(() => alignSeries(stock, indexes), [stock, indexes]);

  const datasets = useMemo(() => buildDatasets(dates, primaryVals, otherVals, normalize), [dates, primaryVals, otherVals, normalize]);

  // Determine right-side axis if not normalized (absolute indexes typically have much larger scale)
  const options = useMemo(() => {
    const base = {
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        x: {
          type: "time",
          time: { unit: "month", tooltipFormat: "yyyy-MM-dd" },
          ticks: { autoSkip: true, maxTicksLimit: 18 },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
        y: {
          beginAtZero: true,
          position: "left",
          grid: { color: "rgba(0,0,0,0.06)" },
          title: {
            display: !!normalize,
            text: normalize ? "Normalized (start=100)" : undefined,
          },
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { mode: "index", intersect: false },
      },
    };

    // if not normalized and we have >0 indexes, add right y-axis for indexes
    if (!normalize && indexes && indexes.length > 0) {
      base.scales["yRight"] = {
        position: "right",
        grid: { drawOnChartArea: false },
        beginAtZero: false,
      };
    }

    return base;
  }, [normalize, indexes]);

  const data = { datasets };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}