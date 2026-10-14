import assert from 'node:assert/strict';
import test from 'node:test';
import {handleSiteMcp} from '../src/site-handler.mjs';
import {docs,testDB} from './helpers.mjs';
const request=(body)=>new Request('https://site.example/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('MCP rejects unauthenticated requests',async()=>{
 const db=testDB();const resp=await handleSiteMcp(request({jsonrpc:'2.0',id:1,method:'initialize'}),{db,owner:'private',authenticated:false,personaDocs:docs});assert.equal(resp.status,401);db.close();
});
test('MCP initialize, list, call and protected tool schema',async()=>{
 const db=testDB(),config={db,owner:'private',authenticated:true,personaDocs:docs,hostRules:'Identity first'};
 let res=await handleSiteMcp(request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}}),config);
 assert.equal(res.status,200);let body=await res.json();assert.equal(body.result.serverInfo.name,'elaina-sites-mcp');
 res=await handleSiteMcp(request({jsonrpc:'2.0',id:2,method:'tools/list'}),config);body=await res.json();assert.equal(body.result.tools.length,10);
 assert.equal(body.result.tools.find(x=>x.name==='remember_memory').annotations.readOnlyHint,false);
 res=await handleSiteMcp(request({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'elaina_status',arguments:{}}}),config);
 body=await res.json();assert.equal(body.result.isError,false);assert.equal(body.result.structuredContent.result.corpus_ready,false);
 db.close();
});
