"""
parser.py - Robust parser for Kor water quality instrument CSV files.

Actual Kor file format (UTF-16, comma-separated):
  Row 1:  sep=,
  Row 2:  Kor MEASUREMENT DATA FILE EXPORT
  Row 3:  (blank)
  Row 4:  FILE CREATED:,<timestamp>
  Row 5:  (blank)
  Row 6:  MEAN VALUE:,,,,,,<val>,<val>,...   <- aligned to data columns
  Row 7:  STANDARD DEVIATION:,,,...           <- aligned to data columns
  Row 8:  (blank)
  Row 9:  SENSOR SERIAL NUMBER:,,,...
  Row 10: TIME (h:mm:ss tt),DATE (M/d/yyyy),FILE NAME,SITE NAME,USER ID,
          FAULT CODE,<param1>,<param2>,...    <- column headers
  Row 11+: raw sensor readings

The parser:
- Auto-detects encoding (UTF-16, UTF-8-BOM, UTF-8, Latin-1)
- Detects Mean/StdDev rows by label in first column
- Finds the data header row (contains TIME and DATE)
- Identifies non-metadata (parameter) columns automatically
- Extracts file Mean & Std Dev values aligned to the data columns
- Reads raw readings from the measurement rows
- If Mean/StdDev are missing or zero, calculates from raw data
- Returns per-parameter stats + raw values
"""

import io
import re
import numpy as np
import pandas as pd
from typing import Optional

# ── Known location name variants → canonical name ─────────────────────────────
LOCATION_MAP = {
    "rushikonda":     "Rushikonda",
    "sagarnagar":     "Sagar Nagar",
    "sagarnagara":    "Sagar Nagar",
    "kailasagiri":    "Kailasagiri",
    "rkbeach":        "RK Beach",
    "novotel":        "Novotel",
    "fishingharbour": "Fishing Harbour",
    "fishingharbor":  "Fishing Harbour",
}

# Metadata columns that appear before the actual sensor parameters
METADATA_COL_PATTERNS = [
    "time", "date", "file name", "site name", "user id",
    "fault code", "sensor serial", "barometer",
]


def normalize_key(text: str) -> str:
    """Remove spaces, hyphens, underscores and lowercase for fuzzy matching."""
    return re.sub(r"[\s\-_]+", "", text).lower()


def detect_location(filename: str) -> Optional[str]:
    """
    Infer canonical location name from filename.
    e.g. 'SagarNagar.csv' -> 'Sagar Nagar'
         '4th May R D0.csv' -> None (not a location file)
    """
    stem = re.sub(r"\.[^.]+$", "", filename)  # remove extension
    # Strip leading date-like patterns e.g. "4th May " or "May_05_"
    stem = re.sub(r"^\d+\w*\s+\w+\s+", "", stem).strip()
    key = normalize_key(stem)
    if key in LOCATION_MAP:
        return LOCATION_MAP[key]
    # Fuzzy: try partial matching
    for k, v in LOCATION_MAP.items():
        if k in key or key in k:
            return v
    return None


