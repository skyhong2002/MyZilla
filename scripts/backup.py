"""Create a consistent SQLite backup without overwriting an existing file."""
from contextlib import closing
import argparse
import os
from pathlib import Path
import sqlite3


def backup(source, destination):
    source = Path(source).resolve()
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(destination)) as copy:
                original.backup(copy)
                if copy.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise RuntimeError("Backup integrity check failed")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    print(f"Verified backup: {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination")
    parser.add_argument("--source", default=os.environ.get("MYZILLA_DB", "data/myzilla.sqlite"))
    args = parser.parse_args()
    backup(args.source, args.destination)
