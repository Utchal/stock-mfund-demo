# backend/main.py
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
import time

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


# ---------- utilities ----------
def parse_start_date(s: str) -> date:
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            continue
    raise ValueError(f"Invalid start_date format: {s}. Accepts YYYY-MM-DD or DD-MM-YYYY")


def _yf_download_with_retries(ticker: str, start_iso: str, attempts: int = 3, delay_seconds: float = 0.6) -> pd.DataFrame:
    last_exc = None
    for i in range(attempts):
        try:
            logger.debug("yfinance download attempt %d for %s (start=%s)", i + 1, ticker, start_iso)
            df = yf.download(ticker, start=start_iso, progress=False, threads=False, auto_adjust=False)
            return df
        except Exception as e:
            last_exc = e
            logger.warning("yfinance download attempt %d failed for %s: %s", i + 1, ticker, e)
            time.sleep(delay_seconds * (1 + i))
    if last_exc:
        logger.exception("yfinance final failure for %s", ticker)
    return pd.DataFrame()


def fetch_history(ticker: str, start_date: date) -> pd.DataFrame:
    start_iso = start_date.isoformat()
    logger.info("Fetching %s from yfinance starting %s", ticker, start_iso)
    df = _yf_download_with_retries(ticker, start_iso)
    if df is None or df.empty:
        logger.warning("No data returned from yfinance for %s (start=%s) - empty DataFrame", ticker, start_iso)
        return pd.DataFrame()
    return df


def extract_close_series(df: pd.DataFrame) -> Optional[pd.Series]:
    if df is None or df.empty:
        return None

    new_cols = []
    for c in df.columns:
        if isinstance(c, tuple):
            joined = "|".join([str(x) for x in c if x is not None and str(x) != ""])
            new_cols.append(joined)
        else:
            new_cols.append(str(c))
    df = df.copy()
    df.columns = new_cols

    col_map = {c.lower().replace(" ", "").replace("-", ""): c for c in df.columns}

    adj_candidates = [orig for k, orig in col_map.items() if "adj" in k and "close" in k]
    if not adj_candidates:
        adj_candidates = [orig for k, orig in col_map.items() if "adj" in k]
    if adj_candidates:
        col = adj_candidates[0]
    elif "close" in col_map:
        col = col_map["close"]
    else:
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        if not numeric_cols:
            return None
        col = numeric_cols[-1]

    s = df[col].dropna().rename("close")
    s.index = pd.to_datetime(s.index)
    s = s.sort_index()
    return s


def compute_metrics(series: pd.Series, start_date: date, investment_amount: Optional[float]) -> Dict[str, Any]:
    if series is None or series.empty:
        raise ValueError("Empty price series")

    series_sorted = series.sort_index()
    start_idx = series_sorted.index.searchsorted(pd.Timestamp(start_date))
    if start_idx >= len(series_sorted):
        raise ValueError("No historical data starting at or after the requested start date")
    start_price = float(series_sorted.iloc[start_idx])
    current_price = float(series_sorted.iloc[-1])

    total_return = (current_price / start_price - 1.0) * 100.0

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
    return [{"date": idx.date().isoformat(), "close": float(v)} for idx, v in series.items()]


def fetch_news_for_symbol(symbol: str, max_items: int = 10) -> List[Dict[str, str]]:
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


# ---------- Index support ----------
DEFAULT_INDEX_TICKERS = [
    {"symbol": "^NSEI", "label": "^NSEI"},
    {"symbol": "^BSESN", "label": "^BSESN"},
]


def fetch_indexes(start_date: date) -> List[Dict[str, Any]]:
    indexes = []
    for idx_def in DEFAULT_INDEX_TICKERS:
        t = idx_def["symbol"]
        try:
            df = fetch_history(t, start_date)
            series = extract_close_series(df)
            if series is None or series.empty:
                logger.warning("Index %s returned no data", t)
                indexes.append({
                    "symbol": t,
                    "label": idx_def.get("label", t),
                    "history": [],
                    "start_price": None,
                    "current_price": None,
                    "history_points": 0,
                    "error": "no_data",
                })
                continue

            metrics = compute_metrics(series, start_date, None)
            hist = history_to_list(series)
            indexes.append({
                "symbol": t,
                "label": idx_def.get("label", t),
                "history": hist,
                "start_price": metrics.get("start_price"),
                "current_price": metrics.get("current_price"),
                "history_points": metrics.get("history_points"),
            })
        except Exception as e:
            logger.exception("Failed to fetch index %s: %s", t, e)
            indexes.append({
                "symbol": t,
                "label": idx_def.get("label", t),
                "history": [],
                "start_price": None,
                "current_price": None,
                "history_points": 0,
                "error": "exception",
                "message": str(e),
            })
    return indexes


# ---------- FastAPI handlers ----------
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
        df = fetch_history(symbol, start_dt)
        series = extract_close_series(df)
        if series is None or series.empty:
            raise HTTPException(status_code=400, detail=f"No price data returned for {symbol}")

        metrics = compute_metrics(series, start_dt, req.investment_amount)
        history_list = history_to_list(series)
        headlines = fetch_news_for_symbol(symbol, max_items=10)

        # fetch indexes (always return a list)
        indexes = fetch_indexes(start_dt)

        result = {
            "symbol": symbol,
            "generated_at": datetime.utcnow().isoformat(),
            "investment_amount": req.investment_amount,
            "units": metrics.get("units"),
            "current_value": metrics.get("current_value"),
            "headlines": headlines,
            "history": history_list,
            "start_date": metrics.get("start_date"),
            "start_price": metrics.get("start_price"),
            "current_price": metrics.get("current_price"),
            "return_pct": metrics.get("return_pct"),
            "annualized_pct": metrics.get("annualized_pct"),
            "history_points": metrics.get("history_points"),
            "indexes": indexes,
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