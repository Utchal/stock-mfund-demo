# main.py
"""
Backend for Stock & Mutual Fund Analysis demo.

Endpoints:
- POST /analysis
  Body JSON: { "symbol": "RELIANCE.NS", "start_date": "DD-MM-YYYY", "investment_amount": 10000 }
  Returns JSON with analysis, history, headlines, benchmarks.

- GET /history_csv?symbol=...&start_date=DD-MM-YYYY
  Returns CSV of history for symbol (text/csv).

Notes:
- This file is defensive with respect to yfinance return formats.
- CORS enabled for local dev.
"""
import io
import logging
from datetime import datetime, date
from typing import List, Optional, Dict, Any

import pandas as pd
import yfinance as yf
import feedparser
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger("main")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Stock & Mutual Fund Analysis - Backend")

# Allow CORS from local frontend for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # during dev; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Utility functions -----------------------------------------------------

def parse_dd_mm_yyyy(s: str) -> date:
    """Parse date in DD-MM-YYYY and return datetime.date."""
    try:
        return datetime.strptime(s, "%d-%m-%Y").date()
    except Exception:
        raise ValueError("start_date must be in DD-MM-YYYY format")


def _find_close_column(df: pd.DataFrame):
    """
    Return the DataFrame column object representing the close price, or None.
    Accepts MultiIndex and single-level columns. Matches case-insensitively.
    """
    if df is None or df.empty:
        return None

    cols = df.columns
    # Flatten names for matching
    if isinstance(cols, pd.MultiIndex):
        flat = [" ".join(map(str, c)).strip() for c in cols]
    else:
        flat = [str(c) for c in cols]

    mapping = {flat[i].lower(): cols[i] for i in range(len(flat))}

    # Preferred names
    for candidate in ("close", "adj close", "adjusted close", "close_price", "Close"):
        if candidate.lower() in mapping:
            return mapping[candidate.lower()]

    # any column that contains 'close'
    for name_lower, orig in mapping.items():
        if "close" in name_lower:
            return orig

    # fallback: pick numeric column with most non-null values
    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    if numeric_cols:
        best = max(numeric_cols, key=lambda c: df[c].count())
        return best

    return None


def fetch_history(ticker: str, start_date: date) -> List[Dict[str, Any]]:
    """
    Fetch daily history for `ticker` starting from `start_date`.
    Returns list of dicts: [{'date': 'YYYY-MM-DD', 'close': float}, ...]
    Raises ValueError for clear user-facing errors.
    """
    logger.info("Fetching history for %s from %s", ticker, start_date)
    try:
        # NOTE: yfinance now auto_adjusts by default in recent versions; be explicit if needed.
        df = yf.download(ticker, start=start_date.isoformat(), progress=False, threads=False)
    except Exception as e:
        logger.exception("yfinance download failed for %s", ticker)
        raise ValueError(f"yfinance download failed for {ticker}: {e}")

    if df is None or df.empty:
        raise ValueError(f"No historical data returned for symbol {ticker} from {start_date.isoformat()}")

    # find close-like column
    col = _find_close_column(df)
    if col is None:
        logger.error("fetch_history error for %s: no close-like column. Columns: %s", ticker, list(df.columns))
        raise ValueError(f"No close-like column found for {ticker}. Columns: {list(df.columns)}")

    # coerce and drop NA
    series = pd.to_numeric(df[col], errors="coerce")
    series = series.dropna()
    if series.empty:
        logger.error("fetch_history error for %s: after dropping NA in %s no rows remain", ticker, col)
        raise ValueError(f"No usable price rows for {ticker} in column {col}")

    out = []
    for ts, val in series.items():
        try:
            datestr = ts.strftime("%Y-%m-%d")
        except Exception:
            datestr = str(ts)
        out.append({"date": datestr, "close": float(val)})
    logger.info("Fetched %d rows for %s (col=%s)", len(out), ticker, col)
    return out


