import { useState, useEffect } from 'react'
import { getStats } from '../api'
import { Waves, CalendarDays, MapPin, FlaskConical } from 'lucide-react'

function StatCard({ icon: Icon, value, label, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}18`, color }}>
        <Icon size={22} />
      </div>
      <div>
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStats()
      .then(r => setStats(r.data))
      .catch(() => setStats({ total_uploads: 0, total_days: 0, total_locations: 0, total_parameters: 0 }))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ocean Water Quality Dashboard</h1>
        <p className="page-subtitle">Real-time monitoring for 6 fixed coastal locations in Visakhapatnam</p>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard
          icon={Waves}
          value={loading ? '…' : stats?.total_uploads}
          label="Total Uploads"
          color="var(--accent-primary)"
        />
        <StatCard
          icon={CalendarDays}
          value={loading ? '…' : stats?.total_days}
          label="Total Days"
          color="var(--accent-teal)"
        />
        <StatCard
          icon={MapPin}
          value={loading ? '…' : stats?.total_locations}
          label="Total Locations"
          color="var(--accent-emerald)"
        />
        <StatCard
          icon={FlaskConical}
          value={loading ? '…' : stats?.total_parameters}
          label="Total Parameters"
          color="var(--accent-violet)"
        />
      </div>

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Locations */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={14} color="var(--accent-emerald)" />
            Monitoring Locations
          </div>
          {[
            { name: 'Rushikonda',      color: '#0ea5e9' },
            { name: 'Sagar Nagar',     color: '#06b6d4' },
            { name: 'Kailasagiri',     color: '#10b981' },
            { name: 'RK Beach',        color: '#8b5cf6' },
            { name: 'Novotel',         color: '#f59e0b' },
            { name: 'Fishing Harbour', color: '#f43f5e' },
          ].map(loc => (
            <div key={loc.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid var(--border-light)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: loc.color, boxShadow: `0 0 8px ${loc.color}60`,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{loc.name}</span>
            </div>
          ))}
        </div>

        {/* Quick start */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={14} color="var(--accent-violet)" />
            Quick Start Guide
          </div>
          {[
            { step: '01', title: 'Upload Daily Folder', desc: 'Go to Upload Data, select date, and drop all 6 CSV files.' },
            { step: '02', title: 'View Master Dataset', desc: 'Browse the pivoted table with Mean & Std Dev for all parameters.' },
            { step: '03', title: 'Analyse Parameters', desc: 'Select any parameter to see time-series and location comparison charts.' },
            { step: '04', title: 'Export to Excel', desc: 'Download Master Report or per-parameter Mean/StdDev reports.' },
          ].map(s => (
            <div key={s.step} style={{
              display: 'flex', gap: 12, padding: '8px 0',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 800, color: 'var(--accent-primary)',
                fontFamily: "'JetBrains Mono', monospace", paddingTop: 2, flexShrink: 0,
              }}>{s.step}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
