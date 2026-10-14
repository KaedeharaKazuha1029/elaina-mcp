import assert from 'node:assert/strict';
import test from 'node:test';
import {createEngine,scoreCanon} from '../src/engine.mjs';
import {docs,testDB} from './helpers.mjs';
const make=()=> {const db=testDB();return {db,engine:createEngine({db,owner:'private-owner',personaDocs:docs,hostRules:'Persist identity before calling MCP'})}};
test('upstream Python scoring rough parity on snippets',()=>{
 assert.equal(scoreCanon('伊蕾娜','魔女之旅','伊蕾娜和旅人对话'),104);
 assert.equal(scoreCanon('unfound','title','content'),0);
 assert.equal(scoreCanon('旅人','旅行者','旅人',{'旅行者':['旅人']}),168);
});
test('bootstrap includes all four full persona files and Site continuity warning',async()=>{
 const {engine,db}=make();let d=await engine.call('bootstrap_elaina',{});assert.equal(d.persona_documents.length,4);
 assert.match(d.first_reply_before_tools,/persistent/);assert.equal(d.memories.memories.length,0);db.close();
});
test('canon summary-first, raw fallback, exact evidence ID',async()=>{
 const {engine,db}=make();
 db.seed("INSERT INTO documents VALUES (1,'summary','文章概括/a.md','小说/a.txt','起点',0,12,'伊蕾娜来到城镇'),(2,'raw','小说/a.txt','小说/a.txt','起点',10,20,'伊蕾娜进入了城镇。'),(3,'raw','小说/b.txt','小说/b.txt','别篇',0,15,'另一个故事');");
 const d=await engine.call('search_canon',{query:'伊蕾娜'});assert.equal(d.results[0].document_id,1);
 const e=await engine.call('read_evidence',{document_id:1,max_chars:10});assert.equal(e.document_id,1);
 const raw=await engine.call('search_original',{query:'伊蕾娜'});assert.equal(raw.results[0].doc_type,'raw');
 const miss=await engine.call('search_canon',{query:'一段没检索到的原文'});assert.equal(miss.absence_proven,false);
 db.close();
});
test('approved save/recall, update CAS, delete and owner isolation',async()=>{
 const {engine,db}=make();
 const saved=await engine.call('remember_memory',{key:'language',content:'偏好中文',category:'preference',source_quote:'请记住我偏好中文',consent:'user_requested',tags:['lang'],pinned:true});
 assert.equal(saved.created,true);
 const repeat=await engine.call('remember_memory',{key:'language',content:'偏好中文',category:'preference',source_quote:'请记住我偏好中文',consent:'user_requested',tags:['lang'],pinned:true});assert.equal(repeat.idempotent,true);
 let mem=await engine.call('recall_memory',{query:'中文'});assert.equal(mem.memories.length,1);
 const u=await engine.call('update_memory',{memory_id:saved.memory.id,expected_version:1,content:'偏好简体中文',category:'preference',source_quote:'改成简体中文',consent:'user_requested',tags:[],pinned:true});assert.equal(u.memory.version,2);
 await assert.rejects(()=>engine.call('update_memory',{memory_id:saved.memory.id,expected_version:1,content:'x',category:'preference',source_quote:'要更改',consent:'user_requested'}));
 const other=createEngine({db,owner:'different-user',personaDocs:docs});assert.equal((await other.call('recall_memory',{})).total_saved,0);
 await engine.call('forget_memory',{memory_id:saved.memory.id,expected_version:2,source_quote:'删除这条记忆',consent:'user_requested'});
 assert.equal((await engine.call('recall_memory',{})).total_saved,0);db.close();
});
test('cannot write memory without explicitly asserted consent',async()=>{
 const {engine,db}=make();await assert.rejects(()=>engine.call('remember_memory',{key:'x',content:'private',category:'fact',source_quote:'quoted',consent:'automatic'}));db.close();
});
