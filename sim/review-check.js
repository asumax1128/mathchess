// ふりかえり（対局後の決め手の一手）の検証。index.html の エンジン と Review ブロック をそのまま取り出し、
// 自己対戦の対局にかけて、選ばれた決め手・代替手・理由を、ここで別に書いた計算で確かめる。
//   node sim/review-check.js                 … 3-3 / 2-2 / 3-2 / 2-3 手読みを各 15 局（勝敗のついた対局を、両方の側から解析）
//   node sim/review-check.js 40              … 組み合わせごとの局数
//
// 確かめること
//   1. 形勢の値 v（各局面。2 手読みと 3 手読みの平均。勝ち負けが見えたらその値。終局は ±100000）を独立に計算し直して一致
//   2. 分岐点: 選ばれた手があなたの手で、手の前は勝敗の側でなく、手のあとは勝敗の側で、以後終局まで勝敗の側のまま。
//      それより前のあなたの手には、この条件を満たすものがない
//   3. 分岐点がない対局: 本当に条件を満たす手がなく、選ばれた手が「勝敗の向きへの形勢の動き」が最大の手（同じなら早い手）
//   4. 負けの代替手: その局面のあなたの全合法手を測り直し、最大（同じなら並び順で先）で、実際の手より厳密に良いときだけ示している
//   5. 理由の分類: 同じ規則を別に書いて一致
//   6. 解析の時間（このマシン）。120 手近い対局も含む
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
const R=new Function('E',html.split('/*REVIEW-BEGIN*/')[1].split('/*REVIEW-END*/')[0]+';return Review;')(E);
const NN=E.NN,O=E.O,K=E.K,fr=m=>(m/NN)|0,to=m=>m%NN;
const T=150,BIG=100000;

// ---- 独立の計算
function val(s,H){
 if(s.result)return s.result.winner===H?BIG:s.result.winner===-H?-BIG:0;
 const a2=E.choose(s,{depth:2,margin:0,rand:E.rng(1)}),a3=E.choose(s,{depth:3,margin:0,rand:E.rng(1)});
 const v2=s.turn===H?a2.score:-a2.score,v3=s.turn===H?a3.score:-a3.score;
 if(Math.abs(v2)>=90000||Math.abs(v3)>=90000)return Math.abs(v3)>Math.abs(v2)?v3:v2;
 return (v2+v3)/2;
}
const cls=v=>v>=T?1:v<=-T?-1:0;
function centerOf(b,side,rep,p){return E.legal(b,side,rep).some(m=>fr(m)!==p&&E.explain(b,fr(m),to(m)).some(e=>e.c===p));}
function kingCanEnter(b,side,rep){const k=E.kingPos(b,side);return k>=0&&k!==O&&E.legal(b,side,rep).some(m=>m===k*NN+O);}
function classify(st,k,H,win){
 const s0=st[k],s1=st[k+1],m=s1.log[k],t=to(m);
 if(win){
  if(t===O&&s1.b[O]===H*K)return 'origin';
  if(kingCanEnter(s1.b,H,s1.rep)&&!kingCanEnter(s0.b,H,s0.rep))return 'origin';
  const c=s0.b[t];if(c&&c*H<0)return centerOf(s0.b,-H,s0.rep,t)?'center':'capture';
  return 'none';
 }
 const s2=st[k+2],r=s2?s2.log[k+1]:null;
 if(r!==null&&to(r)===O&&s2.b[O]===-H*K)return 'origin';
 if(kingCanEnter(s1.b,-H,s1.rep)&&!kingCanEnter(s0.b,-H,s0.rep))return 'origin';
 if(r!==null){const c=s1.b[to(r)];if(c&&c*H>0)return centerOf(s1.b,H,s1.rep,to(r))?'center':'capture';}
 return 'none';
}

