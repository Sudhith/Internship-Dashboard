import { useState, useRef, useCallback } from 'react'
import { uploadFiles } from '../api'
import { useToast } from '../ToastContext'
import { Upload, FolderOpen, FileText, CheckCircle, XCircle, AlertCircle, Calendar } from 'lucide-react'

/* Map filename -> canonical location (mirrors backend logic) */
const LOCATION_MAP = {
  rushikonda:     'Rushikonda',
  sagarnagar:     'Sagar Nagar',
  sagarnagara:    'Sagar Nagar',
  kailasagiri:    'Kailasagiri',
  rkbeach:        'RK Beach',
  novotel:        'Novotel',
  fishingharbour: 'Fishing Harbour',
  fishingharbor:  'Fishing Harbour',
}

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

function normalizeKey(str) {
  return str.replace(/[\s\-_]+/g, '').toLowerCase()
}

function detectLocation(filename) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const key = normalizeKey(stem)
  if (LOCATION_MAP[key]) return LOCATION_MAP[key]
  for (const [k, v] of Object.entries(LOCATION_MAP)) {
    if (k.includes(key) || key.includes(k)) return v
  }
  return null
}

/**
 * Parse a date from a folder name. Handles:
 *   "5th May 2026"   → 2026-05-05   ← your format
 *   "1st May 2026"   → 2026-05-01
 *   "21st May 2026"  → 2026-05-21
 *   "31st May 2026"  → 2026-05-31
 *   "May_05"         → 2026-05-05
 *   "May05"          → 2026-05-05
 *   "05_May"         → 2026-05-05
 *   "2026-05-05"     → 2026-05-05
 *   "20260505"       → 2026-05-05
 */
function parseFolderDate(folderName) {
  if (!folderName) return null
  const name = folderName.trim()
  const yearNow = new Date().getFullYear()

  // ISO: 2026-05-05
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return name

  // Compact numeric: 20260505
  if (/^\d{8}$/.test(name)) {
    return `${name.slice(0,4)}-${name.slice(4,6)}-${name.slice(6,8)}`
  }

  // ── Try all readable patterns directly ───────────────────────────────────
  // Pattern: "5th May 2026" or "5 May 2026" or "5th May" or "5 May"
  const p1 = name.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s*(\d{4})?$/i)
  if (p1) {
    const day   = parseInt(p1[1], 10)
    const month = MONTH_MAP[p1[2].toLowerCase()]
    const year  = p1[3] ? parseInt(p1[3], 10) : yearNow
    if (month && day >= 1 && day <= 31)
      return `${year}-${month}-${String(day).padStart(2, '0')}`
  }

  // Pattern: "May 5 2026" or "May 5"
  const p2 = name.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(\d{4})?$/i)
  if (p2) {
    const month = MONTH_MAP[p2[1].toLowerCase()]
    const day   = parseInt(p2[2], 10)
    const year  = p2[3] ? parseInt(p2[3], 10) : yearNow
    if (month && day >= 1 && day <= 31)
      return `${year}-${month}-${String(day).padStart(2, '0')}`
  }

  // Pattern: "May_05", "May-05", separator variants
  const p3 = name.match(/^([a-zA-Z]+)[_\-](\d{1,2})$/)
  if (p3) {
    const month = MONTH_MAP[p3[1].toLowerCase()]
    const day   = parseInt(p3[2], 10)
    if (month && day >= 1 && day <= 31)
      return `${yearNow}-${month}-${String(day).padStart(2, '0')}`
  }

  // Pattern: "05_May", "05-May"
  const p4 = name.match(/^(\d{1,2})[_\-]([a-zA-Z]+)$/)
  if (p4) {
    const day   = parseInt(p4[1], 10)
    const month = MONTH_MAP[p4[2].toLowerCase()]
    if (month && day >= 1 && day <= 31)
      return `${yearNow}-${month}-${String(day).padStart(2, '0')}`
  }

  // Pattern: "May05" or "05May" (no separator)
  const p5 = name.match(/^([a-zA-Z]+)(\d{1,2})$/)
  if (p5) {
    const month = MONTH_MAP[p5[1].toLowerCase()]
    const day   = parseInt(p5[2], 10)
    if (month && day >= 1 && day <= 31)
      return `${yearNow}-${month}-${String(day).padStart(2, '0')}`
  }
  const p6 = name.match(/^(\d{1,2})([a-zA-Z]+)$/)
  if (p6) {
    const day   = parseInt(p6[1], 10)
    const month = MONTH_MAP[p6[2].toLowerCase()]
    if (month && day >= 1 && day <= 31)
      return `${yearNow}-${month}-${String(day).padStart(2, '0')}`
  }

  return null
}

