import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import manifestTemplate from '../src/corpus-manifest.example.json' with {type:'json'};
import {createCorpusImporter} from '../src/corpus-import.mjs';
const manifest=process.env.ELAINA_PRIVATE_EXPORT?JSON.parse(readFileSync(join(process.env.ELAINA_PRIVATE_EXPORT,'manifest.json'),'utf8')):manifestTemplate;
const handleCorpusImport=createCorpusImporter(manifest);
import {createCorpusStore} from '../src/corpus-store.mjs';
import {createEngine} from '../src/engine.mjs';
import personaDocs from '../src/persona-docs.json' with {type:'json'};
function setup(){
 const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
 const objects=new Map();const bucket={async put(key,b){objects.set(key,new Uint8Array(b))},async get(key){const b=objects.get(key);return b?{size:b.byteLength,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null}};
 return {db,bucket,sqlite,env:{DB:db,BUCKET:bucket,CORPUS_IMPORT_TOKEN:'synthetic-test-token'}};
}
function request(body,token='synthetic-test-token'){return new Request('https://test/api/corpus/import',{method:'POST',headers:{'x-corpus-import-token':token,'content-type':'application/json'},body:JSON.stringify(body)})}
test('corpus importer rejects unauthorized and forged data and incomplete finalization',async()=>{
 const {env,sqlite}=setup();try{
  assert.equal((await handleCorpusImport(request({action:'finalize'},'wrong'),env)).status,401);
  assert.equal((await handleCorpusImport(request({action:'documents',rows:[{id:1,content:'forged'}]}),env)).status,400);
  assert.equal((await handleCorpusImport(request({action:'finalize'}),env)).status,400);
  assert.equal((await createCorpusStore({db:env.DB,bucket:env.BUCKET,manifest}).status()).complete,false);
 }finally{sqlite.close()}
});
test('real corpus imports and verifies every file/index record, supports complete paginated originals', {skip:!process.env.ELAINA_UPSTREAM_ROOT},async()=>{
 const {env,db,bucket,sqlite}=setup();const root=process.env.ELAINA_UPSTREAM_ROOT,exported=process.env.ELAINA_PRIVATE_EXPORT;
 const must=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json()};
 try{
  for(const name of readdirSync(exported).filter(n=>n.startsWith('documents-')).sort()){
   const payload=JSON.parse(readFileSync(join(exported,name),'utf8'));await must(await handleCorpusImport(request({action:'documents',...payload}),env));
  }
  for(const f of manifest.files){const bytes=readFileSync(join(root,f.path));await must(await handleCorpusImport(new Request('https://test/api/corpus/import?path='+encodeURIComponent(f.path),{method:'PUT',headers:{'x-corpus-import-token':'synthetic-test-token'},body:bytes}),env));}
  for(let offset=0;offset<manifest.files.length;offset+=20)await must(await handleCorpusImport(request({action:'verify_files',offset,limit:20}),env));
  const receipt=await must(await handleCorpusImport(request({action:'finalize'}),env));assert.equal(receipt.verified_files,601);
  assert.equal((await handleCorpusImport(request({action:'finalize'}),env)).status,410);
  const store=createCorpusStore({db,bucket,manifest});assert.equal((await store.status()).complete,true);
  const engine=createEngine({db,owner:'synthetic-user',personaDocs,corpusStore:store});assert.equal((await engine.call('elaina_status',{})).corpus_ready,true);assert.equal(engine.toolList().length,12);
  for(const f of manifest.files.filter(f=>f.doc_type==='raw'||f.doc_type==='summary')){
   let text='',offset=0;for(;;){const part=await store.read({path:f.path,offset,length:4000});text+=part.content;if(part.next_offset===null)break;offset=part.next_offset;}
   assert.equal(text,readFileSync(join(root,f.path),'utf8'));
  }
  const evidence=await engine.call('read_evidence',{document_id:297,offset:4000,max_chars:4000});assert.equal(evidence.evidence_start_offset,4000);assert.equal(evidence.next_offset,null);assert.equal(evidence.content.length,1991);
  assert.equal((await engine.call('recall_memory',{})).total_saved,0);
 }finally{sqlite.close()}
});
