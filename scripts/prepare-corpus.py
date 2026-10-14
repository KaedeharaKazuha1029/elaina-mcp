#!/usr/bin/env python3
"""Audit the exact upstream corpus and prepare private upload batches (not migrations)."""
import argparse,hashlib,json,sqlite3,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',required=True,type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args();root=a.root.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
H=lambda b:hashlib.sha256(b).hexdigest()
J=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
con=sqlite3.connect(f'{(root/"memory/index.sqlite3").as_uri()}?mode=ro&immutable=1',uri=True);con.row_factory=sqlite3.Row
rows=[dict(r) for r in con.execute('SELECT * FROM documents ORDER BY id')];fields=['id','doc_type','path','source_path','title','start_offset','end_offset','content'];docmeta=[];raw={};summaries={}
for r in rows:
 text=(root/r['path']).read_text(encoding='utf-8');expected=text if r['doc_type']=='summary' else text[r['start_offset']:r['end_offset']]
 assert expected==r['content'],f'Index mismatch: {r["id"]}'
 assert H(r['content'].encode())==r['sha256']
 r['row_hash']=H(J([r[k] for k in fields]).encode());docmeta.append({k:r[k] for k in ['id','doc_type','path','source_path','start_offset','end_offset','sha256','row_hash']})
 if r['doc_type']=='raw':raw.setdefault(r['path'],[]).append(r)
 else:summaries[r['path']]=r
for path,rs in raw.items():assert ''.join(r['content'] for r in rs)==(root/path).read_text(),f'Incomplete raw file: {path}'
novel_files=sorted((root/'小说').rglob('*.txt'));summary_files=sorted((root/'文章概括').rglob('*.md'))
assert set(raw)=={f.relative_to(root).as_posix() for f in novel_files}
assert set(summaries)=={f.relative_to(root).as_posix() for f in summary_files}
files=[]
for f in sorted(novel_files+summary_files+[f for f in (root/'memory').rglob('*') if f.is_file()]+[root/'scripts'/n for n in ['retrieve_memory.py','build_index.py','build_manifest.py','validate_canon.py']]):
 b=f.read_bytes();path=f.relative_to(root).as_posix();typ='raw' if path.startswith('小说/') else 'summary' if path.startswith('文章概括/') else 'index'
 source_path=path if typ=='raw' else summaries[path]['source_path'] if typ=='summary' else None
 files.append(dict(path=path,sha256=H(b),byte_size=len(b),char_count=len(b.decode()) if f.suffix!='.sqlite3' else None,doc_type=typ,source_path=source_path,title=f.stem,r2_key=f'canon/{commit}/{H(path.encode())}'))
original_manifest=json.loads((root/'memory/canon-manifest.json').read_text());old_hashes=sum(H((root/e[k]).read_bytes())!=e[h] for e in original_manifest['entries'] for k,h in [('source_path','source_sha256'),('summary_path','summary_sha256')])
counts={typ:sum(r['doc_type']==typ for r in rows) for typ in ['summary','raw']}
manifest=dict(schema_version=2,source_repository='https://github.com/KaedeharaKazuha1029/elaina-skill',source_commit=commit,files=files,documents=docmeta,document_counts=counts,raw_file_count=len(novel_files),summary_file_count=len(summary_files),total_original_characters=sum(len((root/path).read_text()) for path in raw),upstream_manifest_stale_hashes=old_hashes,index_sha256=H((root/'memory/index.sqlite3').read_bytes()),aliases=json.loads((root/'memory/query-aliases.json').read_text()),upstream_metadata=dict(con.execute('SELECT * FROM metadata')),source_map=[dict(r) for r in con.execute('SELECT * FROM source_map ORDER BY source_path')])
manifest['dataset_sha256']=H(J([r['row_hash'] for r in rows]).encode())
(out/'manifest.json').write_text(J(manifest)+'\n')
for i in range(0,len(rows),40):(out/f'documents-{i//40:03d}.json').write_text(J({'rows':rows[i:i+40]}))
(out/'audit.json').write_text(json.dumps({k:v for k,v in manifest.items() if k not in ['files','documents','aliases','source_map']},ensure_ascii=False,indent=2)+'\n')
print(J({'rows':len(rows),'counts':counts,'raw_files':len(novel_files),'summary_files':len(summary_files),'files':len(files),'dataset_sha256':manifest['dataset_sha256'],'stale_manifest_hashes':old_hashes}))
