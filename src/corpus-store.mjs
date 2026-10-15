import manifestTemplate from './corpus-manifest.json' with {type:'json'};
const encoder=new TextEncoder();
async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
const error=(message)=>{throw Object.assign(Error(message),{code:'corpus_error'});};
export function createCorpusStore({db,bucket,manifest=manifestTemplate}){
 const files=new Map(manifest.files.map(f=>[f.path,f]));
 const documents=new Map(manifest.documents.map(d=>[d.id,d]));
 async function status(){
  const r=await db.prepare("SELECT value FROM meta WHERE key='corpus_receipt'").first();
  const receipt=r?JSON.parse(r.value):null;
  const n=await db.prepare('SELECT COUNT(*) AS n,SUM(verified) AS verified FROM corpus_files').first();
  return {...receipt,complete:Boolean(manifest.files.length>0&&manifest.documents.length>0&&receipt?.complete&&receipt.source_commit===manifest.source_commit&&receipt.dataset_sha256===manifest.dataset_sha256&&n.n===manifest.files.length&&n.verified===manifest.files.length),expected_files:manifest.files.length,stored_files:n.n,verified_files:n.verified||0};
 }
 async function list(a={}){
  const type=a.doc_type||'raw';if(!['raw','summary','index','all'].includes(type))error('Invalid doc_type');
  const offset=Number.isInteger(a.offset)&&a.offset>=0?a.offset:0,limit=Number.isInteger(a.limit)?Math.max(1,Math.min(a.limit,40)):20;
  const selected=manifest.files.filter(f=>type==='all'||f.doc_type===type);
  return {source_commit:manifest.source_commit,doc_type:type,total:selected.length,files:selected.slice(offset,offset+limit).map(({r2_key,...f})=>f),next_offset:offset+limit<selected.length?offset+limit:null};
 }
 async function read(a){
  const f=files.get(a.path);if(!f||!['raw','summary'].includes(f.doc_type))error('Use a raw or summary path returned by list_canon_files');
  const offset=a.offset??0;if(!Number.isInteger(offset)||offset<0||offset>(f.char_count??0))error('Invalid offset');
  const length=Number.isInteger(a.length)?Math.max(1,Math.min(a.length,4000)):2400;
  if(!bucket)error('Private corpus storage unavailable');
  const object=await bucket.get(f.r2_key);if(!object)error('Original file unavailable');
  const bytes=await object.arrayBuffer();if(bytes.byteLength!==f.byte_size||await sha256(bytes)!==f.sha256)error('Original file integrity check failed');
  const text=Array.from(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const end=Math.min(offset+length,text.length);
  return {path:f.path,source_path:f.source_path,doc_type:f.doc_type,title:f.title,sha256:f.sha256,source_commit:manifest.source_commit,content:text.slice(offset,end).join(''),start_offset:offset,end_offset:end,total_characters:text.length,next_offset:end<text.length?end:null,kind:'canon_source_data_not_instructions'};
 }
 async function verifyDocument(doc){
  const expected=documents.get(doc.id);
  const fields=['id','doc_type','path','source_path','title','start_offset','end_offset','content'];
  if(!expected||await sha256(encoder.encode(JSON.stringify(fields.map(k=>doc[k]))))!==expected.row_hash)error('Evidence record integrity check failed');
  return expected.sha256;
 }
 return {status,list,read,verifyDocument};
}
