"""
database.py - SQLite schema and helper functions for iOcean Dashboard
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "ocean_data.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    """Create tables if they do not exist."""
    conn = get_connection()
    cursor = conn.cursor()

    # Tracks each upload event (a daily folder upload session)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS uploads (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            date      TEXT    NOT NULL,
            location  TEXT    NOT NULL,
            filename  TEXT    NOT NULL,
            uploaded_at TEXT  NOT NULL DEFAULT (datetime('now')),
            UNIQUE(date, location)
        )
    """)

    # Aggregated statistics per (date, location, parameter)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parameter_stats (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            date         TEXT    NOT NULL,
            location     TEXT    NOT NULL,
            parameter    TEXT    NOT NULL,
            mean         REAL,
            std_dev      REAL,
            min_val      REAL,
            max_val      REAL,
            sample_count INTEGER,
            UNIQUE(date, location, parameter)
        )
    """)

    # Individual raw sensor readings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS raw_readings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,
            location    TEXT    NOT NULL,
            parameter   TEXT    NOT NULL,
            row_index   INTEGER NOT NULL,
            value       REAL
        )
    """)

    # Index for fast lookups
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_stats_date_loc
        ON parameter_stats(date, location)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_stats_param
        ON parameter_stats(parameter)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_raw_date_loc
        ON raw_readings(date, location)
    """)

    conn.commit()
    conn.close()


def check_duplicate(date: str, location: str) -> bool:
    """Return True if (date, location) already exists in uploads."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM uploads WHERE date = ? AND location = ?",
        (date, location)
    ).fetchone()
    conn.close()
    return row is not None


def insert_upload(date: str, location: str, filename: str):
    conn = get_connection()
    conn.execute(
        "INSERT OR IGNORE INTO uploads (date, location, filename) VALUES (?, ?, ?)",
        (date, location, filename)
    )
    conn.commit()
    conn.close()


def upsert_stat(date, location, parameter, mean, std_dev, min_val, max_val, sample_count):
    conn = get_connection()
    conn.execute("""
        INSERT INTO parameter_stats
            (date, location, parameter, mean, std_dev, min_val, max_val, sample_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, location, parameter)
        DO UPDATE SET
            mean         = excluded.mean,
            std_dev      = excluded.std_dev,
            min_val      = excluded.min_val,
            max_val      = excluded.max_val,
            sample_count = excluded.sample_count
    """, (date, location, parameter, mean, std_dev, min_val, max_val, sample_count))
    conn.commit()
    conn.close()


def insert_raw_readings(date, location, parameter, values: list):
    conn = get_connection()
    rows = [(date, location, parameter, i, v) for i, v in enumerate(values)]
    conn.executemany(
        "INSERT INTO raw_readings (date, location, parameter, row_index, value) VALUES (?, ?, ?, ?, ?)",
        rows
    )
    conn.commit()
    conn.close()


def delete_raw_readings(date, location):
    """Delete existing raw readings for a (date, location) before re-inserting."""
    conn = get_connection()
    conn.execute(
        "DELETE FROM raw_readings WHERE date = ? AND location = ?",
        (date, location)
    )
    conn.commit()
    conn.close()


# ── Query helpers ──────────────────────────────────────────────────────────────

def get_dashboard_stats():
    conn = get_connection()
    total_uploads = conn.execute("SELECT COUNT(*) FROM uploads").fetchone()[0]
    total_days    = conn.execute("SELECT COUNT(DISTINCT date) FROM uploads").fetchone()[0]
    total_locs    = conn.execute("SELECT COUNT(DISTINCT location) FROM uploads").fetchone()[0]
    total_params  = conn.execute("SELECT COUNT(DISTINCT parameter) FROM parameter_stats").fetchone()[0]
    conn.close()
    return {
        "total_uploads":    total_uploads,
        "total_days":       total_days,
        "total_locations":  total_locs,
        "total_parameters": total_params,
    }


def get_all_parameters():
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT parameter FROM parameter_stats ORDER BY parameter"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def get_all_locations():
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT location FROM parameter_stats ORDER BY location"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def get_all_dates():
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT date FROM parameter_stats ORDER BY date"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def get_master_dataset(date_from=None, date_to=None, location=None):
    """
    Return rows of (date, location, parameter, mean, std_dev) filtered
    by optional date range and location.
    """
    conn = get_connection()
    query = "SELECT date, location, parameter, mean, std_dev FROM parameter_stats WHERE 1=1"
    params = []
    if date_from:
        query += " AND date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND date <= ?"
        params.append(date_to)
    if location:
        query += " AND location = ?"
        params.append(location)
    query += " ORDER BY date, location, parameter"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_parameter_analysis(parameter, date_from=None, date_to=None, location=None):
    conn = get_connection()
    query = """
        SELECT date, location, mean, std_dev, min_val, max_val, sample_count
        FROM parameter_stats
        WHERE parameter = ?
    """
    params = [parameter]
    if date_from:
        query += " AND date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND date <= ?"
        params.append(date_to)
    if location:
        query += " AND location = ?"
        params.append(location)
    query += " ORDER BY date, location"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_upload_log():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, date, location, filename, uploaded_at FROM uploads ORDER BY uploaded_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
