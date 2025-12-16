import logging
from datetime import datetime
from typing import List

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from nsepython import equity_history, index_history

# --------------------------------------------------
# Logging
# --------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nse-backend")

# --------------------------------------------------
# FastAPI app
# --------------------------------------------------
app = FastAPI(title="NSE Stock Analysis API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# Models
# --------------------------------------------------
class AnalysisRequest(BaseModel):
    symbol: str            # e.g. RELIANCE
    start_date: str        # DD-MM-YYYY
    investment: float = 10000
    show_indices: bool = True


class PricePoint(BaseModel):
    date: str
    close: float


# --------------------------------------------------
# Helpers
# --------------------------------------------------
def parse_date(value: str) -> datetime:
    try:
        return datetime.strptime(value, "%d-%m-%Y")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="start_date must be DD-MM-YYYY",
        )


def fetch_stock(symbol: str, start: datetime) -> List[PricePoint]:
    try:
        logger.info(f"Fetching NSE stock: {symbol}")
        data = equity_history(
            symbol=symbol,
            series="EQ",
            start_date=start.strftime("%d-%m-%Y"),
            end_date=datetime.today().strftime("%d-%m-%Y"),
        )

        df = pd.DataFrame(data)
        if df.empty:
            return []

        return [
            PricePoint(
                date=row["CH_TIMESTAMP"].split("T")[0],
                close=float(row["CH_CLOSING_PRICE"]),
            )
            for _, row in df.iterrows()
        ]
    except Exception as e:
        logger.error(f"Stock fetch failed: {e}")
        return []


def fetch_index(name: str, start: datetime) -> List[PricePoint]:
    try:
        logger.info(f"Fetching index: {name}")
        data = index_history(
            index=name,
            start_date=start.strftime("%d-%m-%Y"),
            end_date=datetime.today().strftime("%d-%m-%Y"),
        )

        df = pd.DataFrame(data)
        if df.empty:
            return []

        return [
            PricePoint(
                date=row["HistoricalDate"].split("T")[0],
                close=float(row["CLOSE"]),
            )
            for _, row in df.iterrows()
        ]
    except Exception as e:
        logger.error(f"Index fetch failed: {e}")
        return []


# --------------------------------------------------
# Health
# --------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------
# Main API
# --------------------------------------------------
@app.post("/analysis")
def analyze(req: AnalysisRequest):
    start = parse_date(req.start_date)

    # ---------------- STOCK ----------------
    stock_history = fetch_stock(req.symbol.upper(), start)

    if not stock_history:
        return {
            "symbol": req.symbol,
            "history": [],
            "indexes": [],
            "error": "No NSE data found",
            "generated_at": datetime.utcnow().isoformat(),
        }

    start_price = stock_history[0].close
    current_price = stock_history[-1].close

    units = req.investment / start_price
    current_value = units * current_price
    return_pct = ((current_value / req.investment) - 1) * 100

    years = max(len(stock_history) / 252, 0.01)
    annualized_pct = ((current_value / req.investment) ** (1 / years) - 1) * 100

    # ---------------- INDEXES ----------------
    indexes = []
    if req.show_indices:
        for name in ["NIFTY 50", "SENSEX"]:
            idx_history = fetch_index(name, start)
            if idx_history:
                indexes.append({
                    "symbol": name,
                    "history": idx_history,
                    "start_price": idx_history[0].close,
                    "current_price": idx_history[-1].close,
                    "history_points": len(idx_history),
                })

    return {
        "symbol": req.symbol,
        "start_date": req.start_date,
        "investment": req.investment,
        "units": round(units, 6),
        "start_price": round(start_price, 2),
        "current_price": round(current_price, 2),
        "current_value": round(current_value, 2),
        "return_pct": round(return_pct, 2),
        "annualized_pct": round(annualized_pct, 2),
        "history": stock_history,
        "history_points": len(stock_history),
        "indexes": indexes,
        "generated_at": datetime.utcnow().isoformat(),
    }