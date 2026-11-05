// Almacén persistente y cifrado de archivos multimedia (fotos, videos, audios, documentos).
// Conversa, por diseño, no guardaba los archivos: los pedía a WhatsApp al abrirlos, y cuando
// WhatsApp los borraba de sus servidores (pasadas unas semanas) ya no se podían ver. Este almacén
// los guarda en el disco del servidor cifrados con la misma clave del Store, con un límite de espacio:
// al superarlo, borra los más antiguos. El índice (qué hay guardado y cuánto pesa) vive cifrado en el
// Store; los bytes de cada archivo, cifrados en el disco.
import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,rmSync,renameSync} from 'node:fs';
import {join} from 'node:path';

const GB=1024*1024*1024;

export class MediaVault {
 // store: el Store (para la clave y el índice cifrado). dir: carpeta de archivos. maxBytes: tope de disco.
 constructor(store,dir,{maxBytes=8*GB}={}) {
  this.store=store;this.key=store.key;this.dir=dir;this.max=Math.max(0,maxBytes);
  mkdirSync(dir,{recursive:true,mode:0o700});
  this.index=new Map();this.total=0;
  // Reconstruye el índice en memoria desde el Store (sobrevive reinicios; sin esto los archivos quedarían huérfanos).
  try{for(const e of store.list('system','mediavault',-1))if(e&&e.k){this.index.set(e.k,e);this.total+=e.size||0;}}catch{}
 }
 enabled(){return this.max>0;}
 _k(w,id){return w+'\0'+id;}
 _name(w,id){return createHmac('sha256',this.key).update(this._k(w,id)).digest('hex');}
 _path(name){return join(this.dir,name.slice(0,2),name+'.bin');}
 has(w,id){return this.index.has(this._k(w,id));}
 usage(){return {bytes:this.total,max:this.max,files:this.index.size};}
 // Guarda los bytes de un archivo (cifrados). Devuelve true si quedó guardado.
 save(w,id,data){
  if(!this.enabled()||!Buffer.isBuffer(data)||!data.length||data.length>this.max)return false;
  const k=this._k(w,id);if(this.index.has(k))return true;
  try{
   const name=this._name(w,id),p=this._path(name);
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(k));
   const enc=Buffer.concat([cipher.update(data),cipher.final()]),tag=cipher.getAuthTag();
   mkdirSync(join(this.dir,name.slice(0,2)),{recursive:true,mode:0o700});
   writeFileSync(p,Buffer.concat([iv,tag,enc]),{mode:0o600});
   const e={k,w,id,name,size:data.length,at:Date.now()};
   this.index.set(k,e);this.total+=e.size;this.store.put('system','mediavault',k,e);
   this._evict();
   return true;
  }catch{return false;}
 }
 // Lee y descifra un archivo guardado, o null si no está (o quedó corrupto).
 load(w,id){
  const k=this._k(w,id),e=this.index.get(k);if(!e)return null;
  try{
   const raw=readFileSync(this._path(e.name));if(raw.length<28)throw new Error('short');
   const iv=raw.subarray(0,12),tag=raw.subarray(12,28),body=raw.subarray(28);
   const d=createDecipheriv('aes-256-gcm',this.key,iv);d.setAAD(Buffer.from(k));d.setAuthTag(tag);
   return Buffer.concat([d.update(body),d.final()]);
  }catch{this._drop(k);return null;}
 }
 _drop(k){const e=this.index.get(k);if(!e)return;this.index.delete(k);this.total-=e.size;try{rmSync(this._path(e.name),{force:true});}catch{}try{this.store.remove('system','mediavault',k);}catch{}}
 // Borra los más antiguos hasta volver bajo el tope.
 _evict(){if(this.total<=this.max)return;const list=[...this.index.values()].sort((a,b)=>a.at-b.at);for(const e of list){if(this.total<=this.max)break;this._drop(e.k);}}
 remove(w,id){this._drop(this._k(w,id));}
 // Al eliminar una cuenta de cliente: borra todos sus archivos guardados.
 purge(w){for(const [k,e] of [...this.index])if(e.w===w)this._drop(k);}
}
