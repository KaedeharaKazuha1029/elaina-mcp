import { env } from 'cloudflare:workers';
import { requireChatGPTUser } from './chatgpt-auth';
import { createEngine } from '../src/engine.mjs';
import personaDocs from '../src/persona-docs.json';
import { HOST_RULES } from '../src/host-rules.mjs';
import { createCorpusStore } from '../src/corpus-store.mjs';
export const dynamic = 'force-dynamic';
export default async function Home() {
 const user=await requireChatGPTUser('/');
 const engine=createEngine({db:env.DB,owner:user.userId,personaDocs,hostRules:HOST_RULES,deploymentRevision:'elaina-sites-2.0.0',corpusStore:createCorpusStore({db:env.DB,bucket:env.BUCKET})});
 const status=await engine.call('elaina_status',{});
 const saved=await engine.call('recall_memory',{limit:1});
 return <main className="shell">
  <div className="eyebrow">ELAINA · PRIVATE MCP</div>
  <h1>伊蕾娜的<br/><em>记忆书房</em></h1>
  <p className="intro">人格、旅途记录与经你允许留下的记忆，在这里相遇。</p>
  <div className="private">仅站点所有者可访问 · ChatGPT 身份验证</div>
  <section className="stats" aria-label="服务状态"><article><strong>12</strong><span>MCP 工具</span></article><article><strong>4</strong><span>完整人格文档</span></article><article><strong>{saved.total_saved}</strong><span>已授权的私人记忆</span></article></section>
  <section className="panel"><h2>连接到 ChatGPT</h2><p>打开「插件 → 个人 → 由你创建」，安装或连接「伊蕾娜 · Elaina Skill」，随后在聊天中选用它。</p><p>首次调用 <code>bootstrap_elaina</code> 加载人格与已保存的记忆。</p><p className="muted">MCP 路径：<code>/mcp</code> · 私有持久数据库已绑定</p></section>
  <section className="panel"><h2>原作索引</h2><p>{status.corpus_ready?'原作索引已就绪。':'尚未导入原作索引。人格与私人记忆服务可用，原作检索需要另行导入获授权的私有语料。'}</p><pre>{JSON.stringify(status,null,2)}</pre></section>
  <footer>新增、修正与删除记忆均需要你的明确授权。不会自动保存全部对话。</footer>
 </main>;
}
