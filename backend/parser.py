"""
parser.py - Robust parser for Kor water quality instrument CSV files.

Actual Kor file format (UTF-16, comma-separated):
  Row 1:  sep=,
  Row 2:  Kor MEASUREMENT DATA FILE EXPORT
  Row 3:  (blank)
  Row 4:  FILE CREATED:,<timestamp>
  Row 5:  (blank)
  Row 6:  MEAN VALUE:,,,,,,<val>,<val>,...
  Row 7:  STANDARD DEVIATION:,,,...
  Row 8:  (blank)
  Row 9:  SENSOR SERIAL NUMBER:,,,...
  Row 10: TIME (h:mm:ss tt),DATE (M/d/yyyy),FILE NAME,...,<param1>,<param2>,...
  Row 11+: raw sensor readings

Filename formats handled:
  Rushikonda.csv
  SagarNagar.csv
  2nd may Sagarnagar.csv   ← compound filename with date prefix
  Kailasagiri.csv
  etc.
"""

import io
import re
import csv as csv_mod
import numpy as np
import pandas as pd
from typing import Optional

# ── Location map: normalized key → canonical name ─────────────────────────────
LOCATION_MAP = {
    "rushikonda":     "Rushikonda",
    "sagarnagar":     "Sagar Nagar",
    "sagarnagara":    "Sagar Nagar",
    "kailasagiri":    "Kailasagiri",
    "kailashagiri":   "Kailasagiri",
    "rkbeach":        "RK Beach",
    "novotel":        "Novotel",
    "fishingharbour": "Fishing Harbour",
    "fishingharbor":  "Fishing Harbour",
    "fishing":        "Fishing Harbour",
}

# Metadata / non-parameter column keywords
METADATA_COL_PATTERNS = [
    "time", "date", "file name", "site name", "user id",
    "fault code", "sensor serial", "barometer",
]

# Keywords that positively identify a header row
HEADER_KEYWORDS = ["time", "date", "cond", "temp", "ph", "odo", "sal", "turb",
                   "tds", "orp", "spcond", "nlf"]


def normalize_key(text: str) -> str:
    """Remove spaces, hyphens, underscores, digits and lowercase."""
    return re.sub(r"[\s\-_\d]+", "", text).lower()


def normalize_loc_key(text: str) -> str:
    """Remove ALL non-alpha characters and lowercase for location matching."""
    return re.sub(r"[^a-z]", "", text.lower())


def detect_location(filename: str) -> Optional[str]:
    """
    Infer canonical location from filename.
    Handles simple names (Rushikonda.csv) and compound names
    (2nd may Sagarnagar.csv, 4th May R D0.csv).
    """
    stem = re.sub(r"\.[^.]+$", "", filename)   # remove extension

    # Strategy 1: exact key match on the whole stem
    key = normalize_loc_key(stem)
    if key in LOCATION_MAP:
        return LOCATION_MAP[key]

    # Strategy 2: check if any location key is a substring of the stem key
    for k, v in LOCATION_MAP.items():
        if k in key:
            return v

    # Strategy 3: try each whitespace/underscore token in the filename separately
    tokens = re.split(r"[\s_\-]+", stem)
    for token in tokens:
        tok_key = normalize_loc_key(token)
        if tok_key in LOCATION_MAP:
            return LOCATION_MAP[tok_key]
        for k, v in LOCATION_MAP.items():
            if k in tok_key or tok_key in k:
                return v

    return None


