// 投了の検証。index.html の エンジン・投了ブロック・詰め問題 をそのまま取り出して使う。
//   node sim/resign-check.js                          … 静的な確認（段位の門・詰め問題・棋譜コード）＋小さな自己対戦
//   node sim/resign-check.js --series "3,3,100"       … 自己対戦（先手の読み深さ, 後手の読み深さ, 局数。; で複数）
//   node sim/resign-check.js --series "4,4,40" --seed0 7000
//
// 自己対戦の確認（誤投了ゼロ）:
//   全局面で CPU と同じ手順（choose → Resign.check）を実行し、投了が出た局面を集める。
//   各局面について、別の実装（sim/tsume-lib.js の exact。E.apply だけを使う厳密な探索）で
//   「自分のどの手に対しても、相手が k 手以内に勝ちを強制できる」ことを再確認する。
//   確認できなかった投了を「誤投了」とし、ゼロでなければ NG。
//   あわせて、投了せずに指し続けたときの結果（投了した側が実際に負けたか）も数える。
const fs=require('fs'),path=require('path');
const L=require('./tsume-lib.js');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
const R=new Function('E',html.split('/*RESIGN-BEGIN*/')[1].split('/*RESIGN-END*/')[0]+';return Resign;')(E);
const TSUME=new Function(html.split('/*TSUME-BEGIN*/')[1].split('/*TSUME-END*/')[0]+';return TSUME;')();
const X=L.exact(E);
const NN=E.NN,fr=m=>(m/NN)|0,to=m=>m%NN;
const argv=process.argv.slice(2),opt={};
for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--')){opt[argv[i].slice(2)]=argv[i+1];argv.splice(i,2);i--;}
let bad=0;const ng=m=>{bad++;console.log('  NG: '+m);};

// 厳密な再確認（別実装）: s の手番の側のどの手に対しても、相手が k 手以内に allow の勝ちを強制できるか
function exactLost(s,k,allow){
 const S=s.turn,ms=E.legal(s.b,S,s.rep);if(!ms.length)return false;
 for(const m of ms){
  const a=E.apply(s,{from:fr(m),to:to(m)});
  if(a.result){if(!(a.result.winner===-S&&allow[a.result.reason]))return false;continue;}
  if(!X.canWin(a,k,allow))return false;
 }
 return true;
}
const TYPE_ALLOW={mate:{mate:1,stale:1},origin:{origin:1},mixed:L.ANY};

// ---------------------------------------------------------------- 静的な確認
function staticChecks(){
 console.log('== 静的な確認 ==');
 // (1) 段位の門: 入門(1手読み)・標準(2手読み)では、確実な負けの局面でも絶対に投了しない
 // (2) 上級(3)・達人(4)の投了の種類が、詰め問題の種類（詰み／原点制圧）と一致する
 const T={K:E.K,R:E.ROT,M:E.MIR,S:E.SCA,P:E.SPI};
 let gate=0,gateBad=0,hit={3:0,4:0},tot={3:0,4:0},typeBad=0,none={3:[],4:[]};
 for(const q of TSUME){
  if(q.n<2)continue;
  const b=new Array(NN).fill(0);for(let i=0;i<NN;i++){const c=q.b[i];if(c!=='.')b[i]=(c===c.toUpperCase()?1:-1)*T[c.toUpperCase()];}
  const s0=X.state(b),f=E.idx(q.first[0],q.first[1]),t=E.idx(q.first[2],q.first[3]);
  const s=E.apply(s0,{from:f,to:t});            // 唯一の正解の初手のあと。相手(CPU)の番で、負けが確定している
  const rand=E.rng(11);
  for(const depth of [1,2,3,4]){
   const a=E.choose(s,{depth,margin:0,rand});
   const r=R.check(s,depth,a);
   if(depth<3){gate++;if(r)gateBad++;continue;}
   if(depth===3&&q.n!==2)continue;              // 上級は相手の 1 手 = あと 2 手の問題の応手側
   tot[depth]++;
   if(r){hit[depth]++;if(r!==q.type){typeBad++;console.log('  問'+q.id+' depth'+depth+': 種類 '+r+' ≠ 問題の種類 '+q.type);}}
   else none[depth].push(q.id);
  }
 }
 console.log('  入門・標準の門: 負け確定の局面 '+gate+' 件で投了 '+gateBad+' 件（0 が正）');
 if(gateBad)ng('入門・標準が投了した');
 console.log('  上級(3手読み): 相手の 1 手で負けが確定する局面 '+tot[3]+' 件のうち投了 '+hit[3]+' 件'+(none[3].length?'（投了しなかった問: '+none[3].join(',')+'）':''));
 console.log('  達人(4手読み): 相手の 2 手以内で負けが確定する局面 '+tot[4]+' 件のうち投了 '+hit[4]+' 件'+(none[4].length?'（投了しなかった問: '+none[4].join(',')+'。厳密な探索では負けが確定しているが、CPU の読みには見えていないので投了しない）':''));
 if(typeBad)ng('投了の決め手の種類が問題と違う');
 if(!hit[3]||!hit[4])ng('投了が一度も出ない');
 // (3) 棋譜コード
 console.log('== 棋譜コード ==');
 let rt=0,old=0,tried=0;
 for(let g=0;g<20;g++){
  const rand=E.rng(900+g);let s=E.newGame({seed:g+1,first:g%2?1:-1});const stop=3+g*2;
  while(!s.result&&s.ply<stop)s=E.apply(s,E.choose(s,{depth:1,margin:70,rand}));
  const plain=E.encode(s);
  // 従来の棋譜（ORIGO1.）はそのまま読めて、そのまま書き出せる
  const d=R.decode(plain);if(d&&R.encode(d)===plain&&E.key(d.b,d.turn)===E.key(s.b,s.turn)&&d.ply===s.ply)old++;else ng('従来の棋譜が壊れている '+plain);
  if(s.result)continue;
  for(const why of [null,'mate','origin','mixed']){
   tried++;const rs=R.mark(s,s.turn,why),code=R.encode(rs),back=R.decode(code);
   const ok=back&&back.result&&back.result.reason==='resign'&&back.result.by===s.turn&&back.result.winner===-s.turn&&(back.result.decisive||null)===why&&back.ply===s.ply&&E.key(back.b,back.turn)===E.key(s.b,s.turn)&&R.encode(back)===code;
   if(ok)rt++;else ng('投了の往復に失敗 '+code);
  }
 }
 console.log('  従来の棋譜の読み書き '+old+' / 20 件 OK、投了の往復 '+rt+' / '+tried+' 件 OK');
 if(rt!==tried)ng('投了の往復が一部失敗');
 const bads=['ORIGO1.a.1.zz.R-','ORIGO1.a.1..Rq','ORIGO1.a.1.'+'.R-.R-'];
 for(const c of bads){const d=R.decode(c);if(d&&d.result&&d.result.reason==='resign'&&c==='ORIGO1.a.1.zz.R-')ng('不正な棋譜を受け付けた '+c);}
 // 終局済みの対局に投了を足した棋譜は受け付けない
 {const rand=E.rng(5);let s=E.newGame({seed:3});while(!s.result)s=E.apply(s,E.choose(s,{depth:1,margin:70,rand}));
  if(R.decode(E.encode(s)+'.R-')!==null)ng('終局済みの対局への投了を受け付けた');else console.log('  終局済みの棋譜への投了は拒否 OK');}
}

