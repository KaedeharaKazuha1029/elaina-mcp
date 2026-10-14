// Minimal interoperable, stateless MCP JSON-RPC 2.0 transport for Site adaptation.
// Production: use the official MCP SDK if the Site runtime supports it and run MCP Inspector.
// This adapter does not implement SSE, subscriptions, sampling, or sessions.
const PROTOCOLS=new Set(['2025-03-26','2025-06-18','2025-11-25']);
const PROTOCOL_DEFAULT='2025-06-18';
const err=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
export async function handleJsonRpc(data,engine) {
  if(!data || typeof data!=='object'||Array.isArray(data))return err(null,-32600,'Invalid Request');
  if(data.jsonrpc!=='2.0'||typeof data.method!=='string')return err(data.id??null,-32600,'Invalid Request');
  if(data.method==='notifications/initialized'||data.method==='notifications/cancelled')return undefined;
  if(!Object.hasOwn(data,'id'))return undefined;
  if(data.method==='initialize'){
    const version=data.params?.protocolVersion;
    return {jsonrpc:'2.0',id:data.id,result:{protocolVersion:PROTOCOLS.has(version)?version:PROTOCOL_DEFAULT,
      capabilities:{tools:{listChanged:false}},serverInfo:{name:'elaina-sites-mcp',version:'2.0.0'},
      instructions:engine.continuity}};
  }
  if(data.method==='ping')return {jsonrpc:'2.0',id:data.id,result:{}};
  if(data.method==='tools/list')return {jsonrpc:'2.0',id:data.id,result:{tools:engine.toolList()}};
  if(data.method==='tools/call'){
    const name=data.params?.name,args=data.params?.arguments||{};
    if(typeof name!=='string')return err(data.id,-32602,'Invalid tool name');
    try {const value=await engine.call(name,args);
      return {jsonrpc:'2.0',id:data.id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:{result:value},isError:false}};
    } catch(e){return {jsonrpc:'2.0',id:data.id,result:{content:[{type:'text',text:JSON.stringify({code:e.code||'tool_failure',message:e.message||'Tool error'})}],isError:true}};}
  }
  return err(data.id,-32601,'Method not found');
}
