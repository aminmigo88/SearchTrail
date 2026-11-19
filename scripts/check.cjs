const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..','extension');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.js'))){cp.execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});}
const assets=[...manifest.background.scripts,...manifest.content_scripts.flatMap(s=>s.js),manifest.browser_action.default_popup,...Object.values(manifest.icons)];
for(const f of assets){if(!fs.existsSync(path.join(root,f)))throw Error('Missing asset '+f);}
for(const file of fs.readdirSync(path.join(__dirname,'..','tests')).filter(x=>x.endsWith('.cjs'))){cp.execFileSync(process.execPath,['--check',path.join(__dirname,'..','tests',file)],{stdio:'inherit'});}
console.log('JavaScript syntax, manifest JSON and required assets passed.');

for(const file of ['package.json','package-lock.json']){if(JSON.parse(fs.readFileSync(path.join(root,'..',file))).version!==manifest.version)throw Error('Version mismatch: '+file);}
