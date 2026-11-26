#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
const arg=process.argv[2];
if(!arg){console.error('Usage: RUNTIME_NODE_MODULES=<bundled modules> node package-4k.mjs manifest.json');process.exit(2);}
const root=process.env.RUNTIME_NODE_MODULES;if(!root)throw Error('RUNTIME_NODE_MODULES must come from load_workspace_dependencies');
const req=createRequire(path.join(path.resolve(root),'__resolver.cjs'));
const sharp=req(path.join(path.resolve(root),'sharp')),JSZip=req(path.join(path.resolve(root),'jszip'));
const manifestPath=path.resolve(arg),m=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const resolve=p=>{if(typeof p!=='string'||!path.isAbsolute(p))throw Error('Manifest paths must be absolute');return p;};
const pptx=resolve(m.pptx),out=resolve(m.outputDir),receiptPath=resolve(m.receipt);
if(!Number.isSafeInteger(m.expectedCount)||m.expectedCount<1||m.expectedCount>100)throw Error('expectedCount must be 1..100');
if(!Array.isArray(m.slides)||m.slides.length!==m.expectedCount)throw Error('Slide manifest count mismatch');
if(typeof m.stem!=='string'||!m.stem.trim()||/[\\/\x00-\x1f]/.test(m.stem)||m.stem==='.'||m.stem==='..')throw Error('Invalid output stem');
const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8')),pptBytes=await fs.readFile(pptx);
const sha=createHash('sha256').update(pptBytes).digest('hex');
if(receipt.finalSha256!==sha)throw Error('PPTX does not match finalization receipt');
const zip=await JSZip.loadAsync(pptBytes);
const slideNames=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
if(slideNames.length!==m.expectedCount)throw Error('PPTX slide count mismatch');
const entity=s=>s.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const clean=s=>entity(s).normalize('NFC').replace(/\s/g,'');
// Follow actual slide order through presentation relationships, rather than filename order.
const pres=await zip.file('ppt/presentation.xml').async('string'),rels=await zip.file('ppt/_rels/presentation.xml.rels').async('string');
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(a=>[a[1],entity(a[2])]));
const relmap={};for(const a of rels.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)){const x=attrs(a[1]);relmap[x.Id]=x.Target;}
const ordered=[...pres.matchAll(/<p:sldId\b([^>]+)\/?\s*>/g)].map(a=>{const x=attrs(a[1]),target=relmap[x['r:id']];if(!target)throw Error('Unresolved slide relationship');return target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join('ppt',target));});
if(ordered.length!==m.expectedCount||new Set(ordered).size!==m.expectedCount)throw Error('Invalid actual slide order');
for(let i=0;i<m.expectedCount;i++){
 const s=m.slides[i];if(!Array.isArray(s.editableText)||!s.editableText.length||s.editableText.some(x=>typeof x!=='string'||!x.trim()))throw Error('Every slide needs a meaningful editableText contract');
 const xml=await zip.file(ordered[i]).async('string');
 const native=[...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(a=>a[1]).join('');
 for(const text of s.editableText)if(!clean(native).includes(clean(text)))throw Error(`Slide ${i+1}: required copy is not native editable text: ${text.slice(0,50)}`);
 const png=resolve(s.png),meta=await sharp(png).metadata();
 if(meta.width!==3840||meta.height!==2160||meta.format!=='png')throw Error(`Slide ${i+1} must be a 3840x2160 PNG rendered from final PPTX`);
}
await fs.mkdir(out,{recursive:true});
const long=path.join(out,m.stem+'_4K竖向全览.png'),archive=path.join(out,m.stem+'_4K单页.zip'),destPpt=path.join(out,path.basename(pptx));
const log=path.join(path.dirname(manifestPath),path.basename(manifestPath,'.json')+'.packaging.json');
for(const p of [long,archive,log,...(path.resolve(destPpt)!==path.resolve(pptx)?[destPpt]:[])]){try{await fs.access(p);throw Error('Refusing to overwrite '+p);}catch(e){if(e.code!=='ENOENT')throw e;}}
const h=2160*m.expectedCount+96*(m.expectedCount-1),temp=long+'.partial.png';
try{
 await sharp({create:{width:3840,height:h,channels:3,background:m.background||'#E7E9E4'}}).composite(m.slides.map((s,i)=>({input:s.png,left:0,top:i*2256}))).png({compressionLevel:9}).toFile(temp);
 await fs.rename(temp,long);
 const imgs=new JSZip();for(let i=0;i<m.expectedCount;i++)imgs.file(`${m.stem}_${String(i+1).padStart(2,'0')}_3840x2160.png`,await fs.readFile(m.slides[i].png));
 await fs.writeFile(archive,await imgs.generateAsync({type:'nodebuffer',compression:'STORE'}),{flag:'wx'});
 if(path.resolve(destPpt)!==path.resolve(pptx))await fs.copyFile(pptx,destPpt,constants.COPYFILE_EXCL);
 const report={pptx:destPpt,sha256:sha,slides:m.expectedCount,slideOrder:ordered,nativeTextContractPassed:true,slideSize:[3840,2160],longSize:[3840,h],long,archive};
 await fs.writeFile(log,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await fs.rm(temp,{force:true});throw e;}
