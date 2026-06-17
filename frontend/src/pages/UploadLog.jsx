import { useState, useEffect } from 'react'
import { getUploadLog, deleteUpload } from '../api'
import { useToast } from '../ToastContext'
import { Trash2, RefreshCw } from 'lucide-react'

export default function UploadLog() {
  const toast = useToast()
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLog = () => {
    setLoading(true)
    getUploadLog()
      .then(r => setUploads(r.data.uploads))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLog() }, [])

  const handleDelete = async (id, location, date) => {
    if (!window.confirm(`Delete upload for ${location} on ${date}? This will remove all stored statistics and raw readings.`)) return
    try {
      await deleteUpload(id)
      toast(`Deleted ${location} on ${date}.`, 'success')
      fetchLog()
    } catch (e) {
      toast('Delete failed.', 'error')
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Upload Log</h1>
          <p className="page-subtitle">All upload sessions sorted by most recent first.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchLog}>
          <RefreshCw size={13} />Refresh
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : uploads.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No uploads yet.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 'var(--radius-lg)' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Location</th>
                  <th>Filename</th>
                  <th>Uploaded At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map(u => (
                  <tr key={u.id}>
                    <td className="date-cell">{u.date}</td>
                    <td className="location-cell">{u.location}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--text-muted)' }}>
                      {u.filename}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(u.uploaded_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u.id, u.location, u.date)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
