import React, {useState} from 'react'
import axios from 'axios'
import {API_BASE} from './config'

export default function App(){
  const [symbol, setSymbol] = useState('RELIANCE.NS')
  const [startDate, setStartDate] = useState('01-01-2020')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const analyze = async ()=>{
    setLoading(true)
    try{
      const res = await axios.post(`${API_BASE}/analysis`, {
        symbol,
        start_date: startDate,
        investment_amount: amount ? parseFloat(amount) : null
      })
      setResult(res.data)
    }catch(e){
      alert(e.response?.data?.detail || e.message)
    }finally{
      setLoading(false)
    }
  }
  return (
    <div style={{padding:20,fontFamily:'Arial, sans-serif'}}>
      <h2>Stock & Mutual Fund Analysis — Demo</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,maxWidth:600}}>
        <label>Symbol (Yahoo): <input value={symbol} onChange={e=>setSymbol(e.target.value)} /></label>
        <label>Start Date (DD-MM-YYYY): <input value={startDate} onChange={e=>setStartDate(e.target.value)} /></label>
        <label>Investment Amount (optional): <input value={amount} onChange={e=>setAmount(e.target.value)} /></label>
        <div></div>
        <button onClick={analyze} disabled={loading}>{loading ? 'Analyzing...' : 'Analyze'}</button>
      </div>
      {result && (
        <div style={{marginTop:20}}>
          <h3>Results for {result.symbol}</h3>
          <table border="1" cellPadding="6">
            <tbody>
              <tr><td>Start Date</td><td>{result.start_date}</td></tr>
              <tr><td>Start Price</td><td>{result.start_price}</td></tr>
              <tr><td>Current Price</td><td>{result.current_price} <small>({result.current_price_ts})</small></td></tr>
              <tr><td>Absolute Return</td><td>{result.absolute_return}</td></tr>
              <tr><td>Return %</td><td>{result.return_percent}%</td></tr>
              <tr><td>Annualized Return %</td><td>{result.annualized_return_percent}%</td></tr>
              {result.current_value && <tr><td>Current Value</td><td>{result.current_value}</td></tr>}
            </tbody>
          </table>
          <p style={{color:'#666'}}>{result.notes}</p>
        </div>
      )}
    </div>
  )
}
