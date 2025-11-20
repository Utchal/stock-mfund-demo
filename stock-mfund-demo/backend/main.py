from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

app = FastAPI(title="Stock & Mutual Fund Analysis - Demo")

class AnalyzeRequest(BaseModel):
    symbol: str
    start_date: str  # DD-MM-YYYY
    investment_amount: Optional[float] = None

def parse_date(dstr):
    try:
        return datetime.strptime(dstr, "%d-%m-%Y").date()
    except:
        raise ValueError("Date must be in DD-MM-YYYY format")

@app.post("/analysis")
def analyze(req: AnalyzeRequest):
    # Basic validation
    try:
        start_date = parse_date(req.start_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    symbol = req.symbol.strip()
    try:
        ticker = yf.Ticker(symbol)
        # fetch historical price on or before start_date
        hist = ticker.history(start=start_date - timedelta(days=7), end=datetime.now().date() + timedelta(days=1))
        if hist.empty:
            raise HTTPException(status_code=422, detail="No historical data found for the date range")
        # find closest prior trading day to start_date
        hist_index = hist.index.date
        chosen_date = max([d for d in hist_index if d <= start_date])
        start_row = hist.loc[hist.index.date == chosen_date].iloc[-1]
        start_price = float(start_row['Close'])
        # current price
        info = ticker.history(period="1d")
        if info.empty:
            # fallback to last close from hist
            current_price = float(hist.iloc[-1]['Close'])
            current_ts = str(hist.index[-1])
        else:
            current_price = float(info.iloc[-1]['Close'])
            current_ts = str(info.index[-1])
        # compute returns
        absolute = current_price - start_price
        pct_return = (current_price / start_price - 1) * 100
        # years
        days = (datetime.now().date() - chosen_date).days
        years = days / 365.25 if days > 0 else 1/365.25
        cagr = (current_price / start_price) ** (1/years) - 1
        # holdings if investment provided
        units = None
        current_value = None
        if req.investment_amount:
            units = req.investment_amount / start_price
            current_value = units * current_price
        result = {
            "symbol": symbol,
            "start_date": chosen_date.strftime("%d-%m-%Y"),
            "start_price": round(start_price, 4),
            "current_price": round(current_price, 4),
            "current_price_ts": current_ts,
            "absolute_return": round(absolute, 4),
            "return_percent": round(pct_return, 4),
            "annualized_return_percent": round(cagr*100, 4),
            "days": days,
            "investment_amount": req.investment_amount,
            "units": units,
            "current_value": round(current_value, 4) if current_value else None,
            "notes": "Demo data via Yahoo Finance (yfinance). For indices and sector index comparison, extend the endpoint."
        }
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
