"""Offline export integration using synthetic novel data only."""
from __future__ import annotations
import json, sqlite3, tempfile, shutil, subprocess, sys, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class TestExport(unittest.TestCase):
    def test_export_and_reimport_schema(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp); skill=base/'skill'; out=base/'private-export'
            (skill/'scripts').mkdir(parents=True)
            (skill/'memory').mkdir(parents=True)
            shutil.copyfile(ROOT/'reference/original_retrieve_memory.py',skill/'scripts/retrieve_memory.py')
            (skill/'memory/query-aliases.json').write_text(json.dumps({'伊蕾娜':['灰之魔女']},ensure_ascii=False),encoding='utf-8')
            db=sqlite3.connect(skill/'memory/index.sqlite3')
            db.execute('CREATE TABLE documents (id INTEGER PRIMARY KEY, doc_type TEXT, path TEXT, source_path TEXT, title TEXT, start_offset INTEGER, end_offset INTEGER, content TEXT)')
            db.executemany('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?)',[
                (1,'summary','文章概括/a.md','小说/a.txt','小镇',0,11,"伊蕾娜与'陌生人'相遇"),
                (2,'raw','小说/a.txt','小说/a.txt','旅途',0,20,'保留换行\n和表情✨')])
            db.commit();db.close()
            cmd=[sys.executable,str(ROOT/'scripts/export_canon_sql.py'),'--skill-root',str(skill),'--out',str(out)]
            dry=subprocess.run(cmd,capture_output=True,text=True,check=True)
            self.assertIn('Dry run only',dry.stdout)
            self.assertFalse(out.exists())
            exported=subprocess.run(cmd+['--allow-corpus-export','--max-chunk-bytes','100000'],capture_output=True,text=True,check=True)
            self.assertIn('2 documents',exported.stdout)
            new=sqlite3.connect(':memory:')
            new.executescript((ROOT/'sql/schema.sql').read_text('utf8'))
            new.executescript((out/'aliases.sql').read_text('utf8'))
            for file in sorted(out.glob('canon-*.sql')):
                new.executescript(file.read_text('utf8'))
            self.assertEqual(new.execute('SELECT count(*) FROM documents').fetchone()[0],2)
            self.assertEqual(new.execute('SELECT content FROM documents WHERE id=1').fetchone()[0],"伊蕾娜与'陌生人'相遇")
            self.assertIn('灰之魔女',new.execute("SELECT value FROM meta WHERE key='query_aliases'").fetchone()[0])
            manifest=json.loads((out/'manifest.json').read_text('utf8'))
            self.assertTrue(manifest['private_corpus'])
            new.close()

if __name__=='__main__':unittest.main()
