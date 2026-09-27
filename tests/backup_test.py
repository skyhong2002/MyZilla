from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("backup", Path(__file__).parents[1] / "scripts/backup.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackupTest(unittest.TestCase):
    def test_live_wal_backup_preserves_rows_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as root:
            source, destination = Path(root) / "source.sqlite", Path(root) / "backup.sqlite"
            with closing(sqlite3.connect(source)) as db:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE fixture (id INTEGER)")
                db.execute("INSERT INTO fixture VALUES (42)")
                db.commit()
                module.backup(source, destination)
                with closing(sqlite3.connect(destination)) as copy:
                    self.assertEqual(copy.execute("SELECT id FROM fixture").fetchall(), [(42,)])
                with self.assertRaises(FileExistsError):
                    module.backup(source, destination)
                self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
