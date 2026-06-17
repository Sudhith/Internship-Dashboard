"""
app.py - Flask API for iOcean Water Quality Dashboard
"""

import io
import os
from datetime import datetime

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

import database as db
from parser import parse_csv_file, detect_location

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize DB on startup
db.init_db()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


def success(data, code: int = 200):
    return jsonify(data), code


# ─────────────────────────────────────────────────────────────────────────────
# Upload endpoint
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/upload", methods=["POST"])
def upload():
    """
    Receive multiple CSV files plus a target date.
    Process each file: parse, detect location, store stats + raw readings.
    """
    date_str = request.form.get("date", "").strip()
    if not date_str:
        return error("No date provided.")

    # Validate date format
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return error("Invalid date format. Use YYYY-MM-DD.")

    files = request.files.getlist("files")
    if not files:
        return error("No files uploaded.")

    results = []
    errors  = []

    for f in files:
        filename = os.path.basename(f.filename)
        if not filename:
            continue

        # Detect location
        location = detect_location(filename)
        if location is None:
            errors.append({
                "filename": filename,
                "error": f"Cannot determine location from filename '{filename}'."
            })
            continue

        # Check for duplicate
        if db.check_duplicate(date_str, location):
            errors.append({
                "filename": filename,
                "location": location,
                "error": f"Duplicate: data for {location} on {date_str} already exists."
            })
            continue

        # Parse CSV
        try:
            file_bytes = f.read()
            parsed = parse_csv_file(file_bytes, filename)
        except Exception as exc:
            errors.append({
                "filename": filename,
                "location": location,
                "error": f"Parse error: {str(exc)}"
            })
            continue

        # Store to DB
        try:
            # Delete any pre-existing raw readings (shouldn't exist if duplicate check passed)
            db.delete_raw_readings(date_str, location)

            for param, pdata in parsed["stats"].items():
                # Upsert statistics
                db.upsert_stat(
                    date=date_str,
                    location=location,
                    parameter=param,
                    mean=pdata["mean"],
                    std_dev=pdata["std_dev"],
                    min_val=pdata["min_val"],
                    max_val=pdata["max_val"],
                    sample_count=pdata["sample_count"],
                )
                # Insert raw readings
                if pdata["raw"]:
                    db.insert_raw_readings(date_str, location, param, pdata["raw"])

            # Record upload
            db.insert_upload(date_str, location, filename)

            results.append({
                "filename":   filename,
                "location":   location,
                "parameters": parsed["parameters"],
                "status":     "success",
            })
        except Exception as exc:
            errors.append({
                "filename": filename,
                "location": location,
                "error": f"DB error: {str(exc)}"
            })

    return success({
        "processed": results,
        "errors":    errors,
        "total":     len(results),
        "failed":    len(errors),
    })


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard Stats
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
def get_stats():
    return success(db.get_dashboard_stats())


@app.route("/api/parameters", methods=["GET"])
def get_parameters():
    return success({"parameters": db.get_all_parameters()})


@app.route("/api/locations", methods=["GET"])
def get_locations():
    return success({"locations": db.get_all_locations()})


@app.route("/api/dates", methods=["GET"])
def get_dates():
    return success({"dates": db.get_all_dates()})


@app.route("/api/upload-log", methods=["GET"])
def get_upload_log():
    return success({"uploads": db.get_upload_log()})


# ─────────────────────────────────────────────────────────────────────────────
# Master Dataset
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/master-dataset", methods=["GET"])
def get_master_dataset():
    """
    Returns the pivoted master dataset as a list of rows, where each row is:
    { date, location, <param>_mean, <param>_std_dev, ... }
    """
    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")
    location  = request.args.get("location")

    rows = db.get_master_dataset(date_from, date_to, location)

    if not rows:
        return success({"columns": [], "rows": []})

    # Pivot: one row per (date, location)
    df = pd.DataFrame(rows)
    pivoted = df.pivot_table(
        index=["date", "location"],
        columns="parameter",
        values=["mean", "std_dev"],
        aggfunc="first",
    )
    pivoted.columns = [f"{param}_{stat}" for stat, param in pivoted.columns]
    pivoted.reset_index(inplace=True)
    pivoted.sort_values(["date", "location"], inplace=True)

    columns = list(pivoted.columns)
    rows_out = pivoted.replace({np.nan: None}).to_dict(orient="records")

    return success({"columns": columns, "rows": rows_out})


