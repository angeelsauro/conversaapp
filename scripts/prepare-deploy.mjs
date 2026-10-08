import {mkdirSync,existsSync,writeFileSync,chownSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
const domain=process.argv[2];
if(!domain||!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain))throw new Error('Specify a real DNS hostname, without https://');
const dir=resolve('deploy');
for(const name of ['data','secrets'])mkdirSync(join(dir,name),{recursive:true,mode:0o700});
if(existsSync(join(dir,'data','conversa.sqlite'))&&!existsSync(join(dir,'secrets','encryption.key')))throw new Error('Existing database: supply its original key; never generate a replacement.');
for(const[name,value]of [['encryption.key',randomBytes(32)],['owner-token',randomBytes(32).toString('hex')]]){
 const path=join(dir,'secrets',name);if(!existsSync(path))writeFileSync(path,value,{flag:'wx',mode:0o600});
 if(process.platform==='linux'&&process.getuid()===0){chownSync(path,1000,1000);chmodSync(path,0o400);}
}
if(process.platform==='linux'&&process.getuid()===0){chownSync(join(dir,'data'),1000,1000);chownSync(join(dir,'secrets'),1000,1000);}
if(!existsSync(join(dir,'.env')))writeFileSync(join(dir,'.env'),`CONVERSA_DOMAIN=${domain}\n`,{flag:'wx',mode:0o600});
console.log('Deployment directories prepared. No credentials were printed.');