def decode_file(file_bytes: bytes) -> str:
    """Try multiple encodings to decode the file content."""
    encodings = ["utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "utf-8", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            text = file_bytes.decode(enc)
            if len(text) > 10:
                return text
        except (UnicodeDecodeError, LookupError):
            continue
    raise ValueError("Unable to decode file with known encodings.")


def detect_delimiter(text_sample: str) -> str:
    """Detect whether the file uses tab or comma as delimiter."""
    tab_count   = text_sample.count("\t")
    comma_count = text_sample.count(",")
    return "\t" if tab_count > comma_count else ","


def is_mean_row_label(label: str) -> bool:
    l = label.strip().lower()
    return any(kw in l for kw in ["mean value", "mean", "average"])


def is_std_row_label(label: str) -> bool:
    l = label.strip().lower()
    return any(kw in l for kw in ["std dev", "std. dev", "standard deviation", "stddev"])


def _row_str(row) -> list:
    """Convert a DataFrame row to a list of stripped strings (None for empty)."""
    result = []
    for v in row:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            result.append(None)
        else:
            s = str(v).strip()
            result.append(s if s else None)
    return result


def is_header_row(row_values: list) -> bool:
    """
    Identify the data header row.
    Looks across ALL cells (not just first 8) for TIME/DATE or known parameter keywords.
    """
    cells = [str(v).lower().strip() for v in row_values if v is not None]
    joined = " ".join(cells)

    # Strong signal: TIME and DATE both present
    if any("time" in c for c in cells) and any("date" in c and "created" not in c for c in cells):
        return True

    # Also accept: row where DATE appears but not "file created"
    for c in cells:
        if "time" in c and c not in ("datetime",):
            return True

    # Fallback: row has multiple known header keywords (at least 3)
    hits = sum(1 for kw in HEADER_KEYWORDS if kw in joined)
    if hits >= 3:
        return True

    return False


def is_metadata_column(col_name: str) -> bool:
    """Returns True if column is metadata, not a sensor parameter."""
    col_lower = col_name.lower().strip()
    for pattern in METADATA_COL_PATTERNS:
        if pattern in col_lower:
            return True
    return False


def safe_float(val) -> Optional[float]:
    """Parse a value to float, returning None if not possible."""
    try:
        s = str(val).strip().replace(",", ".")
        if s.upper() in ("NA", "N/A", "NAN", "", "NONE", "NONE"):
            return None
        f = float(s)
        return f if np.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _find_header_row(df: pd.DataFrame, mean_idx: Optional[int], std_idx: Optional[int]) -> Optional[int]:
    """
    Find the data header row using multiple strategies, from most to least reliable.

    Strategy 1 (BEST): Position-based.
      If we know where Mean/StdDev rows are, scan forward from there.
      The header is the first row AFTER both special rows that has 4+ non-numeric string cells.

    Strategy 2: Keyword-based.
      Search all rows for TIME/DATE or 3+ parameter keywords.

    Strategy 3 (FALLBACK): Pick the row with the most non-numeric string cells,
      ignoring rows that look like metadata (first cell contains ':').
    """
    # ── Helper ────────────────────────────────────────────────────────────────
    def str_cell_count(row) -> int:
        return sum(
            1 for v in row
            if v is not None and str(v).strip()
            and safe_float(str(v).strip()) is None
            and len(str(v).strip()) > 1
        )

    # Start scanning from just after the last special row we found
    scan_start = 0
    if mean_idx is not None:
        scan_start = max(scan_start, mean_idx + 1)
    if std_idx is not None:
        scan_start = max(scan_start, std_idx + 1)

    # ── Strategy 1: position-based forward scan ───────────────────────────────
    if scan_start > 0:
        for i in range(scan_start, min(scan_start + 20, len(df))):
            row   = df.iloc[i].tolist()
            first = str(row[0]).strip() if row[0] is not None else ""
            # Skip metadata rows (SENSOR SERIAL NUMBER:, FILE CREATED:, etc.)
            if first.endswith(":") or (first and first[-1] == ":"):
                continue
            scc = str_cell_count(row)
            if scc >= 4:
                return i

    # ── Strategy 2: keyword scan across the whole file ───────────────────────
    for i, row in df.iterrows():
        if is_header_row(row.tolist()):
            return i

    # ── Strategy 3: row with most non-numeric string cells ───────────────────
    # (skip rows whose first cell contains ':' — those are metadata labels)
    best_idx   = None
    best_score = 0
    for i, row in df.iterrows():
        first = str(row.iloc[0]).strip() if row.iloc[0] is not None else ""
        if ":" in first:
            continue   # skip MEAN VALUE:, FILE CREATED:, etc.
        scc = str_cell_count(row.tolist())
        if scc > best_score:
            best_score = scc
            best_idx   = i

    return best_idx   # may still be None if file is completely empty/numeric



def parse_csv_file(file_bytes: bytes, filename: str) -> dict:
    """
    Parse a Kor instrument UTF-16 CSV water quality file.

    Returns:
        {
            "location":   str | None,
            "parameters": [str, ...],
            "stats": {
                param: {
                    "mean": float|None,
                    "std_dev": float|None,
                    "min_val": float|None,
                    "max_val": float|None,
                    "sample_count": int,
                    "raw": [float, ...]
                }
            }
        }
    """
    location = detect_location(filename)

    # ── Decode ────────────────────────────────────────────────────────────────
    text = decode_file(file_bytes)

    # Remove "sep=," line if present
    lines = text.splitlines(keepends=True)
    if lines and re.match(r"^sep\s*=", lines[0].strip(), re.IGNORECASE):
        text = "".join(lines[1:])

    # Detect delimiter
    delimiter = detect_delimiter(text[:5000])

    # ── Parse into rows via csv.reader (handles variable-width rows) ──────────
    reader  = csv_mod.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = list(reader)

    if not all_rows:
        raise ValueError(f"File '{filename}' appears to be empty.")

    max_cols = max((len(r) for r in all_rows), default=1)
    padded   = [r + [None] * (max_cols - len(r)) for r in all_rows]
    df       = pd.DataFrame(padded).replace("", None)

    # ── Identify key rows ─────────────────────────────────────────────────────
    mean_row_idx   = None
    std_row_idx    = None

    for i, row in df.iterrows():
        first = str(row.iloc[0]).strip() if row.iloc[0] is not None else ""
        if mean_row_idx is None and is_mean_row_label(first):
            mean_row_idx = i
        elif std_row_idx is None and is_std_row_label(first):
            std_row_idx = i


    # Find header row — pass mean/std indices so position-based strategy works first
    header_row_idx = _find_header_row(df, mean_row_idx, std_row_idx)

    if header_row_idx is None:
        # Build a diagnostic dump for the error message
        sample_rows = []
        for i, row in df.head(12).iterrows():
            cells = [str(v) for v in row.tolist() if v is not None][:8]
            sample_rows.append(f"  Row {i}: {cells}")
        dump = "\n".join(sample_rows)
        raise ValueError(
            f"Could not locate the parameter header row in '{filename}'.\n"
            f"First 12 rows seen:\n{dump}"
        )

    # ── Parse column headers ──────────────────────────────────────────────────
    header_row = df.iloc[header_row_idx]
    total_cols = len(header_row)

    param_cols = {}  # col_index → parameter name
    for col_idx in range(total_cols):
        val = header_row.iloc[col_idx]
        if val is None:
            continue
        col_name = str(val).strip()
        if not col_name:
            continue
        if is_metadata_column(col_name):
            continue
        if safe_float(col_name) is not None:
            continue   # skip numeric-looking headers
        param_cols[col_idx] = col_name

    if not param_cols:
        raise ValueError(f"No sensor parameter columns found in '{filename}'. "
                         f"All columns appear to be metadata or numeric.")

    # ── Extract file-level Mean and Std Dev ───────────────────────────────────
    def extract_row_values(row_idx):
        if row_idx is None:
            return {}
        row    = df.iloc[row_idx]
        result = {}
        for col_idx in param_cols:
            if col_idx < len(row):
                result[col_idx] = safe_float(row.iloc[col_idx])
        return result

    file_means = extract_row_values(mean_row_idx)
    file_stds  = extract_row_values(std_row_idx)

    # ── Extract raw readings ──────────────────────────────────────────────────
    special_idxs = {i for i in [mean_row_idx, std_row_idx, header_row_idx] if i is not None}
    raw_df       = df.iloc[header_row_idx + 1:].copy()
    raw_df       = raw_df[~raw_df.index.isin(special_idxs)]
    raw_numeric  = raw_df.apply(pd.to_numeric, errors="coerce")
    raw_numeric  = raw_numeric.dropna(how="all")

    # ── Build stats per parameter ─────────────────────────────────────────────
    stats = {}
    for col_idx, param in param_cols.items():
        # Raw values
        if col_idx < raw_numeric.shape[1]:
            raw_series = raw_numeric.iloc[:, col_idx].dropna().tolist()
        else:
            raw_series = []

        file_mean = file_means.get(col_idx)
        file_std  = file_stds.get(col_idx)

        # Calculate from raw
        if raw_series:
            arr   = np.array(raw_series, dtype=float)
            valid = arr[np.isfinite(arr)]
            if len(valid) > 0:
                calc_mean    = float(np.mean(valid))
                calc_std     = float(np.std(valid, ddof=1)) if len(valid) > 1 else 0.0
                calc_min     = float(np.min(valid))
                calc_max     = float(np.max(valid))
                sample_count = int(len(valid))
            else:
                calc_mean = calc_std = calc_min = calc_max = None
                sample_count = 0
        else:
            calc_mean = calc_std = calc_min = calc_max = None
            sample_count = 0

        # Prefer file-extracted values; fall back to calculated
        final_mean = file_mean if file_mean is not None else calc_mean
        final_std  = file_std  if file_std  is not None else calc_std

        stats[param] = {
            "mean":         final_mean,
            "std_dev":      final_std,
            "min_val":      calc_min,
            "max_val":      calc_max,
            "sample_count": sample_count,
            "raw":          raw_series,
        }

    return {
        "location":   location,
        "parameters": list(param_cols.values()),
        "stats":      stats,
    }
