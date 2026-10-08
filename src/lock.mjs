import {openSync,writeFileSync,readFileSync,unlinkSync,closeSync} from 'node:fs';
import {join} from 'node:path';
export function lockDirectory(dir) {
 const path=join(dir,'server.lock');
 const startTime=pid=>{try{return readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[19];}catch{return null;}};
 const identity=JSON.stringify({pid:process.pid,start:startTime(process.pid)});
 for(let i=0;i<2;i++) {
  try {const fd=openSync(path,'wx',0o600);writeFileSync(fd,identity);closeSync(fd);return ()=>{if(readFileSync(path,'utf8')===identity)unlinkSync(path);};}
  catch(e){if(e.code!=='EEXIST')throw e;const existing=JSON.parse(readFileSync(path,'utf8'));const pid=typeof existing==='number'?existing:existing.pid;if(!Number.isSafeInteger(pid)||pid<=0)throw new Error('Invalid lock; inspect server.lock');try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH'){unlinkSync(path);continue;}throw err;}if(existing.start&&startTime(pid)&&existing.start!==startTime(pid)){unlinkSync(path);continue;}throw new Error('Another Conversa process owns this data directory');}
 }
 throw new Error('Could not acquire server lock');
}
