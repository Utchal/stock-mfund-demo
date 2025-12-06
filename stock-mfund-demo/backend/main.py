# main.py
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import yfinance as yf
import requests
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(title="Stock & Index Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisRequest(BaseModel):
    symbol: str
    start_date: str  # accepts multiple formats
    investment_amount: Optional[float] = None


def parse_start_date(s: str) -> date:
    """Try multiple common date formats; return a date object or raise ValueError."""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            continue
    raise ValueError(f"Invalid start_date format: {s}. Accepts YYYY-MM-DD or DD-MM-YYYY")


def fetch_history(ticker: str, start_date: date) -> pd.DataFrame:
    """
    Fetch historical data using yfinance.
    Returns a DataFrame (may be empty) or raises ValueError on failure.
    """
    try:
        logger.info("Fetching %s from yfinance starting %s", ticker, start_date.isoformat())
        df = yf.download(ticker, start=start_date.isoformat(), progress=False, threads=False, auto_adjust=False)
    except Exception as e:
        logger.exception("yfinance download error for %s", ticker)
        raise ValueError(f"yfinance download error for {ticker}: {e}")

    if df is None or df.empty:
        raise ValueError(f"No price data returned for {ticker}")

    return df


def extract_close_series(df: pd.DataFrame) -> Optional[pd.Series]:
    """
    Return a pd.Series of close prices (index=Date, name='close').
    Works with multiindex columns (from yfinance) and single-level columns.
    """
    if df is None or df.empty:
        return None

    # If columns are tuples (multiindex), convert to single strings
    new_cols = []
    for c in df.columns:
        if isinstance(c, tuple):
            joined = "|".join([str(x) for x in c if x is not None and str(x) != ""])
            new_cols.append(joined)
        else:
            new_cols.append(str(c))
    df = df.copy()
    df.columns = new_cols

    # Build map of lowercase->original name (normalize)
    col_map = {c.lower().replace(" ", "").replace("-", ""): c for c in df.columns}

    # Prefer Adj Close variants
    adj_candidates = [orig for k, orig in col_map.items() if "adj" in k and "close" in k]
    if not adj_candidates:
        adj_candidates = [orig for k, orig in col_map.items() if "adj" in k]
    if adj_candidates:
        col = adj_candidates[0]
    elif "close" in col_map:
        col = col_map["close"]
    else:
        # fallback: pick the last numeric column
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        if not numeric_cols:
            return None
        col = numeric_cols[-1]

    s = df[col].dropna().rename("close")
    # Ensure index is datetime and sorted
    s.index = pd.to_datetime(s.index)
    s = s.sort_index()
    return s


def compute_metrics(series: pd.Series, start_date: date, investment_amount: Optional[float]) -> Dict[str, Any]:
    """
    Compute start price, current price, return, annualized, units, current value etc.
    """
    if series is None or series.empty:
        raise ValueError("Empty price series")

    # find first price on/after start_date
    series_sorted = series.sort_index()
    start_idx = series_sorted.index.searchsorted(pd.Timestamp(start_date))
    if start_idx >= len(series_sorted):
        raise ValueError("No historical data starting at or after the requested start date")
    start_price = float(series_sorted.iloc[start_idx])
    current_price = float(series_sorted.iloc[-1])

    # simple return
    total_return = (current_price / start_price - 1.0) * 100.0

    # annualized (CAGR)
    days = (series_sorted.index[-1] - series_sorted.index[start_idx]).days
    if days <= 0:
        annualized_pct = 0.0
    else:
        years = days / 365.25
        annualized_pct = (current_price / start_price) ** (1 / years) - 1
        annualized_pct *= 100.0

    units = None
    current_value = None
    if investment_amount is not None and investment_amount > 0:
        units = investment_amount / start_price
        current_value = units * current_price

    return {
        "start_date": series_sorted.index[start_idx].date().isoformat(),
        "start_price": start_price,
        "current_price": current_price,
        "return_pct": total_return,
        "annualized_pct": annualized_pct,
        "units": units,
        "current_value": current_value,
        "history_points": len(series_sorted),
    }


def history_to_list(series: pd.Series) -> List[Dict[str, Any]]:
    """Convert price series to list of {"date": "YYYY-MM-DD", "close": value}"""
    return [{"date": idx.date().isoformat(), "close": float(v)} for idx, v in series.items()]


def fetch_news_for_symbol(symbol: str, max_items: int = 10) -> List[Dict[str, str]]:
    """
    Fetch Google News RSS for the symbol (URL-encoded). Returns list of dicts with title/link/published.
    Uses simple XML parsing to avoid extra deps.
    """
    query = f"{symbol} stock"
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
    except Exception as e:
        logger.exception("Failed to fetch news RSS for %s: %s", symbol, e)
        return []

    try:
        root = ET.fromstring(resp.content)
    except Exception as e:
        logger.exception("Failed to parse news XML: %s", e)
        return []

    items = []
    for item in root.findall(".//item")[:max_items]:
        title = item.findtext("title") or ""
        link = item.findtext("link") or ""
        pub = item.findtext("pubDate") or ""
        items.append({"title": title, "link": link, "published": pub})
    return items


# --- Index fetching helpers -----------------------------------------------
# We'll fetch a small set of benchmark indices for .NS symbols by default.
# Yahoo tickers commonly: NIFTY 50 = ^NSEI, BSE SENSEX = ^BSESN
DEFAULT_INDICES_FOR_NS = {
    "NIFTY50": "^NSEI",
    "SENSEX": "^BSESN",
}


def fetch_indices_for_symbol(symbol: str, start_date: date) -> List[Dict[str, Any]]:
    """
    Given a stock symbol, return a list of index dicts:
    [{"symbol": "^NSEI", "history": [...], "start_price": x, "current_price": y}, ...]
    If no indices are applicable or fetch fails, returns an empty list.
    """
    indices_out: List[Dict[str, Any]] = []

    # simple rule: if symbol endswith .NS (NSE India), include NIFTY/SENSEX
    symbol_upper = symbol.strip().upper()
    if symbol_upper.endswith(".NS"):
        chosen = DEFAULT_INDICES_FOR_NS.values()
    else:
        # you can extend rules for .TO, .L, .NZ etc
        chosen = []

    for idx_ticker in chosen:
        try:
            df_idx = fetch_history(idx_ticker, start_date)
            ser_idx = extract_close_series(df_idx)
            if ser_idx is None or ser_idx.empty:
                logger.warning("No index data for %s", idx_ticker)
                continue
            hist = history_to_list(ser_idx)
            # compute quick metrics for the index
            idx_metrics = compute_metrics(ser_idx, start_date, None)
            indices_out.append({
                "symbol": idx_ticker,
                "history": hist,
                "start_price": idx_metrics.get("start_price"),
                "current_price": idx_metrics.get("current_price"),
                "history_points": idx_metrics.get("history_points"),
            })
        except Exception as e:
            logger.exception("Failed to fetch index %s: %s", idx_ticker, e)
            # continue to next index (do not fail entire analysis)
            continue

    return indices_out


# --- API routes -----------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analysis")
def analysis(req: AnalysisRequest):
    symbol = req.symbol.strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    try:
        start_dt = parse_start_date(req.start_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        # Fetch stock history
        df = fetch_history(symbol, start_dt)
        series = extract_close_series(df)
        if series is None or series.empty:
            raise HTTPException(status_code=400, detail=f"No price data returned for {symbol}")

        metrics = compute_metrics(series, start_dt, req.investment_amount)
        history_list = history_to_list(series)

        # Fetch indices (non-blocking failures)
        try:
            indices = fetch_indices_for_symbol(symbol, start_dt)
        except Exception:
            logger.exception("fetch_indices_for_symbol failed")
            indices = []

        headlines = fetch_news_for_symbol(symbol, max_items=10)

        result = {
            "symbol": symbol,
            "generated_at": datetime.utcnow().isoformat(),
            "investment_amount": req.investment_amount,
            "units": metrics.get("units"),
            "current_value": metrics.get("current_value"),
            "headlines": headlines,
            "history": history_list,
            "indices": indices,  # <-- new field for frontend to render index lines
            "start_date": metrics.get("start_date"),
            "start_price": metrics.get("start_price"),
            "current_price": metrics.get("current_price"),
            "return_pct": metrics.get("return_pct"),
            "annualized_pct": metrics.get("annualized_pct"),
            "history_points": metrics.get("history_points"),
        }
        return result

    except HTTPException:
        raise
    except ValueError as e:
        logger.error("analysis failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("analysis failed")
        raise HTTPException(status_code=500, detail="analysis_failed")