def compute_basic_metrics(history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Given history (date-ordered list of {date, close}), return metrics:
    start_date, start_price, current_price, absolute_return, return_percent,
    annualized_return_percent (approx), days, history (unchanged).
    """
    if not history:
        raise ValueError("Empty history")

    # ensure sorted by date ascending
    hist_sorted = sorted(history, key=lambda r: r["date"])
    start = hist_sorted[0]
    end = hist_sorted[-1]
    start_price = float(start["close"])
    current_price = float(end["close"])

    start_date = start["date"]
    current_date = end["date"]

    # days between
    try:
        d0 = datetime.strptime(start_date, "%Y-%m-%d").date()
        d1 = datetime.strptime(current_date, "%Y-%m-%d").date()
        days = (d1 - d0).days or 1
    except Exception:
        days = len(hist_sorted)

    absolute_return = current_price - start_price
    return_percent = (absolute_return / start_price * 100.0) if start_price != 0 else None

    # annualized (simple approximation)
    years = days / 365.25
    try:
        if start_price > 0 and years > 0:
            annualized = ((current_price / start_price) ** (1.0 / years) - 1.0) * 100.0
        else:
            annualized = None
    except Exception:
        annualized = None

    return {
        "start_date": start_date,
        "start_price": start_price,
        "current_price": current_price,
        "absolute_return": absolute_return,
        "return_percent": return_percent,
        "annualized_return_percent": annualized,
        "days": days,
        "history": hist_sorted,
    }


def fetch_headlines_for_symbol(symbol: str, max_items: int = 10) -> List[Dict[str, Any]]:
    """
    Try to fetch news headlines from Google News RSS for the symbol/company.
    This is simple: search Google News RSS for the company ticker - coarse but works for demo.
    """
    # A quick approach: use the 'news' search for the symbol
    # Note: feedparser will accept a Google News RSS query.
    query = f"https://news.google.com/rss/search?q={symbol}"
    try:
        feed = feedparser.parse(query)
    except Exception:
        logger.exception("Failed to fetch headlines for %s", symbol)
        return []

    items = []
    for entry in feed.entries[:max_items]:
        items.append({
            "title": entry.get("title"),
            "link": entry.get("link"),
            "published": entry.get("published"),
        })
    return items


# --- Routes ----------------------------------------------------------------

@app.post("/analysis")
async def analysis(payload: Dict[str, Any]):
    """
    Expected payload:
      { "symbol": "RELIANCE.NS", "start_date": "DD-MM-YYYY", "investment_amount": 10000 }
    """
    try:
        symbol = payload.get("symbol")
        start_date_str = payload.get("start_date")
        investment_amount = payload.get("investment_amount", None)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if not symbol or not start_date_str:
        raise HTTPException(status_code=400, detail="symbol and start_date are required")

    # parse start_date
    try:
        start_dt = parse_dd_mm_yyyy(start_date_str)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Main symbol history
    try:
        history = fetch_history(symbol, start_dt)
    except ValueError as e:
        # 400 error for user-facing problems
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error fetching history for %s", symbol)
        raise HTTPException(status_code=500, detail=f"Unexpected error fetching data: {e}")

    # Optional benchmarks: Nifty 50 and Sensex (NSE symbols commonly used)
    index_history = {}
    # Common tickers for Indian indices in Yahoo Finance:
    # NIFTY 50 often '^NSEI' or '^NIFTYIT' etc; BSE Sensex '^BSESN'
    try:
        nifty = None
        try:
            nifty = fetch_history("^NSEI", start_dt)
        except Exception:
            # fallback attempts (some yfinance setups need ^NIFTYBE or others; ignore on failure)
            nifty = None
        if nifty:
            index_history["nifty"] = nifty
    except Exception:
        logger.debug("Ignoring nifty fetch failure", exc_info=True)

    try:
        sensex = None
        try:
            sensex = fetch_history("^BSESN", start_dt)
        except Exception:
            sensex = None
        if sensex:
            index_history["sensex"] = sensex
    except Exception:
        logger.debug("Ignoring sensex fetch failure", exc_info=True)

    # Compute metrics
    metrics = compute_basic_metrics(history)

    # investment math
    units = None
    current_value = None
    if investment_amount not in (None, "", "null"):
        try:
            inv = float(investment_amount)
            if metrics["start_price"] and metrics["start_price"] > 0:
                units = inv / metrics["start_price"]
                current_value = units * metrics["current_price"]
        except Exception:
            units = None
            current_value = None

    # Headline retrieval (best-effort)
    headlines = []
    try:
        headlines = fetch_headlines_for_symbol(symbol, max_items=12)
    except Exception:
        headlines = []

    resp = {
        "main": {
            "symbol": symbol,
            "start_date": metrics["start_date"],
            "start_price": metrics["start_price"],
            "current_price": metrics["current_price"],
            "absolute_return": metrics["absolute_return"],
            "return_percent": f"{metrics['return_percent']:.6f}%" if metrics["return_percent"] is not None else None,
            "annualized_return_percent": f"{metrics['annualized_return_percent']:.6f}%" if metrics["annualized_return_percent"] is not None else None,
            "days": metrics["days"],
            "history": metrics["history"],
        },
        "units": round(units, 6) if units is not None else None,
        "current_value": round(current_value, 2) if current_value is not None else None,
        "headlines": headlines,
        "generated_at": datetime.utcnow().isoformat(),
    }

    # attach index histories if found
    if index_history:
        resp["benchmarks"] = index_history

    return JSONResponse(resp)


@app.get("/history_csv")
async def history_csv(symbol: str, start_date: str):
    """
    Return a CSV for the requested symbol and start_date (DD-MM-YYYY).
    """
    try:
        start_dt = parse_dd_mm_yyyy(start_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        hist = fetch_history(symbol, start_dt)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error fetching history CSV for %s", symbol)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

    # create CSV in memory
    df = pd.DataFrame(hist)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    filename = f"{symbol.replace('/', '_')}_history_{start_date}.csv"
    return StreamingResponse(io.BytesIO(buf.getvalue().encode("utf-8")), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


# Simple health-check
@app.get("/health")
async def health():
    return {"status": "ok"}


# If run directly with uvicorn inside container:
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="info")