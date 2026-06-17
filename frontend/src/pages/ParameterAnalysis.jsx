import { useState, useEffect } from 'react'
import Plot from 'react-plotly.js'
import { getParameters, getLocations, getParameterAnalysis, exportParamMean, exportParamStdDev } from '../api'
import { Download, BarChart3 } from 'lucide-react'

/* Colors per location */
const LOC_COLORS = {
  'Rushikonda':      '#0ea5e9',
  'Sagar Nagar':     '#06b6d4',
  'Kailasagiri':     '#10b981',
  'RK Beach':        '#8b5cf6',
  'Novotel':         '#f59e0b',
  'Fishing Harbour': '#f43f5e',
}

const PLOT_LAYOUT_BASE = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:  { family: 'Inter, sans-serif', color: '#7da5c8', size: 11 },
  margin: { t: 16, r: 16, b: 48, l: 56 },
  xaxis: {
    gridcolor: 'rgba(30,90,160,0.15)',
    linecolor: 'rgba(30,90,160,0.3)',
    tickcolor: 'rgba(30,90,160,0.3)',
    tickangle: -30,
  },
  yaxis: {
    gridcolor: 'rgba(30,90,160,0.15)',
    linecolor: 'rgba(30,90,160,0.3)',
    tickcolor: 'rgba(30,90,160,0.3)',
    zeroline: false,
  },
  legend: {
    bgcolor: 'rgba(0,0,0,0)',
    bordercolor: 'transparent',
    font: { size: 11 },
  },
  hovermode: 'x unified',
}

const PLOT_CONFIG = { displayModeBar: false, responsive: true }

