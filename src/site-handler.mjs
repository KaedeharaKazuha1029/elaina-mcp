// Site integration adapter. This module does NOT supply Site authentication.
// Wire only from a backend route whose Site session was validated by the host.
// Do not derive owner from user-supplied JSON, query parameters, or unverified headers.
import { createEngine, PERSONA_CORE } from './engine.mjs';
import { handleJsonRpc } from './protocol.mjs';

/**
 * @param {Request} request
 * @param {{ db:object, owner:string, authenticated:boolean, personaDocs:object,
 *           hostRules:string, deploymentRevision?:string }} config
 */
export async function handleSiteMcp(request, config) {
  if (!config?.authenticated || !config.owner || !config.db) {
    return new Response(JSON.stringify({ error: 'Unauthorized / Site access not configured' }), {
      status: 401, headers: { 'content-type': 'application/json', 'cache-control':'no-store' }
    });
  }
  if (!config.personaDocs || PERSONA_CORE.some(name => !config.personaDocs[name])) {
    return new Response(JSON.stringify({error:'Missing verified persona documents'}), {status:503});
  }
  const url = new URL(request.url);
  if (url.pathname !== '/mcp') return new Response('Not found', {status:404});
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  const length = Number(request.headers.get('content-length') || '0');
  if (length > 16000) return new Response('Request too large', {status:413});
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return new Response('Request too large', {status:413});
    payload = JSON.parse(raw);
  } catch { return new Response('Invalid JSON', {status:400}); }
  const engine = createEngine({db: config.db, owner:config.owner, personaDocs: config.personaDocs,corpusStore:config.corpusStore,
     hostRules: config.hostRules || '', deploymentRevision:config.deploymentRevision || 'sites-adapter'});
  const result = await handleJsonRpc(payload, engine);
  if (result === undefined) return new Response(null, {status:202, headers:{'cache-control':'no-store'}});
  return new Response(JSON.stringify(result), {status:200, headers:{
    'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
  }});
}
