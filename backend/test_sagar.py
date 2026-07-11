"""Quick test of the real Sagarnagar file."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from parser import parse_csv_file

path = r'C:\Users\saisu\OneDrive\Desktop\PROJECT\10th May 2026\10th May Sagarnagar.csv'
with open(path, 'rb') as f:
    raw = f.read()

result = parse_csv_file(raw, '10th May Sagarnagar.csv')
print('Location:', result['location'])
print('Parameters:', len(result['parameters']))
for p, s in result['stats'].items():
    mean_val = s['mean']
    std_val  = s['std_dev']
    n        = s['sample_count']
    print(f'  {p:<35} mean={mean_val}  std={std_val}  n={n}')
print('\nPASS')
