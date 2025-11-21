
#!/usr/bin/env python3
"""
Production-ready main.py for Stock & Mutual Fund Analysis - Demo

- /analysis (POST)
- /news (GET) with Google + Bing RSS fallback
- /analysis/export (GET) CSV export
- Defensive handling, logging, and no-return/null protection
"""

import logging
import time
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, List

import feedparser
import yfinance as yf
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
import csv
import io

# ---------- Config ----------
NEWS_CACHE_TTL = 60 * 5
MAX_NEWS_ITEMS = 8

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger("stock-mfund-demo")

# ---------- App ----------
app = FastAPI(title="Stock & Mutual Fund Analysis - Demo (Patched, Prod-ready)", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ---------- Simple News Cache ----------
_news_cache: Dict[str, Dict[str, Any]] = {}

# ---------- Models ----------
class AnalysisRequest(BaseModel):
    symbol: str
    start_date: str  # DD-MM-YYYY
    investment_amount: Optional[float] = None

# ---------- Utilities ----------
def _now_date() -> date:
    return datetime.now().date()

def safe_history_fetch(ticker: yf.Ticker, start_date: date, end_date: date, interval="1d"):
    try:
        hist = ticker.history(start=start_date, end=end_date, interval=interval)
        return hist if not hist.empty else None
    except Exception as exc:
        logger.warning("yfinance history fetch failed for %s: %s", getattr(ticker, "ticker", "N/A"), exc)
        return None

def get_price_on(ticker: yf.Ticker, target_date: date):
    try:
        end_date = target_date + timedelta(days=3)
        hist = safe_history_fetch(ticker, target_date, end_date)
        if hist is None:
            return None, ""
        row = hist.iloc[0]
        close_price = float(row.get("Close", 0.0))
        ts = row.name.strftime("%Y-%m-%d")
        return close_price, ts
    except Exception as exc:
        logger.exception("get_price_on error for %s at %s: %s", getattr(ticker, "ticker", "N/A"), target_date, exc)
        return None, ""

def get_history_series(ticker: yf.Ticker, start_date: date, interval="1d"):
    try:
        end_date = _now_date() + timedelta(days=1)
        hist = safe_history_fetch(ticker, start_date, end_date, interval=interval)
        if hist is None:
            return []
        out = []
        for idx, row in hist.iterrows():
            out.append({"date": idx.date().isoformat(), "close": float(row.get("Close", 0.0))})
        return out
    except Exception:
        logger.exception("get_history_series failed for %s", getattr(ticker, "ticker", "N/A"))
        return []

# ---------- NEWS helpers ----------
def _fetch_news_rss(url: str) -> List[Dict[str, str]]:
    try:
        feed = feedparser.parse(url)
        status = getattr(feed, "status", None)
        entries = getattr(feed, "entries", [])
        logger.info("RSS fetch: url=%s status=%s entries=%d", url, status, len(entries))
        out = []
        for e in entries[:MAX_NEWS_ITEMS]:
            out.append({
                "title": getattr(e, "title", "") or "",
                "link": getattr(e, "link", "") or "",
                "pubDate": getattr(e, "published", "") or ""
            })
        return out
    except Exception:
        logger.exception("Failed to parse RSS: %s", url)
        return []

def get_news(symbol: str) -> List[Dict[str, str]]:
    google_url = f"https://news.google.com/rss/search?q={symbol}+stock&hl=en-IN&gl=IN&ceid=IN:en"
    bing_url = f"https://www.bing.com/news/search?q={symbol}+stock&format=rss"
    items = _fetch_news_rss(google_url)
    if items:
        return items
    return _fetch_news_rss(bing_url)

# ---------- Analyzer ----------
def analyze_ticker(symbol: str, start_str: str) -> Dict[str, Any]:
    try:
        chosen_date = datetime.strptime(start_str, "%d-%m-%Y").date()
    except ValueError:
        logger.error("Invalid start_date format: %s", start_str)
        raise HTTPException(status_code=400, detail="start_date must be DD-MM-YYYY")

    t = yf.Ticker(symbol)
    start_price, start_ts = get_price_on(t, chosen_date)
    if start_price is None:
        start_price = 0.0
        start_ts = ""

    today = _now_date()
    current_price, current_ts = get_price_on(t, today - timedelta(days=3))
    if current_price is None:
        current_price = start_price
        current_ts = ""

    days = max((today - chosen_date).days, 1)
    absolute = current_price - start_price
    pct_return = (absolute / start_price * 100.0) if start_price else 0.0
    cagr = (current_price / start_price) ** (365.0 / days) - 1 if start_price else 0.0
    history_series = get_history_series(t, chosen_date)

    return {
        "symbol": symbol,
        "start_date": chosen_date.strftime("%d-%m-%Y"),
        "start_price": round(start_price, 6),
        "current_price": round(current_price, 6),
        "current_price_ts": current_ts,
        "absolute_return": round(absolute, 6),
        "return_percent": round(pct_return, 6),
        "annualized_return_percent": round(cagr * 100, 6),
        "days": days,
        "history": history_series
    }

# ---------- Endpoints ----------
@app.get("/health", response_class=PlainTextResponse)
def health():
    return "ok"

@app.get("/news")
def news(symbol: str):
    try:
        items = get_news(symbol)
        return {"symbol": symbol, "headlines": items}
    except Exception as exc:
        logger.exception("news endpoint error for %s", symbol)
        return JSONResponse({"error": "failed to fetch news", "detail": str(exc)}, status_code=500)

@app.post("/analysis")
def analysis(payload: AnalysisRequest):
    try:
        symbol = payload.symbol
        start_date = payload.start_date
        amount = payload.investment_amount

        logger.info("Analysis requested for %s from %s (amount=%s)", symbol, start_date, amount)

        main_info = analyze_ticker(symbol, start_date)
        sensex = analyze_ticker("^BSESN", start_date)
        nifty50 = analyze_ticker("^NSEI", start_date)

        comparisons = {
            "Sensex": {"metrics": sensex, "note": "BSE Sensex"},
            "Nifty50": {"metrics": nifty50, "note": "NSE Nifty 50"}
        }

        units = None
        current_value = None
        if amount:
            units = round(amount / main_info["start_price"], 6) if main_info["start_price"] else 0.0
            current_value = round(units * main_info["current_price"], 6)

        headlines = get_news(symbol)

        payload_out = {
            "main": main_info,
            "comparisons": comparisons,
            "investment_amount": amount,
            "units": units,
            "current_value": current_value,
            "headlines": headlines,
            "generated_at": datetime.now().isoformat()
        }
        return payload_out

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled error in /analysis")
        return JSONResponse({"error": "internal_server_error", "detail": str(exc)}, status_code=500)

@app.get("/analysis/export")
def analysis_export(
    symbol: str = Query(...),
    start_date: str = Query(...),
    investment_amount: Optional[float] = Query(None)
):
    try:
        data = analysis(AnalysisRequest(symbol=symbol, start_date=start_date, investment_amount=investment_amount))

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(["Metric", "Value"])
        writer.writerow(["Symbol", data["main"]["symbol"]])
        writer.writerow(["Start Date", data["main"]["start_date"]])
        writer.writerow(["Start Price", data["main"]["start_price"]])
        writer.writerow(["Current Price", data["main"]["current_price"]])
        writer.writerow(["Return %", data["main"]["return_percent"]])
        writer.writerow(["Annualized %", data["main"]["annualized_return_percent"]])

        if investment_amount:
            writer.writerow(["Units", data["units"]])
            writer.writerow(["Current Value", data["current_value"]])

        output.seek(0)
        return output.getvalue()
    except Exception:
        logger.exception("analysis_export failed")
        raise HTTPException(status_code=500, detail="export failed")
