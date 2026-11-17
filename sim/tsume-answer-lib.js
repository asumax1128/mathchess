// 詰めORIGO の答え（勝ち手順）の生成と検証に共通の道具。探索は sim/tsume-lib.js の厳密な探索（E.apply だけを使う）。
//
// 手順の決め方（画面の「相手の応手」と同じ規則）:
//   自分の手 : その問題の種類（詰み／原点制圧）の勝ちを強制できる手のうち、最も少ない手数で勝てる手。同じなら合法手の並び順で先のもの。
//              初手だけは、勝てる手が一つしかない（品質条件 2）
//   相手の応手: 最も長く粘る手（自分が勝つまでに要る手数が最大の応手。勝ちを避けられる手があればそれ）。同じなら先に見つけた手。
//              手数は「詰み・原点制圧・手なし」のどの勝ちでも数える。画面の詰め問題の相手（Ts の defend）と同じ規則
const fs=require('fs'),path=require('path');
const L=require('./tsume-lib.js');const E=L.loadEngine();const X=L.exact(E);
const NN=E.NN,fr=m=>(m/NN)|0,to=m=>m%NN;
const T={K:E.K,R:E.ROT,M:E.MIR,S:E.SCA,P:E.SPI};
const html=()=>fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function loadBlock(h,name){return new Function(h.split('/*'+name+'-BEGIN*/')[1].split('/*'+name+'-END*/')[0]+';return '+(name==='TSUME'?'TSUME':'TSUME_ANS')+';')();}
function initial(q){
 const b=new Array(NN).fill(0);
 for(let i=0;i<NN;i++){const c=q.b[i];if(c!=='.')b[i]=(c===c.toUpperCase()?1:-1)*T[c.toUpperCase()];}
 return X.state(b);
}
const allowOf=q=>q.type==='mate'?L.MATE:L.ORIGIN;
// 相手の応手のあと（自分の番の局面 a）、自分が勝つまでに要る自分の手数。0 = その場で勝ち、−1 = rem 手以内に勝てない
function dist(a,rem){
 if(a.result)return a.result.winner===1?0:-1;
 for(let k=1;k<=rem;k++)if(X.canWin(a,k,L.ANY))return k;
 return -1;
}
function pickReply(s,rem){
 let best=null,bd=-2;const ds=[];
 for(const m of E.legal(s.b,s.turn,s.rep)){
  const a=E.apply(s,{from:fr(m),to:to(m)}),d=dist(a,rem);ds.push(d);
  const sc=d<0?99:d;if(sc>bd){bd=sc;best=m;}
 }
 return {m:best,ds};
}
function pickMine(s,rem,allow){
 for(let n=1;n<=rem;n++){const W=X.winningFirstMoves(s,n,allow);if(W.length)return {m:W[0],n,count:W.length};}
 return null;
}
const mvArr=m=>[E.X[fr(m)],E.Y[fr(m)],E.X[to(m)],E.Y[to(m)]];
// 問題 q の手順を作る。戻り値 {line, alt, end}
function generate(q){
 const allow=allowOf(q);let s=initial(q),used=0;const line=[],alt=[];
 for(;;){
  const mine=pickMine(s,q.n-used,allow);if(!mine)throw new Error('第'+q.id+'問: 勝ち手がない');
  line.push(mvArr(mine.m));alt.push(mine.count);
  s=E.apply(s,{from:fr(mine.m),to:to(mine.m)});used++;
  if(s.result)break;
  const rp=pickReply(s,q.n-used);if(rp.m===null)throw new Error('第'+q.id+'問: 応手がない');
  line.push(mvArr(rp.m));
  s=E.apply(s,{from:fr(rp.m),to:to(rp.m)});
  if(s.result)break;
 }
 return {line,alt,end:s.result.reason};
}
// 手順 line が「そのとおりに指せば必ず勝てる」ことを、エンジンで確かめる。戻り値 {ok, errors, info}
function verify(q,a){
 const errors=[],allow=allowOf(q),line=a.line;let s=initial(q),used=0;
 const info={mineMoves:0,uniqueMine:0};
 if(!line||!line.length)return {ok:false,errors:['手順がない'],info};
 for(let i=0;i<line.length;i++){
  const m=E.idx(line[i][0],line[i][1])*NN+E.idx(line[i][2],line[i][3]);
  if(s.result){errors.push('終局後に手がある（'+(i+1)+' 番目）');break;}
  if(E.legal(s.b,s.turn,s.rep).indexOf(m)<0){errors.push((i+1)+' 番目が非合法手');break;}
  if(i%2===0){                                  // 自分の手
   if(s.turn!==1){errors.push('手番が合わない（'+(i+1)+' 番目）');break;}
   const rem=q.n-used;
   // 不変条件: この手のあと、相手のどの応手に対しても、残りの手数でその種類の勝ちが強制される
   const W=X.winningFirstMoves(s,rem,allow);
   if(W.indexOf(m)<0)errors.push((i+1)+' 番目の手では勝ちが強制されない');
   info.mineMoves++;if(W.length===1)info.uniqueMine++;
   if(a.alt&&a.alt[i/2]!==W.length)errors.push((i+1)+' 番目の「勝ち手の数」の記載が違う');
   if(i===0){
    const any=X.winningFirstMoves(s,q.n,L.ANY);
    if(any.length!==1||any[0]!==m)errors.push('初手が唯一の正解ではない／問題の初手と違う');
    if(m!==E.idx(q.first[0],q.first[1])*NN+E.idx(q.first[2],q.first[3]))errors.push('初手が問題データと違う');
   }
   used++;
  }else{                                        // 相手の応手
   if(s.turn!==-1){errors.push('手番が合わない（'+(i+1)+' 番目）');break;}
   const rem=q.n-used,rp=pickReply(s,rem);
   if(rp.ds.some(d=>d<0))errors.push((i+1)+' 番目の局面に、勝ちを避けられる応手がある');
   if(rp.m!==m)errors.push((i+1)+' 番目が「最も長く粘る手」ではない');
  }
  s=E.apply(s,{from:fr(m),to:to(m)});
 }
 if(!s.result)errors.push('手順の終わりで終局していない');
 else{
  if(s.result.winner!==1)errors.push('最後に勝っていない');
  const want=q.type==='mate'?'mate':'origin';
  if(s.result.reason!==want)errors.push('決着の種類が違う（'+s.result.reason+'）');
  if(a.end&&a.end!==s.result.reason)errors.push('end の記載が違う');
 }
 if(used>q.n)errors.push('自分の手が '+used+' 回で、あと '+q.n+' 手を超えている');
 info.used=used;info.end=s.result&&s.result.reason;
 return {ok:!errors.length,errors,info};
}
module.exports={L,E,X,initial,generate,verify,loadBlock,html,mvArr,NN};
