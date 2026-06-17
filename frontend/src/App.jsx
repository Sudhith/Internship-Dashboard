import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './ToastContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import UploadPage from './pages/UploadPage'
import MasterDataset from './pages/MasterDataset'
import ParameterAnalysis from './pages/ParameterAnalysis'
import UploadLog from './pages/UploadLog'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/"          element={<Dashboard />} />
              <Route path="/upload"    element={<UploadPage />} />
              <Route path="/master"    element={<MasterDataset />} />
              <Route path="/parameter" element={<ParameterAnalysis />} />
              <Route path="/upload-log" element={<UploadLog />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
