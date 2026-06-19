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
    """
    Export Master_Ocean_Data.xlsx
    Format: Date | Location | Param1 Mean | Param1 StdDev | Param2 Mean | Param2 StdDev | ...
    Columns are interleaved (Mean + StdDev side by side per parameter).
    """
    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")
    location  = request.args.get("location")

    rows = db.get_master_dataset(date_from, date_to, location)
    if not rows:
        return error("No data available for export.")

    df = pd.DataFrame(rows)

    # Get sorted parameter list
    params = sorted(df["parameter"].unique().tolist())

    # Pivot mean and std_dev separately
    mean_piv = df.pivot_table(index=["date", "location"], columns="parameter", values="mean",   aggfunc="first")
    std_piv  = df.pivot_table(index=["date", "location"], columns="parameter", values="std_dev", aggfunc="first")

    # Build interleaved column order: Param1 Mean, Param1 StdDev, Param2 Mean, ...
    result = mean_piv.copy()[[]]  # empty frame with same index
    for p in params:
        col_mean = p + " Mean"
        col_std  = p + " StdDev"
        result[col_mean] = mean_piv[p] if p in mean_piv.columns else np.nan
        result[col_std]  = std_piv[p]  if p in std_piv.columns  else np.nan

    result.reset_index(inplace=True)
    result.sort_values(["date", "location"], inplace=True)
    result.rename(columns={"date": "Date", "location": "Location"}, inplace=True)
    result.replace({np.nan: ""}, inplace=True)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        result.to_excel(writer, sheet_name="All Locations", index=False)

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
# Analysis-ready export: one sheet per location
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/export/analysis", methods=["GET"])
def export_analysis():
    """
    Export Analysis_Ready.xlsx

    Layout: One sheet per location (+ one combined sheet).
    Each sheet:
      Date | Param1 Mean | Param1 StdDev | Param2 Mean | Param2 StdDev | ...

    One row = one day. Just copy-paste into your plotting tool.
    """
    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")

    rows = db.get_master_dataset(date_from, date_to)
    if not rows:
        return error("No data available for export.")

    df = pd.DataFrame(rows)
    params    = sorted(df["parameter"].unique().tolist())
    locations = sorted(df["location"].unique().tolist())

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:

        # ── One sheet per location ────────────────────────────────────────────
        for loc in locations:
            loc_df = df[df["location"] == loc]
            mean_piv = loc_df.pivot_table(index="date", columns="parameter", values="mean",   aggfunc="first")
            std_piv  = loc_df.pivot_table(index="date", columns="parameter", values="std_dev", aggfunc="first")

            sheet = pd.DataFrame(index=mean_piv.index)
            for p in params:
                sheet[p + " Mean"]   = mean_piv[p] if p in mean_piv.columns else np.nan
                sheet[p + " StdDev"] = std_piv[p]  if p in std_piv.columns  else np.nan

            sheet.reset_index(inplace=True)
            sheet.rename(columns={"date": "Date"}, inplace=True)
            sheet.replace({np.nan: ""}, inplace=True)

            # Sheet name max 31 chars (Excel limit)
            sheet_name = loc[:31]
            sheet.to_excel(writer, sheet_name=sheet_name, index=False)

        # ── Combined sheet: Date | Location | Param1 Mean | Param1 StdDev | … ─
        mean_piv_all = df.pivot_table(index=["date", "location"], columns="parameter", values="mean",   aggfunc="first")
        std_piv_all  = df.pivot_table(index=["date", "location"], columns="parameter", values="std_dev", aggfunc="first")
        combined = pd.DataFrame(index=mean_piv_all.index)
        for p in params:
            combined[p + " Mean"]   = mean_piv_all[p] if p in mean_piv_all.columns else np.nan
            combined[p + " StdDev"] = std_piv_all[p]  if p in std_piv_all.columns  else np.nan
        combined.reset_index(inplace=True)
        combined.rename(columns={"date": "Date", "location": "Location"}, inplace=True)
        combined.replace({np.nan: ""}, inplace=True)
        combined.to_excel(writer, sheet_name="All Locations", index=False)

    output.seek(0)
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="Analysis_Ready.xlsx",
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
# Debug: inspect raw file structure (not stored in DB)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/debug-parse", methods=["POST"])
def debug_parse():
    """
    Upload one CSV file and get a JSON dump of:
    - Encoding detected
    - Delimiter detected
    - First 25 rows (each as a list of cells)
    - Which row looks like Mean / StdDev / Header
    Use this to diagnose parse failures without touching the database.
    """
    from parser import decode_file, detect_delimiter, is_mean_row_label, is_std_row_label, is_header_row, safe_float
    import csv as csv_mod

    files = request.files.getlist("file") or request.files.getlist("files")
    if not files or not files[0].filename:
        return error("Upload one file with key 'file'.")

    f    = files[0]
    raw  = f.read()
    name = os.path.basename(f.filename)

    # Detect encoding
    enc_used = "unknown"
    text = None
    for enc in ["utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "utf-8", "latin-1"]:
        try:
            text = raw.decode(enc)
            enc_used = enc
            break
        except Exception:
            continue

    if text is None:
        return error("Could not decode file.")

    # Strip sep= line
    lines = text.splitlines(keepends=True)
    had_sep_line = bool(lines and re.match(r"^sep\s*=", lines[0].strip(), re.IGNORECASE))
    if had_sep_line:
        text = "".join(lines[1:])

    delimiter = detect_delimiter(text[:5000])

    # Read all rows
    reader   = csv_mod.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = list(reader)
    max_cols = max((len(r) for r in all_rows), default=1)

    # Build annotated rows
    annotated = []
    for i, row in enumerate(all_rows[:30]):
        first   = row[0].strip() if row else ""
        is_mean = is_mean_row_label(first)
        is_std  = is_std_row_label(first)
        is_hdr  = is_header_row(row)

        # Count how many cells are non-empty and non-numeric
        str_cells = sum(1 for c in row if c.strip() and safe_float(c) is None and len(c.strip()) > 1)

        annotated.append({
            "row_idx":    i,
            "cells":      row[:20],            # cap at 20 for readability
            "num_cells":  len(row),
            "str_cells":  str_cells,
            "is_mean":    is_mean,
            "is_std":     is_std,
            "is_header":  is_hdr,
        })

    return success({
        "filename":       name,
        "encoding":       enc_used,
        "delimiter":      repr(delimiter),
        "had_sep_line":   had_sep_line,
        "total_rows":     len(all_rows),
        "max_cols":       max_cols,
        "rows":           annotated,
    })


# ─────────────────────────────────────────────────────────────────────────────

import re

if __name__ == "__main__":
    app.run(debug=True, port=5000)
