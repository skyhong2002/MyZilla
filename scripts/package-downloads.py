#!/usr/bin/env python3
from pathlib import Path
import shutil
import zipfile
root = Path(__file__).resolve().parents[1]
destination = root / 'dist' / 'web' / 'downloads'
destination.mkdir(parents=True, exist_ok=True)
shutil.copy2(root / 'scripts' / 'import_history.py', destination / 'import_history.py')
shutil.copy2(root / 'docs' / 'import-contract.md', destination / 'import-contract.md')
shutil.copy2(root / 'docs' / 'install.md', destination / 'install.md')
for browser in ('chromium', 'firefox'):
    directory = root / 'dist' / browser
    with zipfile.ZipFile(destination / f'myzilla-{browser}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(directory.rglob('*')):
            if path.is_file(): archive.write(path, path.relative_to(directory))