def decode_file(file_bytes: bytes) -> str:
    """Try multiple encodings to decode the file content."""
    encodings = ["utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "utf-8", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            text = file_bytes.decode(enc)
            # Quick sanity check — decoded text should be mostly ASCII printable
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


def is_header_row(row_values: list) -> bool:
    """
    A data header row has 'TIME' or 'DATE' in one of its cells.
    """
    for v in row_values[:8]:
        if v and "time" in str(v).lower():
            return True
        if v and "date" in str(v).lower() and "created" not in str(v).lower():
            return True
    return False


def is_metadata_column(col_name: str) -> bool:
    """Returns True if a column header is a metadata column, not a sensor parameter."""
    col_lower = col_name.lower().strip()
    for pattern in METADATA_COL_PATTERNS:
        if pattern in col_lower:
            return True
    # Also skip columns with purely numeric-looking headers
    return False


def safe_float(val) -> Optional[float]:
    """Parse a value to float, returning None if not possible."""
    try:
        s = str(val).strip().replace(",", ".")
        if s.upper() in ("NA", "N/A", "NAN", "", "NONE"):
            return None
        f = float(s)
        return f if np.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def parse_csv_file(file_bytes: bytes, filename: str) -> dict:
    """
    Parse a Kor instrument UTF-16 CSV water quality file.

    Returns:
        {
            "location":   str,
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

    # Decode
    text = decode_file(file_bytes)

    # Remove the "sep=," line if present (it confuses pandas and delimiter detection)
    lines = text.splitlines(keepends=True)
    if lines and re.match(r"^sep\s*=", lines[0].strip(), re.IGNORECASE):
        text = "".join(lines[1:])

    # Detect delimiter on clean text
    sample = text[:5000]
    delimiter = detect_delimiter(sample)

    # Parse with Python's csv module to handle variable-width rows correctly.
    # (pandas with on_bad_lines='skip' drops rows that don't match col count of row 0)
    import csv as csv_mod
    reader = csv_mod.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = list(reader)

    # Find the maximum number of columns (from the header/data rows)
    max_cols = max((len(r) for r in all_rows), default=1)

    # Pad each row to max_cols and convert to a DataFrame
    padded = [r + [None] * (max_cols - len(r)) for r in all_rows]
    df = pd.DataFrame(padded)

    # Fill empty-string cells with None
    df = df.replace("", None)

    # ── Scan rows to identify key rows ───────────────────────────────────────
    mean_row_idx   = None
    std_row_idx    = None
    header_row_idx = None

    for i, row in df.iterrows():
        first = str(row.iloc[0]).strip() if row.iloc[0] is not None else ""
        # Check for Mean row
        if mean_row_idx is None and is_mean_row_label(first):
            mean_row_idx = i
        # Check for Std Dev row
        elif std_row_idx is None and is_std_row_label(first):
            std_row_idx = i
        # Check for data header row
        elif header_row_idx is None and is_header_row(row.tolist()):
            header_row_idx = i
            break  # Stop after finding the header row

    if header_row_idx is None:
        raise ValueError(f"No data header row found in '{filename}'. "
                         "Expected a row containing 'TIME' or 'DATE'.")

    # ── Parse column headers ──────────────────────────────────────────────────
    header_row = df.iloc[header_row_idx]
    total_cols = len(header_row)

    # Map: col_index -> cleaned parameter name
    param_cols = {}
    for col_idx in range(total_cols):
        val = header_row.iloc[col_idx]
        if val is None:
            continue
        col_name = str(val).strip()
        if not col_name:
            continue
        if is_metadata_column(col_name):
            continue
        # Skip purely numeric headers
        if safe_float(col_name) is not None:
            continue
        param_cols[col_idx] = col_name

    if not param_cols:
        raise ValueError(f"No sensor parameter columns found in '{filename}'.")

    # ── Extract file Mean and Std Dev values ──────────────────────────────────
    # These rows have the same column alignment as the header row.
    # The label is in column 0, actual values start from the first parameter col.

    def extract_row_values(row_idx):
        """Extract numeric values from a special row, indexed by column."""
        if row_idx is None:
            return {}
        row = df.iloc[row_idx]
        result = {}
        for col_idx in param_cols:
            if col_idx < len(row):
                result[col_idx] = safe_float(row.iloc[col_idx])
        return result

    file_means = extract_row_values(mean_row_idx)
    file_stds  = extract_row_values(std_row_idx)

    # ── Extract raw readings ──────────────────────────────────────────────────
    # All rows after header_row_idx that are not special rows
    special_idxs = set(filter(None.__ne__, [mean_row_idx, std_row_idx, header_row_idx]))

    raw_df = df.iloc[header_row_idx + 1:].copy()
    raw_df = raw_df[~raw_df.index.isin(special_idxs)]

    # Convert to numeric (coerce errors)
    raw_numeric = raw_df.apply(pd.to_numeric, errors="coerce")

    # Drop completely empty rows
    raw_numeric = raw_numeric.dropna(how="all")

    # ── Build stats per parameter ─────────────────────────────────────────────
    stats = {}
    for col_idx, param in param_cols.items():
        # Raw values for this column
        if col_idx < raw_numeric.shape[1]:
            raw_series = raw_numeric.iloc[:, col_idx].dropna().tolist()
        else:
            raw_series = []

        # File-extracted Mean and Std
        file_mean = file_means.get(col_idx)
        file_std  = file_stds.get(col_idx)

        # Calculate from raw data
        if raw_series:
            arr = np.array(raw_series, dtype=float)
            valid = arr[~np.isnan(arr)]
            if len(valid) > 0:
                calc_mean   = float(np.mean(valid))
                calc_std    = float(np.std(valid, ddof=1)) if len(valid) > 1 else 0.0
                calc_min    = float(np.min(valid))
                calc_max    = float(np.max(valid))
                sample_count = int(len(valid))
            else:
                calc_mean = calc_std = calc_min = calc_max = None
                sample_count = 0
        else:
            calc_mean = calc_std = calc_min = calc_max = None
            sample_count = 0

        # Prefer file values for Mean/Std; always use computed Min/Max/Count
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