export default function UploadPage() {
  const toast = useToast()
  const folderInputRef = useRef(null)
  const fileInputRef   = useRef(null)

  const [files, setFiles]         = useState([])
  const [folderName, setFolderName] = useState('')
  const [date, setDate]           = useState(() => new Date().toISOString().slice(0, 10))
  const [dateAutoDetected, setDateAutoDetected] = useState(false)
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [results, setResults]     = useState(null)

  const processFiles = useCallback((fileList) => {
    const all = Array.from(fileList)
    const csvFiles = all.filter(f => f.name.toLowerCase().endsWith('.csv'))
    if (!csvFiles.length) {
      toast('No CSV files found in the selected folder.', 'error')
      return
    }

    // Extract folder name from the relative path (webkitRelativePath)
    let detectedFolder = ''
    const firstWithPath = all.find(f => f.webkitRelativePath)
    if (firstWithPath) {
      detectedFolder = firstWithPath.webkitRelativePath.split('/')[0]
    }
    setFolderName(detectedFolder)

    // Try to auto-detect date from folder name
    const parsedDate = parseFolderDate(detectedFolder)
    if (parsedDate) {
      setDate(parsedDate)
      setDateAutoDetected(true)
    } else {
      setDateAutoDetected(false)
    }

    setFiles(csvFiles)
    setResults(null)
  }, [toast])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    // When a folder is dropped, items[] gives us the entries
    const items = e.dataTransfer.items
    if (!items) { processFiles(e.dataTransfer.files); return }

    const filePromises = []
    const readEntry = (entry) => new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(file => {
          // Inject relative path for folder detection
          Object.defineProperty(file, 'webkitRelativePath', {
            value: entry.fullPath.replace(/^\//, ''),
            writable: false,
          })
          resolve([file])
        }, () => resolve([]))
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        reader.readEntries(entries => {
          Promise.all(entries.map(readEntry)).then(results => {
            resolve(results.flat())
          })
        })
      } else {
        resolve([])
      }
    })

    Promise.all(
      Array.from(items).map(item => {
        const entry = item.webkitGetAsEntry?.()
        return entry ? readEntry(entry) : Promise.resolve([])
      })
    ).then(results => processFiles(results.flat()))
  }, [processFiles])

  const handleSubmit = async () => {
    if (!files.length) { toast('Please select a folder first.', 'error'); return }
    if (!date) { toast('Please confirm the date.', 'error'); return }

    const formData = new FormData()
    formData.append('date', date)
    files.forEach(f => formData.append('files', f, f.name))

    setUploading(true)
    setProgress(0)
    setResults(null)

    try {
      const res = await uploadFiles(formData, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
      })
      const data = res.data
      setResults(data)
      if (data.total > 0) toast(`Successfully processed ${data.total} location(s).`, 'success')
      if (data.failed > 0) toast(`${data.failed} file(s) had issues — see results.`, 'error')
    } catch (err) {
      toast(err.response?.data?.error || 'Upload failed.', 'error')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const clearAll = () => { setFiles([]); setFolderName(''); setResults(null); setDateAutoDetected(false) }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Upload Daily Folder</h1>
        <p className="page-subtitle">Select the entire dated folder — all 6 location files are detected automatically.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* ── Left: Upload panel ── */}
        <div>

          {/* Date confirmation card */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={12} />
                  Target Date
                  {dateAutoDetected && (
                    <span className="badge badge-green" style={{ marginLeft: 4 }}>Auto-detected from folder</span>
                  )}
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={e => { setDate(e.target.value); setDateAutoDetected(false) }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Date is auto-detected from folder name (e.g. "May_05"). You can override it here.
                </div>
              </div>
            </div>
          </div>

          {/* Folder drop zone */}
          <div
            className={`upload-zone ${dragging ? 'drag-active' : ''}`}
            onClick={() => folderInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="upload-zone-icon">📁</div>
            <div className="upload-zone-title">Click to Select Folder</div>
            <div className="upload-zone-sub">
              Select the daily folder (e.g. <code style={{ background: 'rgba(14,165,233,0.12)', padding: '1px 6px', borderRadius: 4 }}>May_05/</code>)
              — all CSV files inside are loaded automatically
            </div>

            {/* Folder input — picks entire directory */}
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
              onChange={e => processFiles(e.target.files)}
            />
          </div>

          {/* Fallback: pick individual files */}
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or </span>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText size={11} /> Select individual CSV files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => processFiles(e.target.files)}
            />
          </div>

          {/* Folder name + file list */}
          {files.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {folderName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <FolderOpen size={14} color="var(--accent-amber)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-amber)' }}>{folderName}/</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{files.length} CSV file{files.length !== 1 ? 's' : ''} found</span>
                </div>
              )}
              <div className="file-list">
                {files.map((f, i) => {
                  const loc = detectLocation(f.name)
                  return (
                    <div key={i} className="file-item">
                      <FileText size={14} color="var(--text-muted)" />
                      <span className="file-item-name">{f.name}</span>
                      {loc
                        ? <span className="badge badge-blue">{loc}</span>
                        : <span className="badge badge-red">Unknown location</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div style={{ marginTop: 16 }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Uploading… {progress}%
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={uploading || !files.length}
              style={{ flex: 1 }}
            >
              {uploading
                ? <><span className="spinner" />Processing…</>
                : <><Upload size={14} />Upload {folderName || `${files.length} file${files.length !== 1 ? 's' : ''}`}</>
              }
            </button>
            {files.length > 0 && (
              <button className="btn btn-secondary" onClick={clearAll}>Clear</button>
            )}
          </div>
        </div>

        {/* ── Right: Results / Guidelines ── */}
        <div>
          {results ? (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                Upload Results — {date}
              </div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-emerald)' }}>{results.total}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Processed</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-rose)' }}>{results.failed}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.processed.map((r, i) => (
                  <div key={i} className="result-item ok">
                    <CheckCircle size={14} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.location}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {r.parameters.length} parameters · {r.filename}
                      </div>
                    </div>
                  </div>
                ))}
                {results.errors.map((r, i) => (
                  <div key={i} className="result-item fail">
                    <XCircle size={14} color="var(--accent-rose)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.filename}</div>
                      <div style={{ fontSize: 11, color: 'var(--accent-rose)', marginTop: 2 }}>{r.error}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} color="var(--accent-amber)" />
                How Folder Upload Works
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    step: '1',
                    title: 'Select the daily folder',
                    desc: 'Click the zone above and pick your folder. Works with names like "5th May 2026", "May_05", "May05", "2026-05-05" — all are auto-detected.',
                  },
                  {
                    step: '2',
                    title: 'Confirm or change the date',
                    desc: 'Date is auto-parsed from folder name. Always check it before uploading, especially if your folder name is non-standard.',
                  },
                  {
                    step: '3',
                    title: 'All 6 location files detected',
                    desc: 'Rushikonda, SagarNagar, Kailasagiri, RKBeach, Novotel, FishingHarbour — each identified automatically from filename.',
                  },
                  {
                    step: '4',
                    title: 'Upload all 31 May folders',
                    desc: 'Repeat for each daily folder. Duplicates are blocked automatically, so re-uploading is safe.',
                  },
                  {
                    step: '5',
                    title: 'Export from Master Dataset',
                    desc: 'Go to Master Dataset → click "Export May 2026 Data" → get one Excel file with all 31 days, all 6 locations, every parameter Mean & StdDev.',
                  },
                ].map((g, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'monospace', paddingTop: 1, flexShrink: 0 }}>
                      {g.step}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{g.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{g.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
