// 詰めORIGO の答え（勝ち手順）を作って検証し、全 24 問が OK のときだけ index.html に埋め込む。
//   node sim/tsume-answer.js          … 生成 → 検証 → 埋め込み
//   node sim/tsume-answer.js --dry    … 生成と検証だけ（書き込まない）
// 埋め込んだあとの再検証は  node sim/tsume-answer-check.js
const fs=require('fs'),path=require('path');
const A=require('./tsume-answer-lib.js');
const dry=process.argv.includes('--dry');
const h=A.html(),TS=A.loadBlock(h,'TSUME');
const t0=Date.now(),out=[];let bad=0;
for(const q of TS){
 const g=A.generate(q),v=A.verify(q,g);
 if(!v.ok){bad++;console.log(q.id,'NG',v.errors.join(' / '));}
 else console.log(String(q.id).padStart(2)+'  あと'+q.n+'手  '+(q.type==='mate'?'詰み    ':'原点制圧')+'  手順 '+g.line.length+' 手（自分 '+v.info.mineMoves+'）  最後 '+g.end);
 out.push({id:q.id,line:g.line,alt:g.alt,end:g.end});
}
console.log('\n'+(bad?'NG '+bad+' 問':'全 '+TS.length+' 問 OK')+'（'+((Date.now()-t0)/1000).toFixed(0)+' 秒）');
if(bad)process.exit(1);
if(dry)process.exit(0);
const rows=out.map(o=>"  {id:"+o.id+",line:"+JSON.stringify(o.line)+",alt:"+JSON.stringify(o.alt)+",end:'"+o.end+"'}");
const block='/*TSUMEANS-BEGIN*/\nconst TSUME_ANS=[\n'+rows.join(',\n')+'\n];\n/*TSUMEANS-END*/';
const p=path.join(__dirname,'..','index.html');let s=fs.readFileSync(p,'utf8');
if(s.indexOf('/*TSUMEANS-BEGIN*/')>=0){const a=s.indexOf('/*TSUMEANS-BEGIN*/'),b=s.indexOf('/*TSUMEANS-END*/')+'/*TSUMEANS-END*/'.length;s=s.slice(0,a)+block+s.slice(b);}
else{const k=s.indexOf('/*TSUME-END*/')+'/*TSUME-END*/'.length;s=s.slice(0,k)+'\n'+block+s.slice(k);}
fs.writeFileSync(p,s);
console.log('index.html に答えを埋め込みました');
