// Temporary provisioning route. Not an MCP tool. Requires both the private
// Sites service boundary and a short-lived server-side import secret.
import manifestTemplate from './corpus-manifest.example.json' with {type:'json'};
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function createCorpusImporter(manifest=manifestTemplate){
const fileMap=new Map(manifest.files.map(f=>[f.path,f]));
const documentMap=new Map(manifest.documents.map(d=>[d.id,d]));
const fields=['id','doc_type','path','source_path','title','start_offset','end_offset','content'];
const utf8=new TextEncoder();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function authorize(request,env){
 const actual=request.headers.get('x-corpus-import-token');if(!actual||!env.CORPUS_IMPORT_TOKEN)return false;
 const [a,b]=await Promise.all([sha256(utf8.encode(actual)),sha256(utf8.encode(env.CORPUS_IMPORT_TOKEN))]);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
async function saveFile(env,file,bytes){
 if(bytes.byteLength!==file.byte_size||await sha256(bytes)!==file.sha256)throw Error('File checksum mismatch');
 await env.BUCKET.put(file.r2_key,bytes,{customMetadata:{sha256:file.sha256,sourceCommit:manifest.source_commit}});
 await env.DB.prepare('INSERT INTO corpus_files(path,sha256,byte_size,char_count,doc_type,source_path,title,r2_key,verified) VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(path) DO UPDATE SET sha256=excluded.sha256,byte_size=excluded.byte_size,char_count=excluded.char_count,doc_type=excluded.doc_type,source_path=excluded.source_path,title=excluded.title,r2_key=excluded.r2_key,verified=0').bind(file.path,file.sha256,file.byte_size,file.char_count,file.doc_type,file.source_path,file.title,file.r2_key).run();
}
async function importDocuments(env,rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>40)throw Error('Invalid batch');
 for(const r of rows){const d=documentMap.get(r.id);if(!d||typeof r.content!=='string'||await sha256(utf8.encode(JSON.stringify(fields.map(k=>r[k]))))!==d.row_hash||await sha256(utf8.encode(r.content))!==d.sha256)throw Error('Document checksum mismatch');}
 await env.DB.batch(rows.map(r=>env.DB.prepare('INSERT INTO documents(id,doc_type,path,source_path,title,start_offset,end_offset,content,sha256) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET doc_type=excluded.doc_type,path=excluded.path,source_path=excluded.source_path,title=excluded.title,start_offset=excluded.start_offset,end_offset=excluded.end_offset,content=excluded.content,sha256=excluded.sha256').bind(...fields.map(k=>r[k]),documentMap.get(r.id).sha256)));
 return {imported:rows.length};
}
async function verifyFiles(env,offset,limit){
 if(!Number.isInteger(offset)||offset<0||offset>=manifest.files.length||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid verification range');
 const files=manifest.files.slice(offset,offset+limit);
 for(const f of files){
  const o=await env.BUCKET.get(f.r2_key);if(!o||o.size!==f.byte_size||await sha256(await o.arrayBuffer())!==f.sha256)throw Error('Stored file verification failed');
  const r=await env.DB.prepare('UPDATE corpus_files SET verified=1 WHERE path=? AND sha256=? AND byte_size=?').bind(f.path,f.sha256,f.byte_size).run();if(r.meta.changes!==1)throw Error('Missing stored file metadata');
 }
 return {verified:files.length,next_offset:offset+files.length<manifest.files.length?offset+files.length:null};
}
async function finalize(env){
 if(!manifest.files.length||!manifest.documents.length||!manifest.source_commit||!manifest.dataset_sha256)throw Error('Private corpus manifest not configured');
 const files=await env.DB.prepare('SELECT COUNT(*) AS n,SUM(verified) AS verified FROM corpus_files').first();
 if(files.n!==manifest.files.length||files.verified!==manifest.files.length)throw Error('Incomplete or unverified files');
 const rows=(await env.DB.prepare('SELECT id,doc_type,path,source_path,title,start_offset,end_offset,content,sha256 FROM documents ORDER BY id').all()).results;
 if(rows.length!==manifest.documents.length)throw Error('Incomplete index');
 const hashes=[];
 for(const r of rows){const d=documentMap.get(r.id);const hash=await sha256(utf8.encode(JSON.stringify(fields.map(k=>r[k]))));if(!d||hash!==d.row_hash||r.sha256!==d.sha256)throw Error('Stored index checksum mismatch');hashes.push(hash);}
 if(await sha256(utf8.encode(JSON.stringify(hashes)))!==manifest.dataset_sha256)throw Error('Dataset checksum mismatch');
 const receipt={complete:true,source_repository:manifest.source_repository,source_commit:manifest.source_commit,document_counts:manifest.document_counts,raw_file_count:manifest.raw_file_count,summary_file_count:manifest.summary_file_count,total_original_characters:manifest.total_original_characters,verified_files:manifest.files.length,index_sha256:manifest.index_sha256,dataset_sha256:manifest.dataset_sha256,verified_at:new Date().toISOString(),upstream_manifest_stale_hashes:manifest.upstream_manifest_stale_hashes};
 const values={query_aliases:JSON.stringify(manifest.aliases),corpus_receipt:JSON.stringify(receipt),upstream_metadata:JSON.stringify(manifest.upstream_metadata),source_map:JSON.stringify(manifest.source_map),corpus_import_sealed:manifest.source_commit};
 await env.DB.batch(Object.entries(values).map(([k,v])=>env.DB.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,v)));
 return receipt;
}
async function handleCorpusImport(request,env){
 if(!await authorize(request,env))return json({error:'Unauthorized'},401);
 if(!env.DB||!env.BUCKET)return json({error:'Storage not configured'},503);
 const sealed=await env.DB.prepare("SELECT value FROM meta WHERE key='corpus_import_sealed'").first();if(sealed?.value===manifest.source_commit)return json({error:'Import sealed'},410);
 const url=new URL(request.url);
 try {
  if(request.method==='PUT'){
   const file=fileMap.get(url.searchParams.get('path'));if(!file)return json({error:'Unknown source file'},400);
   const length=Number(request.headers.get('content-length'));if(length>file.byte_size)return json({error:'Too large'},413);
   await saveFile(env,file,await request.arrayBuffer());return json({stored:true,sha256:file.sha256});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const raw=await request.text();if(raw.length>3_000_000)return json({error:'Too large'},413);const body=JSON.parse(raw);
  if(body.action==='documents')return json(await importDocuments(env,body.rows));
  if(body.action==='files'){
   if(!Array.isArray(body.files)||body.files.length<1||body.files.length>20)throw Error('Invalid file batch');
   // Bounded parallel uploads avoid one request per small original file.
   for(let i=0;i<body.files.length;i+=4)await Promise.all(body.files.slice(i,i+4).map(async item=>{
    const file=fileMap.get(item.path);if(!file||file.byte_size>1_000_000||typeof item.base64!=='string'||item.base64.length>1_400_000)throw Error('Invalid file');
    const binary=atob(item.base64);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));await saveFile(env,file,bytes);
   }));return json({stored:body.files.length});
  }
  if(body.action==='verify_files')return json(await verifyFiles(env,body.offset,body.limit));
  if(body.action==='finalize')return json(await finalize(env));
  return json({error:'Unknown action'},400);
 }catch(e){return json({error:e.message||'Import failed'},400);}
}

 return handleCorpusImport;
}
export const handleCorpusImport=createCorpusImporter();
