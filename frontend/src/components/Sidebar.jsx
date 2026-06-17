import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Upload, Table2, BarChart3, LogIn,
} from 'lucide-react'

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🌊</div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">iOcean</span>
          <span className="sidebar-logo-sub">Water Quality</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>

        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <LayoutDashboard className="nav-icon" size={16} />
          Dashboard
        </NavLink>

        <NavLink to="/upload" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Upload className="nav-icon" size={16} />
          Upload Data
        </NavLink>

        <div className="nav-section-label" style={{ marginTop: 8 }}>Analysis</div>

        <NavLink to="/master" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Table2 className="nav-icon" size={16} />
          Master Dataset
        </NavLink>

        <NavLink to="/parameter" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <BarChart3 className="nav-icon" size={16} />
          Parameter Analysis
        </NavLink>

        <div className="nav-section-label" style={{ marginTop: 8 }}>Logs</div>

        <NavLink to="/upload-log" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <LogIn className="nav-icon" size={16} />
          Upload Log
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="status-badge">
          <span className="status-dot" />
          Backend connected
        </div>
      </div>
    </aside>
  )
}
