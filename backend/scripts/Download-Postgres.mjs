// Official EDB PostgreSQL 17.11 Windows server binaries; no system install/service.
import {readFile,writeFile,mkdir,stat,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {inflateRawSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=path.join(root,'.postgres-local');
const url='https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip';
const archiveBytes=381531864;
await mkdir(runtime,{recursive:true});
async function download(start,end,name){
 const output=path.join(runtime,name);
 let cached=Buffer.alloc(0);
 try { cached=await readFile(output); } catch {}
 // Reuse a prefix from a previous complete-archive download if available.
 const fullPath=path.join(runtime,'postgresql.zip');
 try {
  const available=Math.min((await stat(fullPath)).size- start,end-start+1);
  if(available>cached.length){
   const handle=await open(fullPath,'r');
   try { const prefix=Buffer.alloc(available); const {bytesRead}=await handle.read(prefix,0,available,start); cached=prefix.subarray(0,bytesRead); }
   finally { await handle.close(); }
  }
 } catch {}
 if(cached.length===end-start+1){await writeFile(output,cached);return cached;}
 if(cached.length>end-start+1)throw Error('Unexpected cached byte-range size');
 const partial=output+'.part';
 await new Promise((resolve,reject)=>{
  const child=spawn('curl.exe',['--location','--fail','--silent','--show-error','--retry','2','--range',(start+cached.length)+'-'+end,'--output',partial,url],{windowsHide:true,stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Official download failed: '+code)));
 });
 const data=Buffer.concat([cached,await readFile(partial)]);
 if(data.length!==end-start+1)throw Error('Server did not honor ZIP byte range');
 await writeFile(output,data);return data;
}
const tail=await download(archiveBytes-65536,archiveBytes-1,'zip-tail.bin');
let eocd=tail.length-22;
while(eocd>=0&&tail.readUInt32LE(eocd)!==0x06054b50)eocd--;
if(eocd<0)throw Error('ZIP end record missing');
const indexOffset=tail.readUInt32LE(eocd+16),indexSize=tail.readUInt32LE(eocd+12);
const index=await download(indexOffset,indexOffset+indexSize-1,'zip-index.bin');
let entries=[],p=0;
while(p<index.length){
 if(index.readUInt32LE(p)!==0x02014b50)throw Error('Invalid ZIP index');
 const nl=index.readUInt16LE(p+28),el=index.readUInt16LE(p+30),cl=index.readUInt16LE(p+32);
 const name=index.subarray(p+46,p+46+nl).toString();
 if(/^pgsql\/(bin\/|lib\/.*\.dll$|share\/)/.test(name)&&!name.endsWith('/')){
  const entry={name,size:index.readUInt32LE(p+20),raw:index.readUInt32LE(p+24),offset:index.readUInt32LE(p+42),method:index.readUInt16LE(p+10),crc:index.readUInt32LE(p+16)};
  // Header size includes the local name and a conservative extra-field allowance.
  entries.push(entry);
 }
 p+=46+nl+el+cl;
}
entries.sort((a,b)=>a.offset-b.offset);
const ranges=[];
for(const entry of entries){
 const end=entry.offset+30+Buffer.byteLength(entry.name)+65535+entry.size;
 const last=ranges.at(-1);
 if(last&&entry.offset-last.end<65536&&end-last.start<8*1024*1024){last.end=Math.max(last.end,end);last.entries.push(entry);}
 else ranges.push({start:entry.offset,end,entries:[entry]});
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
let cursor=0,completed=0;
async function worker(){
 while(cursor<ranges.length){
  const i=cursor++,range=ranges[i];
  const data=await download(range.start,Math.min(range.end,archiveBytes-1),'range-'+i+'.bin');
  for(const entry of range.entries){
   const q=entry.offset-range.start;
   if(data.readUInt32LE(q)!==0x04034b50)throw Error('Invalid local ZIP header');
   const start=q+30+data.readUInt16LE(q+26)+data.readUInt16LE(q+28);
   const compressed=data.subarray(start,start+entry.size);
   const raw=entry.method===8?inflateRawSync(compressed):compressed;
   if(raw.length!==entry.raw||crc32(raw)!==entry.crc)throw Error('ZIP integrity failed: '+entry.name);
   const target=path.resolve(runtime,entry.name);
   if(!target.startsWith(runtime+path.sep))throw Error('Unsafe archive path');
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,raw);
  }
  console.log('PostgreSQL server archive: '+(++completed)+'/'+ranges.length+' sections verified');
 }
}
console.log('Fetching '+entries.length+' required server files ('+Math.round(ranges.reduce((s,r)=>s+r.end-r.start+1,0)/1048576)+' MB), excluding bundled GUI tools.');
await Promise.all([worker(),worker(),worker()]);
console.log('Official PostgreSQL server binaries extracted to .postgres-local/pgsql');

