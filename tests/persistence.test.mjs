import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEngine} from '../src/engine.mjs';
const personaDocs=JSON.parse(readFileSync(new URL('../src/persona-docs.json',import.meta.url),'utf8'));
function open(path){const native=new DatabaseSync(path);return {native,prepare(sql){let args=[];return {bind(...v){args=v;return this},async all(){return {results:native.prepare(sql).all(...args)}},async first(){return native.prepare(sql).get(...args)||null},async run(){return {meta:{changes:native.prepare(sql).run(...args).changes}}}}}}}
test('generated migration persists across reopen, preserves persona, and isolates identities',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'elaina-qa-'));let db;
 try {
  db=open(join(dir,'private.sqlite'));db.native.exec(readFileSync(new URL('../drizzle/0000_abnormal_mister_fear.sql',import.meta.url),'utf8'));
  let engine=createEngine({db,owner:'test-owner',personaDocs});
  const status=await engine.call('elaina_status',{});assert.equal(status.corpus_ready,false);
  const bootstrap=await engine.call('bootstrap_elaina',{});assert.equal(bootstrap.persona_documents.length,4);
  for(const [name,content] of Object.entries(personaDocs))assert.equal(content,readFileSync(new URL('../persona/'+name,import.meta.url),'utf8'));
  const saved=await engine.call('remember_memory',{key:'synthetic_test',content:'Synthetic integration test only',category:'project',source_quote:'Store this synthetic test record',consent:'user_requested'});
  db.native.close();db=open(join(dir,'private.sqlite'));
  engine=createEngine({db,owner:'test-owner',personaDocs});assert.equal((await engine.call('recall_memory',{})).memories[0].id,saved.memory.id);
  const stranger=createEngine({db,owner:'other-owner',personaDocs});assert.equal((await stranger.call('recall_memory',{})).total_saved,0);
  await assert.rejects(()=>stranger.call('forget_memory',{memory_id:saved.memory.id,expected_version:1,source_quote:'Delete test',consent:'user_requested'}));
  await engine.call('forget_memory',{memory_id:saved.memory.id,expected_version:1,source_quote:'Delete test',consent:'user_requested'});assert.equal((await engine.call('recall_memory',{})).total_saved,0);
 }finally{db?.native.close();rmSync(dir,{recursive:true,force:true})}
});
