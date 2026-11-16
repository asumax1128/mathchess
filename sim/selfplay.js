// CPU 同士の自己対戦シミュレーション。index.html に埋め込まれたエンジンをそのまま取り出して使う。
//   node sim/selfplay.js                      … 既定の一式（3 系列＋強さ差＋駒落ち＋決定性）
//   node sim/selfplay.js 3 3 200              … 先手の読み深さ, 後手の読み深さ, 局数
//   node sim/selfplay.js --rules '{"hold":2}' … ルール変種を指定して 3 系列（2-2 200局, 3-3 200局, 4-4 60局）
//     追加: --series "3,3,400" で系列を指定、--seed0 1000 で種をずらす
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0];
const E=new Function(src+';return Engine;')();
let SEED0=0;
const NAMES={1:'核',2:'回転子',3:'鏡映子',4:'拡大子',5:'螺旋子'};

function play(d1,d2,seed,edit){
 seed+=SEED0;
 const rand=E.rng(1000+seed*7919);
 let s=E.newGame({seed});if(edit)edit(s);
 const st={mv:{},cap:{},mob:{},mobN:{},lastCap:0};
 while(!s.result){
  const ms=E.legal(s.b,s.turn,s.rep,s.ply);
  for(const m of ms){const t=Math.abs(s.b[(m/49)|0]);st.mob[t]=(st.mob[t]||0)+1;}
  for(let i=0;i<49;i++)if(s.b[i]*s.turn>0){const t=Math.abs(s.b[i]);st.mobN[t]=(st.mobN[t]||0)+1;}
  // 序盤 6 手は最善から 40 点以内を乱択して対局をばらけさせる
  const a=E.choose(s,{depth:s.turn>0?d1:d2,margin:s.ply<6?40:0,rand});
  const t=Math.abs(s.b[a.from]);st.mv[t]=(st.mv[t]||0)+1;
  if(s.b[a.to]){st.cap[t]=(st.cap[t]||0)+1;st.lastCap=s.ply;}
  s=E.apply(s,a);
 }
 return {s,st};
}
function series(d1,d2,G){
 const R={first:0,second:0,draw:0,reasons:{},len:[],mv:{},cap:{},mob:{},mobN:{},tail:0};
 for(let g=0;g<G;g++){
  const {s,st}=play(d1,d2,g);
  const w=s.result.winner;if(w>0)R.first++;else if(w<0)R.second++;else R.draw++;
  R.reasons[s.result.reason]=(R.reasons[s.result.reason]||0)+1;R.len.push(s.ply);R.tail+=s.ply-st.lastCap;
  for(const k of ['mv','cap','mob','mobN'])for(const t in st[k])R[k][t]=(R[k][t]||0)+st[k][t];
 }
 R.len.sort((a,b)=>a-b);
 const q=p=>R.len[Math.min(G-1,Math.floor(G*p))];
 console.log(`\n== 先手 ${d1}手読み vs 後手 ${d2}手読み / ${G}局 ==`);
 console.log(`先手勝ち ${R.first} / 後手勝ち ${R.second} / 引き分け ${R.draw}`);
 console.log(`決着理由`,R.reasons);
 {const r=R.reasons,dec=G-R.draw,o=r.origin||0,lim=r.limit||0;
  console.log(`要約 | 先手率 ${(100*R.first/(R.first+R.second)).toFixed(1)}% | 原点 ${o} (${(100*o/G).toFixed(0)}%) 詰み ${r.mate||0} 手なし ${r.stale||0} 上限 ${lim} (${(100*lim/G).toFixed(1)}%)`);}
 console.log(`手数(ply) 平均 ${(R.len.reduce((a,b)=>a+b,0)/G).toFixed(1)} 中央 ${q(.5)} 10% ${q(.1)} 90% ${q(.9)} 最短 ${R.len[0]} 最長 ${R.len[G-1]} / 最後の駒取りから終局まで平均 ${(R.tail/G).toFixed(1)}`);
 const tot=Object.values(R.mv).reduce((a,b)=>a+b,0),tc=Object.values(R.cap).reduce((a,b)=>a+b,0);
 for(let t=1;t<=5;t++)console.log(`  ${NAMES[t]}: 指し手の ${(100*(R.mv[t]||0)/tot).toFixed(1)}% / 駒取りの ${(100*(R.cap[t]||0)/tc).toFixed(1)}% / 1枚あたり合法手 ${(R.mob[t]/R.mobN[t]).toFixed(2)}`);
 return R;
}
// 駒落ち戦: A は ta を1枚欠き、B は tb を1枚欠く。先後は交互
function handicap(ta,tb,G,d){
 let wa=0,wb=0,dr=0;
 const rm=(s,side,t)=>{for(let i=0;i<49;i++)if(s.b[i]===side*t){s.b[i]=0;return;}};
 for(let g=0;g<G;g++){const sa=g%2?1:-1;
  const {s}=play(d,d,g+500,s=>{rm(s,sa,ta);rm(s,-sa,tb);});
  if(s.result.winner===sa)wa++;else if(s.result.winner===-sa)wb++;else dr++;}
 console.log(`  ${NAMES[ta]}落ち ${wa} 勝 — ${NAMES[tb]}落ち ${wb} 勝（分 ${dr}）`);
}
const argv=process.argv.slice(2);
const opt={};for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--')){opt[argv[i].slice(2)]=argv[i+1];argv.splice(i,2);i--;}
if(opt.rules)Object.assign(E.RULES,JSON.parse(opt.rules));
if(opt.seed0)SEED0=+opt.seed0;
const a=argv.map(Number);
if(opt.rules||opt.series){
 console.log('RULES',JSON.stringify(E.RULES),'seed0',SEED0);
 for(const sr of (opt.series||'2,2,200;3,3,200;4,4,60').split(';')){const [x,y,g]=sr.split(',').map(Number);series(x,y,g);}
}
else if(a.length>=3){series(a[0],a[1],a[2]);}
else{
 console.log('RULES',JSON.stringify(E.RULES));
 series(2,2,200);series(3,3,200);series(4,4,60);
 series(4,3,40);series(3,4,40);series(3,2,60);series(2,3,60);
 console.log('\n== 駒落ち戦（3手読み同士・各60局） ==');
 for(const [x,y] of [[5,2],[5,3],[5,4],[2,3],[2,4],[3,4]])handicap(x,y,60,3);
 // 決定性: 同じ種なら同じ棋譜、棋譜コードから同じ局面
 const g1=play(3,3,42).s,g2=play(3,3,42).s;
 const code=E.encode(g1),back=E.decode(code);
 console.log('\n決定性:',E.encode(g2)===code&&E.key(back.b,back.turn)===E.key(g1.b,g1.turn)?'OK':'NG',code);
}
