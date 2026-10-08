import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync,mkdtempSync,rmSync,copyFileSync,mkdirSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {lockDirectory} from '../src/lock.mjs';
const [command,fileArg]=process.argv.slice(2),dir=resolve(process.env.CONVERSA_DATA_DIR||'.data');
if(!['backup','restore'].includes(command)||!fileArg)throw new Error('Usage: node scripts/backup.mjs backup|restore <encrypted-file>');
const file=resolve(fileArg),key=readFileSync(process.env.CONVERSA_KEY_FILE||join(dir,'encryption.key'));
const temp=mkdtempSync(join(tmpdir(),'conversa-backup-'));let unlock;
try{
 if(command==='backup'){
  const db=new DatabaseSync(join(dir,'conversa.sqlite'),{readOnly:true});try{await backup(db,join(temp,'snapshot.sqlite'));}finally{db.close();}
  const iv=randomBytes(12),enc=createCipheriv('aes-256-gcm',key,iv);enc.setAAD(Buffer.from('CONVERSA-BACKUP-1'));
  const payload=Buffer.concat([enc.update(readFileSync(join(temp,'snapshot.sqlite'))),enc.final()]);
  writeFileSync(file,Buffer.concat([Buffer.from('CVB1'),iv,enc.getAuthTag(),payload]),{flag:'wx',mode:0o600});
  console.log('Encrypted backup created. Store the encryption key separately.');
 }else{
  mkdirSync(dir,{recursive:true});unlock=lockDirectory(dir);
  if(existsSync(join(dir,'conversa.sqlite')))throw new Error('Restore requires an empty destination; existing data is never overwritten.');
  const value=readFileSync(file);if(value.subarray(0,4).toString()!=='CVB1')throw new Error('Invalid backup');
  const dec=createDecipheriv('aes-256-gcm',key,value.subarray(4,16));dec.setAAD(Buffer.from('CONVERSA-BACKUP-1'));dec.setAuthTag(value.subarray(16,32));
  writeFileSync(join(temp,'restore.sqlite'),Buffer.concat([dec.update(value.subarray(32)),dec.final()]),{mode:0o600});
  const db=new DatabaseSync(join(temp,'restore.sqlite'),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integrity check failed');}finally{db.close();}
  copyFileSync(join(temp,'restore.sqlite'),join(dir,'conversa.sqlite'));console.log('Restore verified. Start exactly one instance.');
 }
}finally{unlock?.();rmSync(temp,{recursive:true,force:true});}