// ---------------------------------------------------------------- 自己対戦
function series(d1,d2,G,seed0){
 const t0=Date.now(),res={games:G,pos:0,even:0,trig:0,confirmed:0,false:0,lostAfter:0,byType:{},byDepth:{3:0,4:0},byTurn:{1:0,'-1':0},maxMs:0,samples:[]};
 for(let g=0;g<G;g++){
  const seed=seed0+g,rand=E.rng(1000+seed*7919);
  let s=E.newGame({seed:seed+1});const trig=[];
  while(!s.result){
   const depth=s.turn>0?d1:d2;
   const a=E.choose(s,{depth,margin:s.ply<6?40:0,rand});
   res.pos++;if(Math.abs(a.score)<150)res.even++;
   const t1=Date.now();const why=R.check(s,depth,a);const ms=Date.now()-t1;if(ms>res.maxMs)res.maxMs=ms;
   if(why){
    res.trig++;res.byType[why]=(res.byType[why]||0)+1;res.byDepth[depth]++;res.byTurn[s.turn]++;
    const k=depth>>1,ok=exactLost(s,k,TYPE_ALLOW[why]);
    if(ok)res.confirmed++;else{res.false++;console.log('  誤投了? seed '+seed+' ply '+s.ply+' depth '+depth+' '+why+' '+E.encode(s));}
    trig.push({turn:s.turn,ply:s.ply});
    if(s.turn===-1&&res.samples.filter(x=>x.depth===depth).length<2)res.samples.push({depth,why,code:E.encode(s)});
   }
   s=E.apply(s,a);       // 投了せずに指し続ける
  }
  for(const t of trig)if(s.result.winner===-t.turn)res.lostAfter++;
 }
 console.log('\n== 自己対戦 先手 '+d1+' 手読み vs 後手 '+d2+' 手読み / '+G+' 局（種 '+seed0+'〜）==');
 console.log('調べた局面 '+res.pos+'（探索値が ±150 以内の互角の局面 '+res.even+'）');
 console.log('投了が出た局面 '+res.trig+'（詰み '+(res.byType.mate||0)+' / 原点制圧 '+(res.byType.origin||0)+' / 両方 '+(res.byType.mixed||0)+'、上級 '+res.byDepth[3]+' / 達人 '+res.byDepth[4]+'）');
 console.log('別実装の厳密な探索で確認できた投了 '+res.confirmed+' / '+res.trig+'、誤投了 '+res.false);
 console.log('投了せずに指し続けた結果、投了した側が実際に負けた '+res.lostAfter+' / '+res.trig);
 console.log('投了の判定にかかった最長 '+res.maxMs+' ms、全体 '+((Date.now()-t0)/1000).toFixed(0)+' 秒');
 if(res.false)ng('誤投了がある');
 if(res.samples.length)console.log('見本: '+JSON.stringify(res.samples));
 return res;
}

if(opt.series){
 const seed0=+(opt.seed0||0);
 for(const sr of opt.series.split(';')){const [a,b,g]=sr.split(',').map(Number);series(a,b,g,seed0);}
}else{
 staticChecks();
 series(3,3,20,0);series(4,4,6,0);
}
console.log('\n'+(bad?'NG '+bad+' 件':'投了の検証: OK'));
process.exit(bad?1:0);
