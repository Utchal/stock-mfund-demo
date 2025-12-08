import React, { useMemo } from "react";
import { Chart, Line } from "react-chartjs-2";
import {
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// register scales & elements we use
Chart.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Title, Tooltip, Legend);

function toSeries(history) {
  // history expected [{date: "YYYY-MM-DD", close: number}, ...]
  return history.map(h => ({ x: h.date, y: Number(h.close) }));
}

export default function PriceChart({ history = [], indexes = [], viewMode = "normalized", showOverlays = true }) {
  // main stock series
  const stockSeries = useMemo(() => toSeries(history), [history]);

  // build index series list (each index is {symbol, history: [{date, close}, ...], start_price, current_price, history_points})
  const indexSeries = useMemo(() => {
    return (indexes || []).map(idx => ({ symbol: idx.symbol, series: toSeries(idx.history || []) }));
  }, [indexes]);

  // compute normalized series: base = first value (on start)
  const normalizedStock = useMemo(() => {
    if (!stockSeries.length) return [];
    const base = stockSeries[0].y || 1;
    return stockSeries.map(p => ({ x: p.x, y: (p.y / base) * 100 }));
  }, [stockSeries]);

  const normalizedIndexes = useMemo(() => {
    if (!indexSeries.length) return [];
    return indexSeries.map(idx => {
      if (!idx.series.length) return { symbol: idx.symbol, series: [] };
      const base = idx.series[0].y || 1;
      return { symbol: idx.symbol, series: idx.series.map(p => ({ x: p.x, y: (p.y / base) * 100 })) };
    });
  }, [indexSeries]);

  // datasets for chartjs
  const datasets = useMemo(() => {
    const ds = [];

    if (viewMode === "normalized") {
      // stock normalized
      ds.push({
        label: "Stock",
        data: normalizedStock,
        borderColor: "#2f6bd8",
        backgroundColor: "rgba(47,107,216,0.08)",
        pointRadius: 2,
        borderWidth: 2,
        tension: 0.12,
      });

      if (showOverlays) {
        const palette = ["#f39c12", "#2ecc71", "#e74c3c", "#8e44ad"];
        normalizedIndexes.forEach((idx, i) => {
          ds.push({
            label: idx.symbol || `Index ${i+1}`,
            data: idx.series,
            borderColor: palette[i % palette.length],
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.12,
          });
        });
      }
    } else {
      // Absolute view: show stock on left axis, indexes on right axis
      ds.push({
        label: "Stock",
        data: stockSeries,
        borderColor: "#2f6bd8",
        backgroundColor: "rgba(47,107,216,0.08)",
        yAxisID: "y-left",
        pointRadius: 2,
        borderWidth: 2,
        tension: 0.12,
      });

      if (showOverlays) {
        const palette = ["#f39c12", "#2ecc71", "#e74c3c", "#8e44ad"];
        indexSeries.forEach((idx, i) => {
          ds.push({
            label: idx.symbol || `Index ${i+1}`,
            data: idx.series,
            borderColor: palette[i % palette.length],
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.12,
            yAxisID: "y-right",
          });
        });
      }
    }

    return ds;
  }, [viewMode, normalizedStock, normalizedIndexes, stockSeries, indexSeries, showOverlays]);

  // x labels will be time-based; Chart.js time scale requires a time adapter if using native time parsing.
  // To avoid requiring an adapter install in all environments we provide string x values and use CategoryScale with label rotation.
  // However, TimeScale works fine if your build included chartjs-adapter-date-fns; many projects already have it.
  // We're going to configure the x scale as 'time' and pass string dates - Chart.js can parse ISO strings when adapter present.
  const data = useMemo(() => ({ datasets }), [datasets]);

  const options = useMemo(() => {
    return {
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 14, boxHeight: 8, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const val = context.parsed.y;
              return `${context.dataset.label}: ${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            parser: "YYYY-MM-DD",
            tooltipFormat: "ll",
            unit: "month",
            displayFormats: { month: "MMM YYYY" },
          },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          grid: { display: false },
        },
        "y-left": {
          type: "linear",
          position: "left",
          beginAtZero: false,
          grid: { drawOnChartArea: true },
          title: { display: viewMode === "normalized", text: viewMode === "normalized" ? "Normalized (start=100)" : "Stock (price)" },
        },
        "y-right": {
          type: "linear",
          position: "right",
          beginAtZero: false,
          grid: { display: false },
          // Only used in absolute mode for indexes
          title: { display: viewMode === "absolute", text: "Index (price)" },
        },
      },
    };
  }, [viewMode]);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Line data={data} options={options} />
    </div>
  );
}