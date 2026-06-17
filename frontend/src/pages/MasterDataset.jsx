import { useState, useEffect, useMemo } from 'react'
import { getMasterDataset, getLocations, getDates, exportMaster } from '../api'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

export default function MasterDataset() {
  const [rows, setRows]         = useState([])
  const [columns, setColumns]   = useState([])
  const [locations, setLocs]    = useState([])
  const [dates, setDates]       = useState([])
  const [loading, setLoading]   = useState(true)

  const [filterLoc, setFilterLoc]     = useState('')
  const [filterFrom, setFilterFrom]   = useState('')
  const [filterTo, setFilterTo]       = useState('')
  const [page, setPage]               = useState(1)

  const fetchData = () => {
    setLoading(true)
    const params = {}
    if (filterLoc)  params.location  = filterLoc
    if (filterFrom) params.date_from = filterFrom
    if (filterTo)   params.date_to   = filterTo

    getMasterDataset(params)
      .then(r => {
        setColumns(r.data.columns)
        setRows(r.data.rows)
        setPage(1)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    getLocations().then(r => setLocs(r.data.locations))
    getDates().then(r => setDates(r.data.dates))
    fetchData()
  }, [])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Format column header for display
  const formatCol = (col) => {
    if (col === 'date') return 'Date'
    if (col === 'location') return 'Location'
    // e.g. "pH_mean" -> "pH Mean", "ODO mg/L_std_dev" -> "ODO mg/L StdDev"
    const parts = col.split('_')
    const stat  = parts[parts.length - 1]
    const param = parts.slice(0, -1).join(' ')
    if (stat === 'mean')    return `${param} Mean`
    if (stat === 'dev')     return `${parts.slice(0, -2).join(' ')} StdDev`
    return col
  }

  const isNumericCol = (col) => col !== 'date' && col !== 'location'

  const fmt = (v) => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'number') return v.toFixed(4)
    return v
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Master Dataset</h1>
        <p className="page-subtitle">Pivoted table: one row per date × location, all parameter stats as columns.</p>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Location</label>
          <select className="form-select" style={{ minWidth: 160 }}
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
          <button className="btn btn-success btn-sm" onClick={() =>
            exportMaster({ location: filterLoc, date_from: filterFrom, date_to: filterTo })
          }>
            <Download size={13} />
            Export Master .xlsx
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No data available. Upload some files first.</div>
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
                  {columns.map(col => (
                    <th key={col}>{formatCol(col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td
                        key={col}
                        className={
                          col === 'date' ? 'date-cell' :
                          col === 'location' ? 'location-cell' :
                          'numeric'
                        }
                      >
                        {fmt(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
