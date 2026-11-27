// 「移動の軌跡の途中にある格子点の相手駒も取れるとしたら、どれくらい起きるか」の測定（測定だけ。ルールは変えない）。
// index.html のエンジンをそのまま取り出して使う。index.html は変更しない。
//   node sim/pathcap.js          … 測定して sim/pathcap-result.json（生データ）と sim/pathcap-result.txt（表）を書く
//   node sim/pathcap.js selftest … 軌跡の計算の自己確認だけ（対局は使わない）
//
// ======================================================================================
// 軌跡の定義と集計の切り口（結果を見る前に固定したもの。このファイルの最初のコミットで固定し、結果は別のコミット）
// ======================================================================================
// 手: 味方の中心 c のまわりの z′ = c + w(z − c) で z から z′ へ動く。エンジンの explain(b, from, to) が返す
//     （中心 c, 変換 tf）の組を「説明」と呼ぶ。1 つの手（from→to）に説明が 2 つ以上あることがある。
// 軌跡上の点: 出発点 z と到着点 z′ を除き、軌跡の上に乗る格子点のうち、盤の中（|x|,|y| ≤ 3）のもの。
//   - MAGNA（拡大子。w = ±2, ±1/2, −1）・SPIRA（螺旋子。w = 1±i, (1±i)/2）・IMAGO（鏡映子。共役の 4 通り）:
//       線分 z→z′ 上の格子点（端点を除く）。d = z′ − z, g = gcd(|dx|,|dy|) として z + k·d/g（k = 1..g−1）
//   - ROTA（回転子。w = ±i）: 2 通りを別々に集計する
//       (a) 弦: 線分 z→z′ 上の格子点（上と同じ）
//       (b) 弧: 中心 c・半径 |z − c| の円の上で、z から z′ までの短い方の弧（90°）の内側にある格子点（端点を除く）
//   - POLUS（核。z′ = z + u の 1 歩）: 途中の格子点がないので対象外（全合法手の分母には入れ、「軌跡の点なし」として数える）
// 盤の外の点は数えない（駒は盤の中にしかないため）。中心 c 自身が軌跡に乗ることがある（例: w = −1 は c を通る）。
//
// 集計の単位
//   U1「手」: 合法手 from→to。説明のどれか 1 つでも軌跡上に相手駒があれば「相手駒あり」（指す人が変換を選べるとみなす）。
//            あわせて「すべての説明で相手駒あり」も数える。全体の割合はこの単位。
//   U2「説明」: （手, 中心, 変換）の組。駒の種類・w ごとの内訳はこの単位。
//   ROTA の (a) 弦・(b) 弧は、U1・U2 とも別々の数字として出す（ROTA 以外の駒は両方で同じ）。
// 対象の局面: 3 手読み同士の自己対戦 200 局（sim/selfplay.js と同じ作り方: 局 g の乱数 rng(1000 + g·7919)、序盤 6 手は
//   最善から 40 点以内を乱択）の、終局していない全局面。その局面の手番の側の全合法手（E.legal）と、実際に指された手。
//   200 局の勝敗が 117/81/2 であることをこのスクリプトの中でも確かめる（main と同じ自己対戦であることの確認）。
// 測るもの
//   1. 全合法手のうち、軌跡上に相手駒が 1 つ以上ある手の割合（U1）。駒の種類・w ごとの内訳（U2）
//   2. 実際に指された手のうち、同じ割合と内訳
//   3. 軌跡上の相手駒の種類の内訳（駒の数で数える）。POLUS が乗っている手は別枠（POLUS だけが乗っている手も別に）
//   4. 軌跡上に相手駒が 2 つ以上ある手の件数
//   5. 参考: 軌跡上に味方の駒がある手の割合。中心 c 自身を含む場合と除く場合の両方
//   補足: 軌跡上に格子点がそもそもある手の割合、説明が 2 つ以上ある手の割合、取りの手（到着点に相手駒）との重なり
// 割合には分子・分母の件数を必ず付ける。
// ======================================================================================
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
const NN=E.NN,X=E.X,Y=E.Y,fr=m=>(m/NN)|0,to=m=>m%NN;
const NAME={1:'POLUS',2:'ROTA',3:'IMAGO',4:'MAGNA',5:'SPIRA'};
const gcd=(a,b)=>{a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b];}return a;};
const inb=(x,y)=>Math.abs(x)<=3&&Math.abs(y)<=3;