export default function ParameterAnalysis() {
  const [params, setParams]     = useState([])
  const [locations, setLocs]    = useState([])
  const [selParam, setSelParam] = useState('')
  const [selLoc, setSelLoc]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    getParameters().then(r => {
      setParams(r.data.parameters)
      if (r.data.parameters.length) setSelParam(r.data.parameters[0])
    })
    getLocations().then(r => setLocs(r.data.locations))
  }, [])

  useEffect(() => {
    if (!selParam) return
    fetchAnalysis()
  }, [selParam])

  const fetchAnalysis = () => {
    if (!selParam) return
    setLoading(true)
    const qp = { parameter: selParam }
    if (selLoc)    qp.location  = selLoc
    if (dateFrom)  qp.date_from = dateFrom
    if (dateTo)    qp.date_to   = dateTo
    getParameterAnalysis(qp)
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false))
  }

  /* Build Plotly traces grouped by location */
  const groupByLocation = () => {
    const groups = {}
    data.forEach(row => {
      if (!groups[row.location]) groups[row.location] = []
      groups[row.location].push(row)
    })
    return groups
  }

  const buildMeanTraces = () => {
    const groups = groupByLocation()
    return Object.entries(groups).map(([loc, rows]) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: loc,
      x: rows.map(r => r.date),
      y: rows.map(r => r.mean),
      line: { color: LOC_COLORS[loc] || '#0ea5e9', width: 2 },
      marker: { size: 5, color: LOC_COLORS[loc] || '#0ea5e9' },
      connectgaps: false,
    }))
  }

  const buildStdTraces = () => {
    const groups = groupByLocation()
    return Object.entries(groups).map(([loc, rows]) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: loc,
      x: rows.map(r => r.date),
      y: rows.map(r => r.std_dev),
      line: { color: LOC_COLORS[loc] || '#0ea5e9', width: 2, dash: 'dot' },
      marker: { size: 5, color: LOC_COLORS[loc] || '#0ea5e9' },
      connectgaps: false,
    }))
  }

  const buildBarComparison = () => {
    /* Latest date bar chart: one bar per location */
    if (!data.length) return []
    const dates = [...new Set(data.map(r => r.date))].sort()
    const latest = dates[dates.length - 1]
    const latestRows = data.filter(r => r.date === latest)
    return [{
      type: 'bar',
      x: latestRows.map(r => r.location),
      y: latestRows.map(r => r.mean),
      marker: {
        color: latestRows.map(r => LOC_COLORS[r.location] || '#0ea5e9'),
        opacity: 0.85,
      },
      name: `Mean (${latest})`,
      error_y: {
        type: 'data',
        array: latestRows.map(r => r.std_dev ?? 0),
        visible: true,
        color: 'rgba(255,255,255,0.3)',
        thickness: 1.5,
        width: 4,
      },
    }]
  }

  const fmt = v => (v === null || v === undefined ? '—' : typeof v === 'number' ? v.toFixed(4) : v)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Parameter Analysis</h1>
        <p className="page-subtitle">Time-series and multi-location comparison charts for any selected parameter.</p>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Parameter</label>
          <select className="form-select" style={{ minWidth: 180 }}
            value={selParam} onChange={e => setSelParam(e.target.value)}>
            {params.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Location</label>
          <select className="form-select" style={{ minWidth: 160 }}
            value={selLoc} onChange={e => setSelLoc(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">From Date</label>
          <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">To Date</label>
          <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" onClick={fetchAnalysis}>Apply</button>
          <button className="btn btn-secondary" onClick={() => {
            setSelLoc(''); setDateFrom(''); setDateTo('')
            setTimeout(fetchAnalysis, 0)
          }}>Reset</button>
        </div>

        {/* Export buttons */}
        {selParam && (
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', display: 'flex', gap: 8 }}>
            <button className="btn btn-success btn-sm" onClick={() => exportParamMean(selParam)}>
              <Download size={13} />Mean .xlsx
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportParamStdDev(selParam)}>
              <Download size={13} />StdDev .xlsx
            </button>
          </div>
        )}
      </div>

      {!selParam ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-text">No parameters available yet. Upload data first.</div>
        </div>
      ) : loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No data for "{selParam}" with current filters.</div>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="charts-grid">
            <div className="chart-container">
              <div className="chart-title">
                <BarChart3 size={14} color="var(--accent-primary)" />
                {selParam} — Mean vs Date
              </div>
              <Plot
                data={buildMeanTraces()}
                layout={{
                  ...PLOT_LAYOUT_BASE,
                  yaxis: { ...PLOT_LAYOUT_BASE.yaxis, title: { text: `${selParam} (Mean)`, font: { size: 11 } } },
                }}
                config={PLOT_CONFIG}
                style={{ width: '100%', height: 280 }}
              />
            </div>

            <div className="chart-container">
              <div className="chart-title">
                <BarChart3 size={14} color="var(--accent-amber)" />
                {selParam} — Std Dev vs Date
              </div>
              <Plot
                data={buildStdTraces()}
                layout={{
                  ...PLOT_LAYOUT_BASE,
                  yaxis: { ...PLOT_LAYOUT_BASE.yaxis, title: { text: `${selParam} (Std Dev)`, font: { size: 11 } } },
                }}
                config={PLOT_CONFIG}
                style={{ width: '100%', height: 280 }}
              />
            </div>

            <div className="chart-container" style={{ gridColumn: '1 / -1' }}>
              <div className="chart-title">
                <BarChart3 size={14} color="var(--accent-emerald)" />
                {selParam} — Multi-Location Comparison (Latest Date with Error Bars)
              </div>
              <Plot
                data={buildBarComparison()}
                layout={{
                  ...PLOT_LAYOUT_BASE,
                  yaxis: { ...PLOT_LAYOUT_BASE.yaxis, title: { text: selParam, font: { size: 11 } } },
                  xaxis: { ...PLOT_LAYOUT_BASE.xaxis, tickangle: 0 },
                }}
                config={PLOT_CONFIG}
                style={{ width: '100%', height: 300 }}
              />
            </div>
          </div>

          {/* Data Table */}
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {selParam} — Raw Statistics Table
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Mean</th>
                    <th>Std Dev</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Sample Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i}>
                      <td className="date-cell">{row.date}</td>
                      <td className="location-cell">{row.location}</td>
                      <td className="numeric">{fmt(row.mean)}</td>
                      <td className="numeric">{fmt(row.std_dev)}</td>
                      <td className="numeric">{fmt(row.min_val)}</td>
                      <td className="numeric">{fmt(row.max_val)}</td>
                      <td className="numeric">{row.sample_count ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
