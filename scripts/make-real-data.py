"""Exports public R datasets (pydataset package) to CSV for the false-alarm check. pip install pydataset"""
import os, warnings
warnings.filterwarnings('ignore')
from pydataset import data
out = os.path.join(os.path.dirname(__file__), '..', 'testbench', 'real')
os.makedirs(out, exist_ok=True)
for nm in data()['dataset_id'].tolist():
    try:
        df = data(nm)
        if df.shape[0] >= 20 and df.shape[1] >= 2:
            df.to_csv(os.path.join(out, f'pyd_{nm}.csv'), index=False)
    except Exception:
        pass