// 線分 z→z′ 上の格子点（端点を除く・盤の中）
function segPoints(f,t){
 const dx=X[t]-X[f],dy=Y[t]-Y[f],g=gcd(dx,dy),out=[];
 for(let k=1;k<g;k++){const x=X[f]+k*dx/g,y=Y[f]+k*dy/g;if(inb(x,y))out.push(E.idx(x,y));}
 return out;
}
// 中心 c の円弧 z→z′（短い方。ROTA は 90° なので短い方は一意）上の格子点（端点を除く・盤の中）
function arcPoints(c,f,t){
 const a=X[f]-X[c],b=Y[f]-Y[c],p=X[t]-X[c],q=Y[t]-Y[c],r2=a*a+b*b,out=[];
 const cr=(u1,v1,u2,v2)=>u1*v2-v1*u2;
 const s=Math.sign(cr(a,b,p,q));            // +1 なら反時計回り（w = i）、−1 なら時計回り（w = −i）
 for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){
  const u=x-X[c],v=y-Y[c];if(u*u+v*v!==r2)continue;
  if(s*cr(a,b,u,v)>0&&s*cr(u,v,p,q)>0)out.push(E.idx(x,y));
 }
 return out;
}
// 説明 1 つの軌跡上の点。def: 'chord' | 'arc'（ROTA にだけ効く）
function pathOf(b,f,t,ex,def){
 const k=Math.abs(b[f]);
 if(k===E.K)return [];
 if(k===E.ROT&&def==='arc')return arcPoints(ex.c,f,t);
 return segPoints(f,t);
}

function selftest(){
 const I=E.idx,bad=[];const eq=(a,b,n)=>{const A=JSON.stringify(a.slice().sort((x,y)=>x-y)),B=JSON.stringify(b.slice().sort((x,y)=>x-y));if(A!==B)bad.push(n+': '+A+' ≠ '+B);};
 eq(segPoints(I(-2,-2),I(2,2)),[I(-1,-1),I(0,0),I(1,1)],'対角の線分');
 eq(segPoints(I(0,0),I(1,2)),[],'gcd 1 の線分は点なし');
 eq(segPoints(I(-3,0),I(3,0)),[I(-2,0),I(-1,0),I(0,0),I(1,0),I(2,0)],'横の線分');
 // 弧: 中心 0、z = 3 → z′ = 3i（w = i）。半径 3 の円の格子点は (±3,0),(0,±3) だけなので途中の点なし
 eq(arcPoints(I(0,0),I(3,0),I(0,3)),[],'半径 3 の弧');
 // 中心 0、z = 2+i → z′ = −1+2i（w = i）。半径 √5: 弧の途中に (1,2) が乗る
 eq(arcPoints(I(0,0),I(2,1),I(-1,2)),[I(1,2)],'半径 √5 の弧（反時計回り）');
 eq(arcPoints(I(0,0),I(-1,2),I(2,1)),[I(1,2)],'半径 √5 の弧（時計回り）');
 // 中心 0、z = 3+i → z′ = −1+3i: 半径 √10 の弧の途中に (1,3)? 1+9=10 で、角度は 18.4°〜108.4° の間 → 71.6° で乗る
 eq(arcPoints(I(0,0),I(3,1),I(-1,3)),[I(1,3)],'半径 √10 の弧');
 // w = −1 の線分は中心を通る
 eq(segPoints(I(-2,0),I(2,0)),[I(-1,0),I(0,0),I(1,0)],'w=−1 は中心を通る');
 return bad;
}

function newAgg(){return {moves:0,hasPts:0,enemy:0,enemyAll:0,enemy2:0,polus:0,polusOnly:0,friend:0,friendNoC:0,capAlso:0,multiEx:0,enemyByType:{2:0,3:0,4:0,5:0,1:0},
 byW:{}};}