function check(game,H,stat){
 const t0=Date.now(),c=R.analyze(game,H),ms=Date.now()-t0;
 stat.reviews++;stat.ms.push([ms,game.log.length]);
 const errs=[];
 const st=[E.newGame({seed:game.seed,first:game.first})];for(const m of game.log)st.push(E.apply(st[st.length-1],{from:fr(m),to:to(m)}));
 const N=st.length-1,o=game.result.winner===H?1:-1;
 // 1. 値
 const v=st.map((s,i)=>i===N?o*BIG:val(s,H));
 for(let i=0;i<=N;i++)if(Math.abs(v[i]-c.v[i])>1e-9){errs.push('値が違う '+i);break;}
 // 2・3. 決め手
 const mine=[];for(let k=0;k<N;k++)if(st[k].turn===H)mine.push(k);
 const ok=k=>cls(v[k])!==o&&cls(v[k+1])===o&&v.slice(k+1).every(x=>cls(x)===o);
 const br=mine.find(ok);
 if(br!==undefined){
  if(c.kind!=='branch'||c.k!==br)errs.push('分岐点が違う（期待 '+br+'、結果 '+c.kind+' '+c.k+'）');
  stat.branch++;
 }else{
  let best=-Infinity,bk=-1;for(const k of mine){const d=o*(v[k+1]-v[k]);if(d>best){best=d;bk=k;}}
  if(c.kind!=='swing'||c.k!==bk)errs.push('最大の動きの手が違う（期待 '+bk+'、結果 '+c.kind+' '+c.k+'）');
  stat.swing++;
 }
 // 4. 代替手
 if(o<0&&c.k>=0){
  const s=st[c.k],ms2=E.legal(s.b,H,s.rep);let bi=-1,bv=-Infinity;
  ms2.forEach((m,i)=>{const x=val(E.apply(s,{from:fr(m),to:to(m)}),H);if(x>bv){bv=x;bi=i;}});
  const want=bv>v[c.k+1]?ms2[bi]:null;
  if((c.alt?c.alt.move:null)!==want)errs.push('代替手が違う');
  if(c.alt){stat.alt++;if(c.alt.move===c.move)errs.push('代替手が実際の手と同じ');}else stat.noAlt++;
 }
 // 5. 理由
 if(c.k>=0){const want=classify(st,c.k,H,o>0);if(c.reason.cat!==want)errs.push('理由が違う（期待 '+want+'、結果 '+c.reason.cat+'）');
  const key=(o>0?'勝ち・':'負け・')+c.reason.cat;stat.cat[key]=(stat.cat[key]||0)+1;}
 if(errs.length){stat.bad++;if(stat.bad<=5)console.log('  NG seed '+game.seed+' H '+H+': '+errs.join(' / '));}
}

const G=+(process.argv[2]||15);
const stat={games:0,decided:0,reviews:0,branch:0,swing:0,alt:0,noAlt:0,bad:0,cat:{},ms:[]};
const PAIRS=[[3,3],[2,2],[3,2],[2,3]];let long=null;
for(let g=0;g<G*4;g++){
 const [d1,d2]=PAIRS[g%4],rand=E.rng(5000+g*7919);let s=E.newGame({seed:g+1,first:1});
 while(!s.result)s=E.apply(s,E.choose(s,{depth:s.turn>0?d1:d2,margin:s.ply<6?40:0,rand}));
 stat.games++;
 if(s.result.reason==='limit'&&!long)long={seed:g+1,first:1,log:s.log.slice(0,119)};
 if(!s.result.winner)continue;
 stat.decided++;
 const game={seed:g+1,first:1,log:s.log,result:s.result};
 check(game,1,stat);check(game,-1,stat);
}
// 120 手近い対局: 手数上限まで行った対局を 119 手目で投了したことにして解析する（投了の結果は手番の側の負け）
if(long){
 let st=E.newGame({seed:long.seed,first:1});for(const m of long.log)st=E.apply(st,{from:fr(m),to:to(m)});
 const game={seed:long.seed,first:1,log:long.log,result:{winner:-st.turn,reason:'resign',by:st.turn}};
 check(game,1,stat);check(game,-1,stat);
 const t0=Date.now();R.analyze(game,1);console.log('119 手の対局の解析: '+(Date.now()-t0)+' ms（このマシン）');
}
const per=stat.ms.map(([ms,n])=>ms/Math.max(1,n));
console.log('自己対戦 '+stat.games+' 局（勝敗がついた '+stat.decided+' 局）、ふりかえり '+stat.reviews+' 件（両方の側から）');
console.log('決め手: 分岐点 '+stat.branch+' 件、分岐点なし（最大の動き） '+stat.swing+' 件');
console.log('負けの代替手: あり '+stat.alt+' 件、なし（これより良い手がない） '+stat.noAlt+' 件');
console.log('理由の内訳: '+JSON.stringify(stat.cat));
console.log('解析時間: 1 手あたり平均 '+(per.reduce((a,b)=>a+b,0)/per.length).toFixed(1)+' ms、最長の 1 件 '+Math.max(...stat.ms.map(x=>x[0]))+' ms');
console.log(stat.bad?'NG '+stat.bad+' 件':'ふりかえりの検証: OK（定義との不一致 0）');
process.exit(stat.bad?1:0);
