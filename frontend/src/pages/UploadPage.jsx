import { useState, useRef, useCallback } from 'react'
import { uploadFiles } from '../api'
import { useToast } from '../ToastContext'
import { Upload, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
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

export default function UploadPage() {
  const toast = useToast()
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)

  const addFiles = useCallback((fileList) => {
    const csvFiles = Array.from(fileList).filter(f =>
      f.name.toLowerCase().endsWith('.csv')
    )
    if (!csvFiles.length) {
      toast('No CSV files found in selection.', 'error')
      return
    }
    setFiles(csvFiles)
    setResults(null)
  }, [toast])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const items = e.dataTransfer.items
    const dropped = []
    if (items) {
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.()
        if (entry && entry.isFile) dropped.push(item.getAsFile())
      }
    }
    if (dropped.length) addFiles(dropped)
    else addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleSubmit = async () => {
    if (!files.length) { toast('Please select files first.', 'error'); return }
    if (!date) { toast('Please select a date.', 'error'); return }

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
      if (data.total > 0) {
        toast(`Successfully processed ${data.total} file(s).`, 'success')
      }
      if (data.failed > 0) {
        toast(`${data.failed} file(s) had issues.`, 'error')
      }
    } catch (err) {
      toast(err.response?.data?.error || 'Upload failed.', 'error')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const clearFiles = () => { setFiles([]); setResults(null) }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Upload Daily Data</h1>
        <p className="page-subtitle">Upload the daily folder containing CSV files for all 6 locations.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: Upload panel */}
        <div>
          {/* Date picker */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Target Date</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Drop zone */}
          <div
            className={`upload-zone ${dragging ? 'drag-active' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="upload-zone-icon">📂</div>
            <div className="upload-zone-title">Drop daily folder or select files</div>
            <div className="upload-zone-sub">
              Select all CSV files from the daily folder (UTF-16 encoded)
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="file-list" style={{ marginTop: 12 }}>
              {files.map((f, i) => {
                const loc = detectLocation(f.name)
                return (
                  <div key={i} className="file-item">
                    <FileText size={14} color="var(--text-muted)" />
                    <span className="file-item-name">{f.name}</span>
                    {loc
                      ? <span className="badge badge-blue">{loc}</span>
                      : <span className="badge badge-red">Unknown</span>
                    }
                  </div>
                )
              })}
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
                : <><Upload size={14} />Upload {files.length} File{files.length !== 1 ? 's' : ''}</>
              }
            </button>
            {files.length > 0 && (
              <button className="btn btn-secondary" onClick={clearFiles}>Clear</button>
            )}
          </div>
        </div>

        {/* Right: Results / Info */}
        <div>
          {results ? (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                Upload Results
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-emerald)' }}>
                    {results.total}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Processed</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-rose)' }}>
                    {results.failed}
                  </div>
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
                        {r.parameters.length} parameters detected
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
                Upload Guidelines
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { title: 'File Format', desc: 'UTF-16 encoded CSV files, tab or comma delimited.' },
                  { title: 'Expected Files', desc: '6 files per day, one per monitoring location.' },
                  { title: 'Auto-detection', desc: 'Location is detected from filename automatically.' },
                  { title: 'Duplicate Prevention', desc: 'Re-uploading the same date + location is blocked.' },
                  { title: 'Parameters', desc: 'All parameter columns are detected automatically — no hardcoding needed.' },
                  { title: 'Statistics', desc: 'Mean & Std Dev are extracted from the file or calculated from raw data.' },
                ].map((g, i) => (
                  <div key={i} style={{ paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{g.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{g.desc}</div>
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