function addW(A,key,ptsN,en,en2,fr,frNoC,pol){
 const w=A.byW[key]||(A.byW[key]={n:0,hasPts:0,enemy:0,enemy2:0,polus:0,friend:0,friendNoC:0});
 w.n++;if(ptsN)w.hasPts++;if(en)w.enemy++;if(en2)w.enemy2++;if(pol)w.polus++;if(fr)w.friend++;if(frNoC)w.friendNoC++;
}
// 局面 b（side の番）の手 m を集計 A に足す
function tally(A,b,side,m,def){
 const f=fr(m),t=to(m),k=Math.abs(b[f]),exs=E.explain(b,f,t);
 A.moves++;if(exs.length>1)A.multiEx++;
 let any=false,all=true,anyPts=false,any2=false,anyPol=false,anyPolOnly=false,anyFr=false,anyFrNoC=false;const typesAny=new Set();
 for(const ex of exs){
  const pts=pathOf(b,f,t,ex,def);
  const enemy=pts.filter(p=>b[p]*side<0),friend=pts.filter(p=>b[p]*side>0),friendNoC=friend.filter(p=>p!==ex.c);
  const pol=enemy.some(p=>Math.abs(b[p])===E.K),polOnly=pol&&enemy.every(p=>Math.abs(b[p])===E.K);
  if(pts.length)anyPts=true;
  if(enemy.length){any=true;for(const p of enemy)typesAny.add(p);}else all=false;
  if(enemy.length>=2)any2=true;if(pol)anyPol=true;if(polOnly)anyPolOnly=true;
  if(friend.length)anyFr=true;if(friendNoC.length)anyFrNoC=true;
  const key=k===E.K?'POLUS +u':NAME[k]+' w='+ex.tf.id;
  addW(A,key,pts.length,enemy.length>0,enemy.length>=2,friend.length>0,friendNoC.length>0,pol);
 }
 if(!exs.length)all=false;
 if(anyPts)A.hasPts++;
 if(any){A.enemy++;for(const p of typesAny)A.enemyByType[Math.abs(b[p])]++;if(b[t]*side<0)A.capAlso++;}
 if(any&&all)A.enemyAll++;
 if(any2)A.enemy2++;if(anyPol)A.polus++;if(anyPolOnly&&!([...typesAny].some(p=>Math.abs(b[p])!==E.K)))A.polusOnly++;
 if(anyFr)A.friend++;if(anyFrNoC)A.friendNoC++;
}

function measure(){
 const t0=Date.now(),R={games:200,first:0,second:0,draw:0,positions:0,
  all:{chord:newAgg(),arc:newAgg()},played:{chord:newAgg(),arc:newAgg()},playedMoves:[]};
 for(let g=0;g<200;g++){
  const rand=E.rng(1000+g*7919);let s=E.newGame({seed:g});
  while(!s.result){
   const ms=E.legal(s.b,s.turn,s.rep);R.positions++;
   const a=E.choose(s,{depth:3,margin:s.ply<6?40:0,rand});
   for(const def of ['chord','arc']){for(const m of ms)tally(R.all[def],s.b,s.turn,m,def);tally(R.played[def],s.b,s.turn,a.from*NN+a.to,def);}
   // 生データ: 実際に指された手ごとの、軌跡上の点（説明ごと・弦と弧）
   const exs=E.explain(s.b,a.from,a.to);
   R.playedMoves.push([g,s.ply,s.turn,Math.abs(s.b[a.from]),a.from,a.to,s.b[a.to],exs.map(ex=>[ex.c,ex.tf.id,pathOf(s.b,a.from,a.to,ex,'chord').map(p=>[p,s.b[p]]),pathOf(s.b,a.from,a.to,ex,'arc').map(p=>[p,s.b[p]])])]);
   s=E.apply(s,a);
  }
  const w=s.result.winner;if(w>0)R.first++;else if(w<0)R.second++;else R.draw++;
 }
 R.ms=Date.now()-t0;
 return R;
}

