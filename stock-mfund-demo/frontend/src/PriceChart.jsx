import React from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend
);

export default function PriceChart({
  stockHistory = [],
  indexes = [],
  normalized = false,
}) {
  if (!stockHistory.length && !indexes.length) {
    return <div>No price data available</div>;
  }

  const normalize = (series) => {
    const base = series[0].close;
    return series.map((p) => ({
      x: p.date,
      y: (p.close / base) * 100,
    }));
  };

  const absolute = (series) =>
    series.map((p) => ({ x: p.date, y: p.close }));

  const datasets = [];

  if (stockHistory.length) {
    datasets.push({
      label: "Stock",
      data: normalized ? normalize(stockHistory) : absolute(stockHistory),
      borderColor: "#2563eb",
      borderWidth: 2,
      pointRadius: 0,
    });
  }

  indexes.forEach((idx, i) => {
    datasets.push({
      label: idx.symbol,
      data: normalized ? normalize(idx.history) : absolute(idx.history),
      borderColor: i === 0 ? "#16a34a" : "#9333ea",
      borderWidth: 2,
      pointRadius: 0,
    });
  });

  return (
    <div style={{ height: 500 }}>
      <Line
        data={{ datasets }}
        options={{
          responsive: true,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { type: "time" },
            y: {
              title: {
                display: true,
                text: normalized ? "Normalized (Base 100)" : "Price",
              },
            },
          },
        }}
      />
    </div>
  );
}