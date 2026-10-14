import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createEngine} from '../src/engine.mjs';
import personaDocs from '../src/persona-docs.json' with {type:'json'};
test('full-corpus retrieval matches the original Python retriever in 28 cases',{skip:!process.env.ELAINA_PARITY_FILE},async()=>{
 const data=JSON.parse(readFileSync(process.env.ELAINA_PARITY_FILE,'utf8')),sqlite=new DatabaseSync(':memory:');
 try{
  for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  const insert=sqlite.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?)');for(const r of data.rows)insert.run(r.id,r.doc_type,r.path,r.source_path,r.title,r.start_offset,r.end_offset,r.content,r.sha256);
  sqlite.prepare('INSERT INTO meta VALUES(?,?)').run('query_aliases',JSON.stringify(data.aliases));
  const db={prepare(sql){let args=[];return {bind(...v){args=v;return this},async all(){return {results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)||null}}}};
  const engine=createEngine({db,owner:'qa-only',personaDocs});
  for(const c of data.cases){
   const result=await engine.call('search_canon',{query:c.query,mode:c.type,limit:6,fallback_raw:false});assert.equal(result.complete_scan,true);
   const fields=['score','doc_type','path','source_path','title','start_offset','end_offset','snippet'];
   assert.deepEqual(result.results.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]]))),c.expected,c.query+' '+c.type);
  }
 }finally{sqlite.close()}
});