const pc=(a,b)=>b?(100*a/b).toFixed(2)+'%':'—';
const fmt=(a,b)=>pc(a,b)+'（'+a+' / '+b+'）';
function report(R){
 const L=[],P=x=>L.push(x);
 P('# 軌跡上の相手駒の測定（sim/pathcap.js）');P('');
 P('自己対戦: 3 手読み同士 200 局 → 先手 '+R.first+' / 後手 '+R.second+' / 引分 '+R.draw+'（main の sim/selfplay.js 3 3 200 と同じなら 117/81/2）。局面 '+R.positions+'、計算 '+(R.ms/1000).toFixed(0)+' 秒');
 for(const [scope,label] of [['all','全合法手'],['played','実際に指された手']]){
  P('');P('## '+label+'（単位: 手。説明のどれかで相手駒が乗れば「あり」）');P('');
  P('| ROTA の定義 | 手の数 | 軌跡に格子点がある手 | **軌跡上に相手駒 ≥1** | すべての説明で相手駒 | 相手駒 ≥2 | POLUS が乗る | POLUS だけが乗る | 到着点でも取る手 | 軌跡上に味方（中心を含む） | 軌跡上に味方（中心を除く） | 説明が 2 つ以上の手 |');
  P('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for(const def of ['chord','arc']){const A=R[scope][def];
   P('| '+(def==='chord'?'(a) 弦':'(b) 弧')+' | '+A.moves+' | '+fmt(A.hasPts,A.moves)+' | **'+fmt(A.enemy,A.moves)+'** | '+fmt(A.enemyAll,A.moves)+' | '+A.enemy2+' | '+fmt(A.polus,A.moves)+' | '+fmt(A.polusOnly,A.moves)+' | '+fmt(A.capAlso,A.moves)+' | '+fmt(A.friend,A.moves)+' | '+fmt(A.friendNoC,A.moves)+' | '+fmt(A.multiEx,A.moves)+' |');}
  P('');P('軌跡上の相手駒の種類（「相手駒あり」の手で、乗っている相手駒を 1 つずつ数える）');P('');
  P('| ROTA の定義 | POLUS | ROTA | IMAGO | MAGNA | SPIRA |');P('|---|---|---|---|---|---|');
  for(const def of ['chord','arc']){const T=R[scope][def].enemyByType;P('| '+(def==='chord'?'(a) 弦':'(b) 弧')+' | '+T[1]+' | '+T[2]+' | '+T[3]+' | '+T[4]+' | '+T[5]+' |');}
  P('');P('### 駒の種類・w ごとの内訳（単位: 説明）');P('');
  P('| 駒・w | 説明の数 | 軌跡に格子点あり | **軌跡上に相手駒 ≥1** | 相手駒 ≥2 | POLUS が乗る | 味方（中心を含む） | 味方（中心を除く） |');P('|---|---|---|---|---|---|---|---|');
  const keys=Object.keys(R[scope].chord.byW).sort();
  for(const k of keys){for(const def of (k.startsWith('ROTA')?['chord','arc']:['chord'])){const w=R[scope][def].byW[k];if(!w)continue;
   P('| '+k+(k.startsWith('ROTA')?(def==='chord'?'（弦）':'（弧）'):'')+' | '+w.n+' | '+fmt(w.hasPts,w.n)+' | **'+fmt(w.enemy,w.n)+'** | '+w.enemy2+' | '+fmt(w.polus,w.n)+' | '+fmt(w.friend,w.n)+' | '+fmt(w.friendNoC,w.n)+' |');}}
 }
 return L.join('\n');
}

const cmd=process.argv[2]||'run';
const st=selftest();
if(st.length){console.log('軌跡の自己確認 NG\n'+st.join('\n'));process.exit(1);}
if(cmd==='selftest'){console.log('軌跡の自己確認: OK');process.exit(0);}
const R=measure();
fs.writeFileSync(path.join(__dirname,'pathcap-result.json'),JSON.stringify(R));
const t=report(R);fs.writeFileSync(path.join(__dirname,'pathcap-result.txt'),t+'\n');console.log(t);
if(R.first!==117||R.second!==81||R.draw!==2){console.log('\nNG: 自己対戦の結果が main と違う');process.exit(1);}
