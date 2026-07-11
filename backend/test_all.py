"""Test all CSV files in the PROJECT folder."""
import sys, os, glob
sys.path.insert(0, os.path.dirname(__file__))
from parser import parse_csv_file

project_dir = r'C:\Users\saisu\OneDrive\Desktop\PROJECT'
csv_files   = glob.glob(os.path.join(project_dir, '**', '*.csv'), recursive=True)
csv_files.sort()

print(f'Found {len(csv_files)} CSV files\n')

passed = 0
failed = 0
for path in csv_files:
    fname = os.path.basename(path)
    folder = os.path.basename(os.path.dirname(path))
    try:
        with open(path, 'rb') as f:
            raw = f.read()
        result = parse_csv_file(raw, fname)
        loc   = result['location'] or '(none)'
        npar  = len(result['parameters'])
        nread = next(iter(result['stats'].values()))['sample_count'] if result['stats'] else 0
        print(f'  OK  [{folder}] {fname:<35} -> {loc:<15} {npar} params  {nread} readings')
        passed += 1
    except Exception as e:
        print(f'  FAIL [{folder}] {fname:<35} -> {e}')
        failed += 1

print(f'\n{passed} passed, {failed} failed out of {len(csv_files)} files')