# ─────────────────────────────────────────────────────────────────────────────
# Parameter Analysis
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/parameter-analysis", methods=["GET"])
def get_parameter_analysis():
    parameter = request.args.get("parameter", "").strip()
    if not parameter:
        return error("No parameter specified.")

    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")
    location  = request.args.get("location")

    rows = db.get_parameter_analysis(parameter, date_from, date_to, location)

    # Replace NaN/None safely
    clean_rows = []
    for r in rows:
        clean = {}
        for k, v in r.items():
            if v is None or (isinstance(v, float) and np.isnan(v)):
                clean[k] = None
            else:
                clean[k] = v
        clean_rows.append(clean)

    return success({"parameter": parameter, "data": clean_rows})


# ─────────────────────────────────────────────────────────────────────────────
# Export Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/export/master", methods=["GET"])
def export_master():
    """Export Master_Ocean_Data.xlsx"""
    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")
    location  = request.args.get("location")

    rows = db.get_master_dataset(date_from, date_to, location)
    if not rows:
        return error("No data available for export.")

    df = pd.DataFrame(rows)
    pivoted = df.pivot_table(
        index=["date", "location"],
        columns="parameter",
        values=["mean", "std_dev"],
        aggfunc="first",
    )
    # Rename columns: "pH_mean", "pH_std_dev" etc.
    pivoted.columns = [f"{param}_{stat}" for stat, param in pivoted.columns]
    pivoted.reset_index(inplace=True)
    pivoted.sort_values(["date", "location"], inplace=True)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pivoted.to_excel(writer, sheet_name="Master Ocean Data", index=False)

    output.seek(0)
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="Master_Ocean_Data.xlsx",
    )


@app.route("/api/export/parameter-mean", methods=["GET"])
def export_parameter_mean():
    """
    Export <param>_Mean.xlsx
    Columns: Date | Rushikonda | Sagar Nagar | ... (one column per location)
    """
    parameter = request.args.get("parameter", "").strip()
    if not parameter:
        return error("No parameter specified.")

    rows = db.get_parameter_analysis(parameter)
    if not rows:
        return error(f"No data for parameter '{parameter}'.")

    df = pd.DataFrame(rows)
    pivoted = df.pivot_table(
        index="date",
        columns="location",
        values="mean",
        aggfunc="first",
    )
    pivoted.reset_index(inplace=True)
    pivoted.columns.name = None

    safe_param = re.sub(r"[^\w\-]", "_", parameter)
    filename = f"{safe_param}_Mean.xlsx"

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pivoted.to_excel(writer, sheet_name="Mean", index=False)

    output.seek(0)
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/export/parameter-stddev", methods=["GET"])
def export_parameter_stddev():
    """
    Export <param>_StdDev.xlsx
    Columns: Date | Rushikonda | Sagar Nagar | ...
    """
    parameter = request.args.get("parameter", "").strip()
    if not parameter:
        return error("No parameter specified.")

    rows = db.get_parameter_analysis(parameter)
    if not rows:
        return error(f"No data for parameter '{parameter}'.")

    df = pd.DataFrame(rows)
    pivoted = df.pivot_table(
        index="date",
        columns="location",
        values="std_dev",
        aggfunc="first",
    )
    pivoted.reset_index(inplace=True)
    pivoted.columns.name = None

    safe_param = re.sub(r"[^\w\-]", "_", parameter)
    filename = f"{safe_param}_StdDev.xlsx"

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pivoted.to_excel(writer, sheet_name="Std Dev", index=False)

    output.seek(0)
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Delete upload (for testing / corrections)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/upload/<int:upload_id>", methods=["DELETE"])
def delete_upload(upload_id):
    import sqlite3
    conn = db.get_connection()
    row = conn.execute("SELECT date, location FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    if not row:
        conn.close()
        return error("Upload not found.", 404)
    date, location = row["date"], row["location"]
    conn.execute("DELETE FROM uploads WHERE id = ?", (upload_id,))
    conn.execute("DELETE FROM parameter_stats WHERE date = ? AND location = ?", (date, location))
    conn.execute("DELETE FROM raw_readings WHERE date = ? AND location = ?", (date, location))
    conn.commit()
    conn.close()
    return success({"message": f"Deleted upload for {location} on {date}."})


# ─────────────────────────────────────────────────────────────────────────────

import re

if __name__ == "__main__":
    app.run(debug=True, port=5000)
