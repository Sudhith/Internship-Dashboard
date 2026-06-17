# 🌊 iOcean Water Quality Dashboard

A modern, interactive dashboard for monitoring, analyzing, and visualizing sea water quality parameters across various coastal locations of Visakhapatnam. The application parses raw sensor data files (such as YSI Kor measurement instrument exports), processes them using a robust Python backend, and provides interactive visualizations in a React frontend.

---

## 🚀 Key Features

*   **Robust CSV Ingestion & Parsing:** Automatically detects encoding (UTF-16, UTF-8-sig, etc.) and delimiters for Kor measurement files. Fuzzy-matches filenames to canonical locations (e.g., *Rushikonda*, *Sagar Nagar*, *RK Beach*, *Novotel*, *Kailasagiri*, *Fishing Harbour*).
*   **Duplicate Detection:** Prevents duplicate ingestion by checking if data for a specific location on a given date is already uploaded.
*   **Interactive Visualizations:** High-fidelity plotting of water quality parameters (e.g., pH, Temperature, Dissolved Oxygen, Turbidity, Salinity, Conductivity) over time using Plotly.
*   **Master Dataset:** A unified grid view of pivoted parameter means and standard deviations across all locations and dates.
*   **Excel Exports:** Export master datasets and parameter-specific statistics (Mean & Std Dev tables aligned by location) to `.xlsx` files using `openpyxl`.
*   **Upload Log & Management:** Track historical uploads, with the ability to delete past ingestion records to correct mistakes.

---

## 🛠️ Tech Stack

### Backend
*   **Language:** Python 3.13+
*   **Web Framework:** Flask (with CORS enabled)
*   **Database:** SQLite (WAL mode enabled for fast concurrent read/write operations)
*   **Data Analysis:** Pandas, NumPy
*   **Excel Generation:** OpenPyXL

### Frontend
*   **Language:** JavaScript (React 19)
*   **Build Tool:** Vite
*   **Styling:** TailwindCSS (v4)
*   **Routing:** React Router v7
*   **Charts:** Plotly.js / React-Plotly.js

---

## 📁 Project Structure

```text
iOcean Dashboard/
├── backend/                   # Python Flask Server & Data Pipeline
│   ├── app.py                 # Flask API endpoints (upload, stats, export, delete)
│   ├── database.py            # SQLite connection, table schema, and database helper queries
│   ├── parser.py              # Robust parser for Kor instrument exports (fuzzy locations, raw parsing)
│   ├── test_parse.py          # Script for testing parser logic locally
│   ├── requirements.txt       # Python backend dependencies
│   └── ocean_data.db          # Active SQLite Database (created on first run)
├── frontend/                  # React Frontend Application
│   ├── src/
│   │   ├── components/        # Reusable components (e.g., Sidebar)
│   │   ├── pages/             # Page components (Dashboard, Upload, MasterDataset, ParameterAnalysis, UploadLog)
│   │   ├── api.js             # API service layer using Axios
│   │   ├── App.jsx            # Main app router definition
│   │   ├── ToastContext.jsx   # Custom app notification context
│   │   └── index.css          # Core styles & Tailwind directives
│   ├── package.json           # Frontend dependencies & run scripts
│   └── vite.config.js         # Vite bundler configuration
├── sample csv file/           # Sample Kor instrument exports for testing ingestion
│   └── 4th May R D0.csv
└── start.ps1                  # Interactive PowerShell script to start both servers in one click
```

---

## ⚡ Setup & Installation

### Prerequisites
Make sure you have the following installed on your system:
*   [Python 3.13+](https://www.python.org/downloads/)
*   [Node.js (v18 or higher)](https://nodejs.org/)

---

### Quick Start (Windows)
We provide a PowerShell script that automatically handles dependency updates and starts both servers concurrently.

1. Open PowerShell in the root directory.
2. Run the script:
   ```powershell
   ./start.ps1
   ```
This will:
*   Install Python packages in the backend.
*   Open a new window running the Flask server on `http://localhost:5000`.
*   Open a new window running the React app on `http://localhost:5173`.

---

### Manual Start

#### 1. Running the Backend (Flask)
From the root folder, navigate to the `backend` directory:
```bash
cd backend
```
Install requirements:
```bash
pip install -r requirements.txt
```
Run the application:
```bash
python app.py
```
The backend API is now running on `http://localhost:5000`.

#### 2. Running the Frontend (React + Vite)
From the root folder, navigate to the `frontend` directory:
```bash
cd frontend
```
Install NPM packages:
```bash
npm install
```
Start the Vite development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173`.
