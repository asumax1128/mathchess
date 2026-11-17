// 採掘結果（tsume-mine.js の出力）から 24 問を選び、index.html の TSUME に書き込む。
//   node sim/tsume-build.js part0.json part1.json ...
// 選び方: 手数ごとに 8 問。種類は 詰み と 原点制圧 を半々（足りなければ他方で埋める）。初手の駒の種類が偏らないように、
// 同じ対局からは全体で 1 問まで（ある問題の続きが別の問題になるのを避ける）。選んだ問題は厳密な探索（tsume-lib の exact）で条件 1・2 を確かめてから採る。
const fs=require('fs'),path=require('path');
const L=require('./tsume-lib.js');const E=L.loadEngine();const X=L.exact(E);
const files=process.argv.slice(2);
const stats={games:0,positions:0,drop:{}};let cands=[];
for(const f of files){const d=JSON.parse(fs.readFileSync(f));stats.games+=d.stats.games;stats.positions+=d.stats.positions;
 for(const k in d.stats.drop)stats.drop[k]=(stats.drop[k]||0)+d.stats.drop[k];cands=cands.concat(d.cands);}
// 別の対局から同じ局面が採れた場合の重複を除く
const seen=new Set();cands=cands.filter(c=>{const k=E.key(c.b,1);if(seen.has(k)){stats.drop['重複局面']=(stats.drop['重複局面']||0)+1;return false;}seen.add(k);return true;});
const by={};for(const c of cands){const k=c.N+'-'+c.type;by[k]=(by[k]||0)+1;}
console.log('自己対戦',stats.games,'局 / 調べた局面',stats.positions);
console.log('落とした理由',JSON.stringify(stats.drop));
console.log('品質条件を満たした候補',cands.length,JSON.stringify(by));
const LET=' KRMSP';
const enc=b=>b.map(v=>v?(v>0?LET[v]:LET[-v].toLowerCase()):'.').join('');
const pc=(c)=>Math.abs(c.b[(c.first/49)|0]);
const exactOk=c=>{const s=X.state(c.b),allow=c.type==='mate'?L.MATE:L.ORIGIN;
 if(!X.canWin(s,c.N,allow))return false;const fm=X.winningFirstMoves(s,c.N,L.ANY);
 if(fm.length!==1||fm[0]!==c.first)return false;return !(c.N>1&&X.canWin(s,c.N-1,L.ANY));};
const picked=[];const rejectedExact=[];const games=new Set();
for(const N of [1,2,3]){
 // 駒が多い（中盤らしい）局面を優先。並びは決定的にする
 const pool=cands.filter(c=>c.N===N).sort((a,b)=>(b.my+b.op)-(a.my+a.op)||a.game-b.game||a.ply-b.ply);
 const got=[],pieceUse={},typeUse={mate:0,origin:0};
 const want={mate:4,origin:4};
 for(let pass=0;pass<3&&got.length<8;pass++){
  for(const c of pool){
   if(got.length>=8)break;
   if(got.indexOf(c)>=0||games.has(c.game))continue;
   if(pass<=1&&typeUse[c.type]>=want[c.type])continue;            // 種類を半々に
   if(pass===0&&(pieceUse[pc(c)]||0)>=3)continue;                 // 初手の駒を偏らせない（種類の半々を優先）
   if(!exactOk(c)){rejectedExact.push(c);continue;}
   got.push(c);games.add(c.game);pieceUse[pc(c)]=(pieceUse[pc(c)]||0)+1;typeUse[c.type]++;
  }
 }
 // 表示順: 詰み・原点制圧を交互に
 got.sort((a,b)=>a.type===b.type?0:a.type==='origin'?-1:1);
 const m=got.filter(c=>c.type==='mate'),o=got.filter(c=>c.type==='origin'),order=[];
 while(m.length||o.length){if(o.length)order.push(o.shift());if(m.length)order.push(m.shift());}
 picked.push(...order);
 console.log('あと'+N+'手: 候補',pool.length,'→ 採用',got.length,'（詰み',got.filter(c=>c.type==='mate').length,'/ 原点制圧',got.filter(c=>c.type==='origin').length,'）');
}
console.log('厳密検証で落ちた候補',rejectedExact.length);
const fx=m=>{const f=(m/49)|0,t=m%49;return [E.X[f],E.Y[f],E.X[t],E.Y[t]];};
const rows=picked.map((c,i)=>"  {id:"+(i+1)+",n:"+c.N+",type:'"+c.type+"',b:'"+enc(c.b)+"',first:["+fx(c.first).join(',')+"],src:'g"+c.game+"p"+c.ply+"'}");
const p=path.join(__dirname,'..','index.html');let html=fs.readFileSync(p,'utf8');
const a=html.indexOf('/*TSUME-BEGIN*/'),b=html.indexOf('/*TSUME-END*/');
html=html.slice(0,a)+'/*TSUME-BEGIN*/\nconst TSUME=[\n'+rows.join(',\n')+'\n];\n'+html.slice(b);
fs.writeFileSync(p,html);
fs.writeFileSync(path.join(__dirname,'tsume-log.json'),JSON.stringify({stats,candidates:by,total:cands.length,picked:picked.length,rejectedExact:rejectedExact.length},null,1));
console.log('index.html に',picked.length,'問を書き込みました');
