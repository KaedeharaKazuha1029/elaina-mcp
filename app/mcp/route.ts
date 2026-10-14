import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../chatgpt-auth';
import { handleSiteMcp } from '../../src/site-handler.mjs';
import personaDocs from '../../src/persona-docs.json';
import { HOST_RULES } from '../../src/host-rules.mjs';
import { createCorpusStore } from '../../src/corpus-store.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
 // Dispatch authenticates OAuth/SIWC and overwrites identity headers before
 // forwarding to this private Worker. JSON and query values never select owner.
 const user = await getChatGPTUser();
 return handleSiteMcp(request,{db:env.DB,owner:user?.userId,authenticated:Boolean(user),personaDocs,hostRules:HOST_RULES,deploymentRevision:'elaina-sites-2.0.0',corpusStore:env.DB?createCorpusStore({db:env.DB,bucket:env.BUCKET}):null});
}
export function GET() { return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}}); }
export function DELETE() { return GET(); }
