"""Quick test script to verify parser output against the real sample file."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from parser import parse_csv_file
from unittest.mock import patch

sample_path = os.path.join(os.path.dirname(__file__), '..', 'sample csv file', '4th May R D0.csv')

with open(sample_path, 'rb') as f:
    data = f.read()

# Patch detect_location so we can test parsing without a valid location filename
with patch('parser.detect_location', return_value='Rushikonda'):
    result = parse_csv_file(data, 'Rushikonda.csv')

print(f"Location: {result['location']}")
print(f"Parameters detected: {len(result['parameters'])}")
print()
for p in result['parameters']:
    s = result['stats'][p]
    print(f"  {p:<35} mean={s['mean']}  std={s['std_dev']}  "
          f"min={s['min_val']}  max={s['max_val']}  n={s['sample_count']}  raw={len(s['raw'])}")

print()
print("PASS: Parser completed successfully.")
