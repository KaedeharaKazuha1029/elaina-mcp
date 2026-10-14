import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function testDB() {
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync(new URL('../sql/schema.sql', import.meta.url),'utf8'));
 return {
  prepare(sql){let args=[];return {
    bind(...next){args=next;return this},
    async all(){return {results:db.prepare(sql).all(...args)}},
    async first(){return db.prepare(sql).get(...args)||null},
    async run(){const x=db.prepare(sql).run(...args);return {meta:{changes:x.changes}}}
   }},
  seed(sql){db.exec(sql)},close(){db.close()}
 };
}
export const docs=Object.fromEntries(['SOUL.md','IDENTITY.md','PERSONA_ELAINA.md','RUNTIME_GUARD.md'].map(x=>[x,'verified example text '+x]));
