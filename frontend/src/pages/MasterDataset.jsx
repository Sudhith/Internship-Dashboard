import { useState, useEffect } from 'react'
import { getMasterDataset, getLocations, getDates, exportMaster, exportAnalysis } from '../api'
import { Download, ChevronLeft, ChevronRight, FileSpreadsheet, CalendarRange, Info } from 'lucide-react'

const PAGE_SIZE = 20

export default function MasterDataset() {
  const [rows, setRows]       = useState([])
  const [columns, setColumns] = useState([])
  const [locations, setLocs]  = useState([])
  const [allDates, setAllDates] = useState([])
  const [loading, setLoading] = useState(true)

  const [filterLoc,  setFilterLoc]  = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')
  const [page, setPage]             = useState(1)

  // For monthly export selectors
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const fetchData = () => {
    setLoading(true)
    const params = {}
    if (filterLoc)  params.location  = filterLoc
    if (filterFrom) params.date_from = filterFrom
    if (filterTo)   params.date_to   = filterTo
    getMasterDataset(params)
      .then(r => { setColumns(r.data.columns); setRows(r.data.rows); setPage(1) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    getLocations().then(r => setLocs(r.data.locations))
    getDates().then(r => setAllDates(r.data.dates))
    fetchData()
  }, [])

  // Derive available months from uploaded dates
  const availableMonths = [...new Set(allDates.map(d => d.slice(0, 7)))].sort()

  const handleMonthExport = () => {
    const [year, month] = exportMonth.split('-')
    const from = `${year}-${month}-01`
    const to   = `${year}-${month}-31`
    exportAnalysis({ date_from: from, date_to: to })
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows   = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const formatCol = (col) => {
    if (col === 'date')     return 'Date'
    if (col === 'location') return 'Location'
    // Backend now sends "PARAM Mean" / "PARAM StdDev" already formatted
    return col
  }

  const fmt = (v) => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'number') return v.toFixed(4)
    return v
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Master Dataset</h1>
        <p className="page-subtitle">All uploaded data — one row per date × location, every parameter Mean &amp; StdDev as columns.</p>
      </div>

      {/* ── Monthly Export Card ── */}
      <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(14,165,233,0.35)', background: 'rgba(14,165,233,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <FileSpreadsheet size={16} color="var(--accent-primary)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Monthly Export — Analysis-Ready Excel
          </span>
        </div>

        {/* Format description */}
        <div style={{
          background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1.8,
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11 }}>
            OUTPUT FORMAT (one sheet per location + combined sheet):
          </div>
          Date &nbsp;|&nbsp; COND Mean &nbsp;|&nbsp; COND StdDev &nbsp;|&nbsp; ODO Mean &nbsp;|&nbsp; ODO StdDev &nbsp;|&nbsp; pH Mean &nbsp;|&nbsp; pH StdDev &nbsp;|&nbsp; ...
          <div style={{ marginTop: 4, color: 'var(--accent-teal)' }}>
            2026-05-01 &nbsp;| &nbsp;56122.6 &nbsp;|&nbsp; 1553.4 &nbsp;|&nbsp; 6.25 &nbsp;|&nbsp; 0.02 &nbsp;|&nbsp; 7.78 &nbsp;|&nbsp; 0.01 &nbsp;|&nbsp; ...
          </div>
          <div style={{ color: 'var(--accent-teal)', opacity: 0.7 }}>
            2026-05-02 &nbsp;| &nbsp;55990.1 &nbsp;|&nbsp; 1420.8 &nbsp;|&nbsp; 6.31 &nbsp;|&nbsp; 0.03 &nbsp;|&nbsp; 7.80 &nbsp;|&nbsp; 0.02 &nbsp;|&nbsp; ...
          </div>
          <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}>...one row per day...</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="form-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarRange size={11} /> Select Month
            </label>
            <select
              className="form-select"
              value={exportMonth}
              onChange={e => setExportMonth(e.target.value)}
              style={{ minWidth: 160 }}
            >
              {availableMonths.length > 0
                ? availableMonths.map(m => {
                    const [y, mo] = m.split('-')
                    const label = new Date(y, mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
                    return <option key={m} value={m}>{label}</option>
                  })
                : <option value={exportMonth}>{exportMonth}</option>
              }
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleMonthExport}
            style={{ paddingLeft: 20, paddingRight: 20 }}
          >
            <Download size={14} />
            Export {exportMonth
              ? new Date(exportMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
              : 'Month'} Data
          </button>

          <button
            className="btn btn-success"
            onClick={() => exportAnalysis({})}
            style={{ paddingLeft: 20, paddingRight: 20 }}
          >
            <FileSpreadsheet size={14} />
            Export ALL Data
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <Info size={12} />
            <span>One sheet per location · Date as rows · Mean &amp; StdDev as paired columns</span>
          </div>
        </div>
      </div>

      {/* ── Filters + Table ── */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Location</label>
          <select className="form-select" style={{ minWidth: 150 }}
            value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">From Date</label>
          <input type="date" className="form-input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="filter-label">To Date</label>
          <input type="date" className="form-input" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" onClick={fetchData}>Apply</button>
          <button className="btn btn-secondary" onClick={() => {
            setFilterLoc(''); setFilterFrom(''); setFilterTo('')
            setTimeout(fetchData, 0)
          }}>Reset</button>
        </div>
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() =>
            exportMaster({ location: filterLoc, date_from: filterFrom, date_to: filterTo })
          }>
            <Download size={13} /> Raw Master .xlsx
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No data yet. Upload daily folders from the Upload Data page.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {rows.length} rows · {columns.length} columns · Page {page} of {totalPages}
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {columns.map(col => <th key={col}>{formatCol(col)}</th>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={col} className={
                        col === 'date'     ? 'date-cell' :
                        col === 'location' ? 'location-cell' :
                        'numeric'
                      }>
                        {fmt(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1
              return (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              )
            })}
            {totalPages > 7 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</span>}
            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
