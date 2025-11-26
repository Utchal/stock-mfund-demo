// frontend/src/NewsList.jsx
import React, { useState } from "react";

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d; // fallback to raw string
  return dt.toLocaleString();
}

export default function NewsList({ news = [] }) {
  const [showJson, setShowJson] = useState(false);

  if (!Array.isArray(news) || news.length === 0) {
    return (
      <div style={{ marginTop: 20, fontStyle: "italic" }}>
        No recent news found.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Latest News</h3>
      <ul style={{ paddingLeft: 20 }}>
        {news.map((item, index) => {
          // support both 'pubDate' and 'published', fallback to empty
          const title = item.title || item.titleText || "Untitled";
          const link = item.link || item.url || "#";
          const rawDate = item.pubDate || item.published || item.updated || null;
          return (
            <li key={index} style={{ marginBottom: 12 }}>
              <a href={link} target="_blank" rel="noopener noreferrer">
                {title}
              </a>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {rawDate ? formatDate(rawDate) : ""}
              </div>
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={showJson}
            onChange={(e) => setShowJson(e.target.checked)}
          />{" "}
          Show raw JSON
        </label>
      </div>

      {showJson && (
        <pre
          style={{
            marginTop: 8,
            background: "#f7f7f7",
            padding: 12,
            maxHeight: 260,
            overflow: "auto",
          }}
        >
          {JSON.stringify(news, null, 2)}
        </pre>
      )}
    </div>
  );
}