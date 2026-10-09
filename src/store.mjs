import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// All values are scoped by workspace. Ciphertext is bound to that scope with AAD.
export class Store {
  constructor(dir, {keyFile=process.env.CONVERSA_KEY_FILE}={}) {
    mkdirSync(dir, {recursive:true, mode:0o700});
    const keyPath = keyFile || join(dir, 'encryption.key');
    if (keyFile && !existsSync(keyFile)) throw new Error('Encryption key file missing');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), {flag:'wx',mode:0o600});
    this.key = readFileSync(keyPath);
    if(this.key.length!==32) throw new Error('Encryption key must be 32 bytes');
    this.db = new DatabaseSync(join(dir, 'conversa.sqlite'));
    // synchronous=FULL: every committed write (including WhatsApp session keys) survives a power cut.
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (workspace TEXT NOT NULL, bucket TEXT NOT NULL, id TEXT NOT NULL, value BLOB NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(workspace,bucket,id));');
    // Migrate searchable identifiers without changing encrypted payload semantics.
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version<1) {
      this.transaction(()=>{
        const rows=this.db.prepare('SELECT * FROM records').all();
        this.db.exec('DELETE FROM records');
        for(const r of rows) {
          const value=this.decode(JSON.stringify([r.workspace,r.bucket,r.id]),r.value);
          const id=this.index(r.workspace,r.bucket,r.id);
          this.db.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run(r.workspace,r.bucket,id,this.encode(JSON.stringify([r.workspace,r.bucket,id]),value),r.updated);
        }
        this.db.exec('PRAGMA user_version=1');
      });
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE)');
    }
  }
  index(w,b,id) { return createHmac('sha256',this.key).update(JSON.stringify([w,b,id])).digest('hex'); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  encode(scope, value) {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from(scope));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  }
  decode(scope, value) {
    const b=Buffer.from(value), cipher=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));
    cipher.setAAD(Buffer.from(scope)); cipher.setAuthTag(b.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());
  }
  get(w,b,id) { id=this.index(w,b,id);const r=this.db.prepare('SELECT value FROM records WHERE workspace=? AND bucket=? AND id=?').get(w,b,id); return r ? this.decode(JSON.stringify([w,b,id]),r.value) : null; }
  put(w,b,id,value) { id=this.index(w,b,id);this.db.prepare('INSERT INTO records VALUES (?,?,?,?,?) ON CONFLICT(workspace,bucket,id) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(w,b,id,this.encode(JSON.stringify([w,b,id]),value),Date.now()); }
  remove(w,b,id) { this.db.prepare('DELETE FROM records WHERE workspace=? AND bucket=? AND id=?').run(w,b,this.index(w,b,id)); }
  clear(w,b) { this.db.prepare('DELETE FROM records WHERE workspace=? AND bucket=?').run(w,b); }
  list(w,b,limit=500,offset=0) { return this.db.prepare('SELECT id,value FROM records WHERE workspace=? AND bucket=? ORDER BY updated DESC,id LIMIT ? OFFSET ?').all(w,b,limit,offset).map(r=>this.decode(JSON.stringify([w,b,r.id]),r.value)); }
  count(w,b) { return this.db.prepare('SELECT COUNT(*) AS n FROM records WHERE workspace=? AND bucket=?').get(w,b).n; }
  trim(w,b,limit=500) { this.db.prepare('DELETE FROM records WHERE workspace=? AND bucket=? AND id NOT IN (SELECT id FROM records WHERE workspace=? AND bucket=? ORDER BY updated DESC LIMIT ?)').run(w,b,w,b,limit); }
  // Deleting a client account: every record of that workspace (messages, session keys, settings…) in one statement.
  purge(w) { if(!w||w==='owner'||w==='system')throw new Error('Refusing to purge a reserved workspace');this.db.prepare('DELETE FROM records WHERE workspace=?').run(w); }
  close() { this.db.close(); }
}
