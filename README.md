# 🌊 iOcean Water Quality Dashboard

Welcome to the **iOcean Water Quality Dashboard**! 

This is a full-stack web application designed to track, store, and visualize ocean water health parameters (like temperature, pH, salinity, and dissolved oxygen) across 6 key coastal locations in Visakhapatnam (Vizag).

---

## 📖 What is this project? (In Simple Terms)
Imagine a scientist goes to a beach (like *RK Beach* or *Rushikonda*) and uses a specialized water-quality sensor (a Kor instrument). The sensor takes hundreds of readings and saves them as a `.csv` spreadsheet.

This project does three main things:
1. **Uploads and Reads:** It lets you upload these spreadsheet files.
2. **Saves:** It reads the spreadsheets using a Python backend and stores all the numbers in an SQLite database.
3. **Visualizes:** It displays the data on a web dashboard with beautiful, interactive charts so anyone can study the water health trends over time.

```text
  [Raw Sensor CSV File] 
           │
           ▼ (Upload)
  ┌─────────────────────────────────┐
  │ Flask Backend (Python)          │ ◄── Parses the file, calculates statistics
  └────────────────┬────────────────┘
                   │ (Saves to)
                   ▼
  ┌─────────────────────────────────┐
  │ SQLite Database (ocean_data.db) │ ◄── Securely stores readings & upload history
  └────────────────┬────────────────┘
                   │ (Fetches data)
                   ▼
  ┌─────────────────────────────────┐
  │ React Frontend (Vite + Tailwind)│ ◄── Draws interactive charts & export tables
  └─────────────────────────────────┘
```

---

## ✨ Features (What you can do)

*   **📂 Easy Uploads:** Select one or multiple sensor CSV files, pick a date, and upload them. The system automatically detects which beach the file came from based on its name!
*   **📊 Interactive Dashboard:** See quick stats (total uploads, active days, number of locations tracked, etc.).
*   **📈 Parameter Analysis:** Select a parameter (like *pH* or *Temperature*) and view interactive graphs showing its behavior over time.
*   **📋 Master Dataset Table:** View a clean table of all data combined, with options to filter by date and location.
*   **📥 One-Click Excel Export:** Download your data as clean Microsoft Excel spreadsheets (`.xlsx`) directly from the browser.
*   **⚙️ Ingestion History:** View a list of what files were uploaded and when, with a delete option to remove incorrect data.

---

## 🛠️ The Tech Stack (What we built it with)

*   **Frontend (The Web Interface):**
    *   **React (Vite)** – A modern library for building fast, responsive user interfaces.
    *   **TailwindCSS (v4)** – For premium, clean, and modern styling.
    *   **Plotly.js** – Used to render interactive, zoomable charts and graphs.
*   **Backend (The Server & Database):**
    *   **Flask (Python)** – A lightweight server to handle requests from the website.
    *   **SQLite** – A simple, fast database file (`ocean_data.db`) that stores all readings.
    *   **Pandas & NumPy** – Python tools used to clean the data and calculate means and standard deviations.

---

## 📁 Folder Structure (Where is everything?)

Here is where the key files are located:
*   📂 `backend/` — The Python code.
    *   `app.py` — The main server file where all URL routes (endpoints) are defined.
    *   `database.py` — Creates the database tables and runs SQL queries.
    *   `parser.py` — The core logic that reads raw CSV files and extracts numbers.
*   📂 `frontend/` — The website interface.
    *   `src/pages/` — The different screens (Dashboard, Upload, Master Dataset, Analysis).
    *   `src/api.js` — The bridge that connects the frontend to the backend.
*   📂 `sample csv file/` — Example sensor files you can use to test the application.
*   📄 `start.ps1` — The startup script for Windows.

---

## 🚀 How to Run the Project (Step-by-Step)

### Prerequisites
Make sure you have these installed on your computer:
1. **[Python 3.13+](https://www.python.org/downloads/)**
2. **[Node.js](https://nodejs.org/)** (Recommended: LTS version)

---

### Method A: One-Click Startup (Windows)
We wrote a simple script that sets everything up for you!

1. Open **PowerShell** in this project folder.
2. Run this command:
   ```powershell
   ./start.ps1
   ```
3. Two new console windows will open (one for the backend, one for the frontend). 
4. Open your browser and go to: **[http://localhost:5173](http://localhost:5173)** 🎉

---

### Method B: Manual Startup (All OS)

If you aren't on Windows or prefer doing it manually, open two terminal windows:

#### Terminal 1: Run the Backend
```bash
# 1. Go into the backend folder
cd backend

# 2. Install python packages
pip install -r requirements.txt

# 3. Start the server
python app.py
```
*The backend is now running on `http://localhost:5000`.*

#### Terminal 2: Run the Frontend
```bash
# 1. Go into the frontend folder
cd frontend

# 2. Install node packages
npm install

# 3. Start the development server
npm run dev
```
*The frontend website is now running on `http://localhost:5173`.*

---

## 🧪 Quick Test Guide (Try it out!)
Want to see the app in action? Follow these simple steps:
1. Open the website: `http://localhost:5173`.
2. Go to the **Upload Data** page.
3. Choose a date (e.g., today's date) and upload the file inside `sample csv file/4th May R D0.csv` (Note: Rename this file to `Rushikonda.csv` or `SagarNagar.csv` so the system knows the location).
4. Click **Upload**.
5. Go back to the **Dashboard** or **Parameter Analysis** pages to see your data instantly visualized!
