// 詰めORIGO の候補採掘。自己対戦の棋譜の全局面を調べ、
//   最短の強制勝ち手数 N(1〜3) / 初手が一つか / 種類（詰み・原点制圧） を判定して書き出す。
//   node sim/tsume-mine.js <開始局> <局数> <出力.json>
// 自己対戦の組み合わせは局番号で決まる（3-3, 2-2, 3-2, 2-3 の順に循環）。序盤 6 手は selfplay.js と同じく乱択。
const L=require('./tsume-lib.js');const E=L.loadEngine();const F=L.fast(E);
const [g0,gn,out]=[+process.argv[2]||0,+process.argv[3]||10,process.argv[4]||'cand.json'];
const NN=E.NN,O=E.O;
const PAIRS=[[3,3],[2,2],[3,2],[2,3]];
// 盤を「手番の側 = +1（手前・金）」にそろえる。後手番なら z → −z で回して色を入れ替える（ルールはこの変換で不変）
function normalize(b,S){if(S===1)return b.slice();const n=new Array(NN).fill(0);for(let i=0;i<NN;i++)if(b[i])n[E.idx(-E.X[i],-E.Y[i])]=-b[i];return n;}
const mirror=b=>{const n=new Array(NN).fill(0);for(let i=0;i<NN;i++)if(b[i])n[E.idx(-E.X[i],E.Y[i])]=b[i];return n;};
const canon=b=>{const a=E.key(b,1),c=E.key(mirror(b),1);return a<c?a:c;};
const stats={games:0,positions:0,drop:{}},cands=[],seen=new Set();
const drop=r=>{stats.drop[r]=(stats.drop[r]||0)+1;};
for(let g=g0;g<g0+gn;g++){
 const [d1,d2]=PAIRS[g%4],rand=E.rng(424242+g*7919);
 let s=E.newGame({seed:g+1});const hist=[];
 while(!s.result){hist.push(s);s=E.apply(s,E.choose(s,{depth:s.turn>0?d1:d2,margin:s.ply<6?40:0,rand}));}
 stats.games++;
 for(const h of hist){
  if(h.ply<6)continue;
  stats.positions++;
  const b=normalize(h.b,h.turn);
  const ck=canon(b);if(seen.has(ck)){drop('重複局面');continue;}seen.add(ck);
  let N=0;for(let n=1;n<=3;n++)if(F.canWin(b,1,n,L.ANY)){N=n;break;}
  if(!N){drop('3手以内の強制勝ちなし');continue;}
  if(E.inCheck(b,1)){drop('開始局面で王手を受けている');continue;}
  let my=0,op=0;for(const v of b){if(v>0)my++;if(v<0)op++;}
  if(my<2||op<2){drop('駒が少なすぎる');continue;}
  const first=F.winningFirstMoves(b,1,N,L.ANY,2);
  if(first.length!==1){drop('勝てる初手が複数');continue;}
  let type=null;
  if(F.canWin(b,1,N,L.MATE))type='mate';else if(F.canWin(b,1,N,L.ORIGIN))type='origin';
  if(!type){drop('詰みと原点制圧が混在（どちらか一方では強制できない）');continue;}
  cands.push({N,type,b,first:first[0],game:g,ply:h.ply,pair:[d1,d2],my,op});
 }
}
require('fs').writeFileSync(out,JSON.stringify({stats,cands}));
console.log(JSON.stringify(stats),'cands',cands.length);
