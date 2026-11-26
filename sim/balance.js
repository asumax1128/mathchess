// 先手の有利とハンデ候補の「測定だけ」を行うスクリプト。ゲーム本体（index.html）は変更しない。
// index.html のエンジンをそのまま取り出して CPU 同士の自己対戦を行う（ハンデ「後手の原点即勝ち」だけは、
// 取り出したエンジンのソース文字列をこのプロセスのメモリ上で書き換えて使う。ファイルは書き換えない）。
//
//   node sim/balance.js all            … 全実験を 4 並列で実行し、sim/balance-result.json と sim/balance-result.txt を書く
//   node sim/balance.js report         … 既存の sim/balance-result.json から表だけを出し直す
//   node sim/balance.js run <実験> <開始局> <局数>   … 1 区間だけ実行して JSON を標準出力へ（並列実行の部品）
//
// ======================================================================================
// 読み方の基準（測定の前に決めたもの。結果を見てから動かさない）
// ======================================================================================
// 共通: 勝率はすべて「引分を除いた」勝率 p = 勝ち /（勝ち + 負け）。95% 信頼区間は Wilson の区間。
//       数字には必ず局数（全局数と、引分を除いた局数）を付ける。
//
// 基準1 先手の有利（読みの深さ 2・3・4 の同じ強さ同士）
//   1a. 先手勝率 p が 55% を超え、かつ 95% 信頼区間の下端が 50% を超える        → 「実在の先手有利」（その深さで）
//   1b. 信頼区間の下端が 50% を超えるが、p が 55% 以下                          → 「小さい先手有利」（実在するが小さい）
//   1c. 信頼区間が 50% を含む                                                 → 「先手有利は検出されない」
//   1d. 信頼区間の上端が 50% を下回る                                           → 「後手有利」
// 基準2 正体の切り分け（評価の癖か、本物か）
//   2a. 深さ 4 で 1a か 1b                                                     → 「深さを上げても残る ＝ 本物の先手有利（測った深さの範囲で）」
//   2b. 深さ 2 か 3 で 1a/1b だが、深さ 4 で 1c                                 → 「深さで消える ＝ 評価（浅い読み）の癖の寄与が大きい」
//   2c. どの深さでも 1c                                                       → 「先手有利は測定にかからない」
//   補足として、深さ 3 と 4 の p の差の 95% 信頼区間（2 標本の差、正規近似）も出す。
// 基準3 強さのものさし（2対3、3対4。先後は 1 局ごとに入れ替えて先手の有利を打ち消す）
//   深い側の勝率（引分を除く）と信頼区間、Elo 換算 400·log10(p/(1−p)) を「読み1段の差」とする。
//   先手のときと後手のときの深い側の勝率も分けて出す。
// 基準4 ハンデ候補（深さ 3 同士。比べる基準は深さ 3 の素の対局 1000 局）
//   4a. 先手勝率の信頼区間が 50% を含み、かつ p が 45%〜55% の間                 → 「釣り合う（効く）」
//   4b. 信頼区間の下端が 50% を超えたまま                                       → 「足りない」（素の値からどれだけ動いたかを書く）
//   4c. 信頼区間の上端が 50% を下回る                                           → 「効きすぎ（後手有利に逆転）」
//   副作用（素の深さ 3 と比べて、次のどれかに当たれば「副作用あり」と書く）
//     ・引分率が 5 ポイント以上増減 ・平均手数が 20% 以上増減 ・勝ち方の内訳（原点制圧の割合）が 10 ポイント以上動く
// 基準5 推薦: 4a に当たる候補のうち、副作用が少ないもの → その中で p が 50% に近いもの、の順で推す。
//        4a が一つもなければ、50% に最も近い候補を「最も効く」として、足りない／効きすぎの程度とともに書く。
//        採用の決定は企画者が行う。ここでは推薦までで止める。
// ======================================================================================
//
// 対局の作り方は sim/selfplay.js と同じ（局 g の乱数 = rng(1000 + g·7919)、序盤 6 手は最善から 40 点以内を乱択、
// 先手 = +1 の側、120 手で引分）。深さ 3 同士の素の対局の最初の 200 局は `node sim/selfplay.js 3 3 200` と一致する。
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const SRC=html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0];
const mk=src=>new Function(src+';return Engine;')();
const E=mk(SRC);
const NAME=['','POLUS','ROTA','IMAGO','MAGNA','SPIRA'];

// ---- ハンデ「後手は原点に入った時点で勝ち（先手は従来どおり 1 手しのぐ）」: エンジンのソースをメモリ上で書き換える
function rep1(s,a,b){if(s.split(a).length!==2)throw new Error('patch target not unique: '+a.slice(0,60));return s.replace(a,b);}
function origin2Engine(){
 let s=SRC;
 // 対局の進行: 後手の手で核が原点に入ったら、その場で後手の勝ち
 s=rep1(s," if(b[O]===n.turn*K&&!attacked(b,O,s.turn))n.result={winner:n.turn,reason:'origin'};",
  " if(s.turn===-s.first&&b[O]===s.turn*K)n.result={winner:s.turn,reason:'origin'};\n"+
  " else if(b[O]===n.turn*K&&!attacked(b,O,s.turn))n.result={winner:n.turn,reason:'origin'};");
 // CPU の読み: 直前に指した側が後手で、その核が原点にあれば、手番の側の負け（CPU が新しい規則を知って読む）
 s=rep1(s,"const MATE=100000;","const MATE=100000;let SECOND=0;");
 s=rep1(s," const buf=bufs[ply],n=gen(b,side,buf);",
  " if(-side===SECOND&&b[O]===-side*K)return -(MATE-ply);\n const buf=bufs[ply],n=gen(b,side,buf);");
 s=rep1(s," const b=s.b.slice(),side=s.turn,ms=legal(b,side,s.rep);"," SECOND=-s.first;\n const b=s.b.slice(),side=s.turn,ms=legal(b,side,s.rep);");
 return mk(s);
}

// ---- 初期配置を変えるハンデ（newGame の結果を書き換え、千日手の記録も付け直す）
function reseat(s,Eng){s.rep={};s.rep[Eng.key(s.b,s.turn)]=1;return s;}
const at=(x,y)=>E.idx(x,y);
const SETUPS={
 // 後手の POLUS を 1 マス原点寄りへ。(0,2i) には後手の SPIRA がいるので、POLUS と SPIRA の位置を入れ替える
 kswap:s=>{s.b[at(0,3)]=-E.SPI;s.b[at(0,2)]=-E.K;return s;},
 // 先手だけ駒を 1 つ欠く（どの駒が適切かを見るため 4 種類）
 dropR:s=>{s.b[at(2,-3)]=0;return s;},   // ROTA（2 枚のうち 2−3i の 1 枚）
 dropM:s=>{s.b[at(1,-2)]=0;return s;},   // IMAGO
 dropS:s=>{s.b[at(-1,-2)]=0;return s;},  // MAGNA
 dropP:s=>{s.b[at(0,-2)]=0;return s;},   // SPIRA
};

// 実験の定義: d1 = 先手の深さ, d2 = 後手の深さ, alt = 先後を 1 局ごとに入れ替える（強さのものさし）
const EXP={
 'base-d2':{d:[2,2],n:400,label:'素の対局 深さ2同士'},
 'base-d3':{d:[3,3],n:1000,label:'素の対局 深さ3同士'},
 'base-d4':{d:[4,4],n:400,label:'素の対局 深さ4同士'},
 'scale-2v3':{d:[2,3],n:400,alt:true,label:'強さ 深さ2対3（先後交互）'},
 'scale-3v4':{d:[3,4],n:400,alt:true,label:'強さ 深さ3対4（先後交互）'},
 'h-kswap':{d:[3,3],n:400,setup:'kswap',label:'ハンデ 後手POLUSを1マス原点寄り（SPIRAと入替）'},
 'h-dropR':{d:[3,3],n:400,setup:'dropR',label:'ハンデ 先手のROTAを1枚欠く'},
 'h-dropM':{d:[3,3],n:400,setup:'dropM',label:'ハンデ 先手のIMAGOを欠く'},
 'h-dropS':{d:[3,3],n:400,setup:'dropS',label:'ハンデ 先手のMAGNAを欠く'},
 'h-dropP':{d:[3,3],n:400,setup:'dropP',label:'ハンデ 先手のSPIRAを欠く'},
 'h-origin2':{d:[3,3],n:400,origin2:true,label:'ハンデ 後手は原点に入った時点で勝ち'},
};

// ---- 1 区間を実行。1 局ごとに [勝者(+1先手/-1後手/0), 理由, 手数, 深い側が先手か(alt のみ)] を返す
function runPart(name,from,count){
 const X=EXP[name],Eng=X.origin2?origin2Engine():E,out=[];
 const t0=process.cpuUsage();
 for(let g=from;g<from+count;g++){
  const rand=Eng.rng(1000+g*7919);
  let s=Eng.newGame({seed:g});
  if(X.setup)reseat(SETUPS[X.setup](s),Eng);
  // alt: 偶数局は浅い側が先手、奇数局は深い側が先手
  const deepFirst=X.alt?(g%2===1):null;
  const dF=X.alt?(deepFirst?X.d[1]:X.d[0]):X.d[0],dS=X.alt?(deepFirst?X.d[0]:X.d[1]):X.d[1];
  while(!s.result)s=Eng.apply(s,Eng.choose(s,{depth:s.turn>0?dF:dS,margin:s.ply<6?40:0,rand}));
  out.push([s.result.winner,s.result.reason,s.ply].concat(X.alt?[deepFirst?1:0]:[]));
 }
 const c=process.cpuUsage(t0);
 return {name,from,count,games:out,cpuMs:Math.round((c.user+c.system)/1000)};
}

// ---- 統計
function wilson(k,n){if(!n)return [NaN,NaN];const z=1.959963985,p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h];}
const pct=x=>isNaN(x)?'—':(100*x).toFixed(1)+'%';
const ci=(k,n)=>{const [a,b]=wilson(k,n);return pct(k/n)+'（95%CI '+pct(a)+'〜'+pct(b)+'）';};
const elo=p=>p<=0||p>=1?NaN:400*Math.log10(p/(1-p));
function summarize(games){
 const S={n:games.length,F:0,S:0,D:0,why:{F:{},S:{},D:{}},len:{F:[],S:[],D:[],all:[]}};
 for(const [w,r,ply] of games){const k=w>0?'F':w<0?'S':'D';S[k]++;S.why[k][r]=(S.why[k][r]||0)+1;S.len[k].push(ply);S.len.all.push(ply);}
 S.dec=S.F+S.S;S.p=S.F/S.dec;S.ci=wilson(S.F,S.dec);
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
 S.mean={F:avg(S.len.F),S:avg(S.len.S),D:avg(S.len.D),all:avg(S.len.all)};
 const wins=S.dec,org=(S.why.F.origin||0)+(S.why.S.origin||0);S.originShare=org/wins;
 S.drawRate=S.D/S.n;
 return S;
}
function verdict1(S){const [a,b]=S.ci;if(b<.5)return '1d 後手有利';if(a>.5)return S.p>.55?'1a 実在の先手有利':'1b 小さい先手有利';return '1c 先手有利は検出されない';}
function verdict4(S,B){
 const [a,b]=S.ci;let v;
 if(b<.5)v='4c 効きすぎ（後手有利に逆転）';else if(a>.5)v='4b 足りない';else v=S.p>=.45&&S.p<=.55?'4a 釣り合う（効く）':'4a 外（区間は50%を含むが p が45〜55%の外）';
 const fx=[];
 const dd=100*(S.drawRate-B.drawRate);if(Math.abs(dd)>=5)fx.push('引分率 '+(dd>0?'+':'')+dd.toFixed(1)+'pt');
 const dl=S.mean.all/B.mean.all-1;if(Math.abs(dl)>=.2)fx.push('平均手数 '+(dl>0?'+':'')+(100*dl).toFixed(0)+'%');
 const dor=100*(S.originShare-B.originShare);if(Math.abs(dor)>=10)fx.push('原点制圧の割合 '+(dor>0?'+':'')+dor.toFixed(1)+'pt');
 return {v,fx};
}
function whyText(o,n){const ks=['origin','mate','stale','limit'];return ks.filter(k=>o[k]).map(k=>({origin:'原点制圧',mate:'詰み',stale:'手なし',limit:'120手'}[k])+' '+o[k]+'（'+pct(o[k]/n)+'）').join('・')||'—';}

function report(R){
 const L=[],P=s=>L.push(s);
 const S={};for(const k in R.exp)S[k]=summarize(R.exp[k].games);
 P('# ORIGO 先手の有利とハンデの測定（sim/balance.js）');
 P('');P('計算: '+R.env+'。並列 '+R.workers+'、経過 '+(R.wallMs/1000).toFixed(0)+' 秒、CPU 合計 '+(R.cpuMs/1000).toFixed(0)+' 秒');
 P('');P('## 1. 先手の有利（同じ強さ同士）');
 P('');P('| 深さ | 局数 | 先手勝 | 後手勝 | 引分 | 先手勝率（引分除く） | 判定 |');P('|---|---|---|---|---|---|---|');
 for(const d of [2,3,4]){const s=S['base-d'+d];P('| '+d+' | '+s.n+'（引分除く '+s.dec+'） | '+s.F+' | '+s.S+' | '+s.D+' | '+ci(s.F,s.dec)+' | '+verdict1(s)+' |');}
 {const a=S['base-d3'],b=S['base-d4'],d=b.p-a.p,se=Math.sqrt(a.p*(1-a.p)/a.dec+b.p*(1-b.p)/b.dec);
  P('');P('深さ4 − 深さ3 の先手勝率の差: '+(100*d).toFixed(1)+'pt（95%CI '+(100*(d-1.96*se)).toFixed(1)+'〜'+(100*(d+1.96*se)).toFixed(1)+'pt）');
  const v4=verdict1(b),v23=[verdict1(S['base-d2']),verdict1(a)];
  const j=/^1[ab]/.test(v4)?'2a 深さを上げても残る ＝ 本物の先手有利（測った深さの範囲で）':v23.some(v=>/^1[ab]/.test(v))?'2b 深さで消える ＝ 評価（浅い読み）の癖の寄与が大きい':'2c 先手有利は測定にかからない';
  P('');P('基準2の判定: **'+j+'**');}
 P('');P('### 勝ち方の内訳と平均手数（先手勝ち・後手勝ちに分けて）');
 P('');P('| 深さ | 先手勝ちの内訳 | 先手勝ちの平均手数 | 後手勝ちの内訳 | 後手勝ちの平均手数 | 引分の平均手数 | 全体の平均手数 |');P('|---|---|---|---|---|---|---|');
 for(const d of [2,3,4]){const s=S['base-d'+d];P('| '+d+' | '+whyText(s.why.F,s.F)+' | '+s.mean.F.toFixed(1)+' | '+whyText(s.why.S,s.S)+' | '+s.mean.S.toFixed(1)+' | '+(s.D?s.mean.D.toFixed(1):'—')+' | '+s.mean.all.toFixed(1)+' |');}
 P('');P('## 2. 強さのものさし（先後は 1 局ごとに交互）');
 P('');P('| 対戦 | 局数 | 深い側の勝 | 浅い側の勝 | 引分 | 深い側の勝率（引分除く） | Elo 換算（95%CI） | 深い側が先手のとき | 深い側が後手のとき |');P('|---|---|---|---|---|---|---|---|---|');
 for(const k of ['scale-2v3','scale-3v4']){
  const g=R.exp[k].games;let W=0,Lo=0,D=0;const by={1:[0,0],0:[0,0]};
  for(const [w,r,ply,df] of g){const deepSide=df?1:-1;if(!w)D++;else if(w===deepSide){W++;by[df][0]++;}else{Lo++;by[df][1]++;}}
  const [a,b]=wilson(W,W+Lo),e=x=>Math.round(elo(x));
  P('| '+EXP[k].d.join('対')+' | '+g.length+'（引分除く '+(W+Lo)+'） | '+W+' | '+Lo+' | '+D+' | '+ci(W,W+Lo)+' | '+e(W/(W+Lo))+'（'+e(a)+'〜'+e(b)+'） | '+ci(by[1][0],by[1][0]+by[1][1])+' / '+(by[1][0]+by[1][1])+'局 | '+ci(by[0][0],by[0][0]+by[0][1])+' / '+(by[0][0]+by[0][1])+'局 |');
 }
 {const s=S['base-d3'];P('');P('参考: 深さ3同士の先手の有利を Elo に直すと '+Math.round(elo(s.p))+'（95%CI '+Math.round(elo(s.ci[0]))+'〜'+Math.round(elo(s.ci[1]))+'）');}
 P('');P('## 3. ハンデ候補（深さ3同士。比べる基準は素の深さ3・1000局）');
 const B=S['base-d3'];
 P('');P('| 候補 | 局数 | 先手勝 | 後手勝 | 引分 | 先手勝率（引分除く） | 素からの動き | 判定 | 副作用（基準4） |');P('|---|---|---|---|---|---|---|---|---|');
 P('| 素の対局（基準） | '+B.n+'（引分除く '+B.dec+'） | '+B.F+' | '+B.S+' | '+B.D+' | '+ci(B.F,B.dec)+' | — | '+verdict1(B)+' | — |');
 for(const k of Object.keys(EXP).filter(k=>k.startsWith('h-'))){const s=S[k],v=verdict4(s,B);
  P('| '+EXP[k].label.replace('ハンデ ','')+' | '+s.n+'（引分除く '+s.dec+'） | '+s.F+' | '+s.S+' | '+s.D+' | '+ci(s.F,s.dec)+' | '+((100*(s.p-B.p))>0?'+':'')+(100*(s.p-B.p)).toFixed(1)+'pt | '+v.v+' | '+(v.fx.join('・')||'なし')+' |');}
 P('');P('### ハンデ候補の副作用の中身');
 P('');P('| 候補 | 引分率 | 全体の平均手数 | 原点制圧の割合（勝ち局のうち） | 先手勝ちの内訳 | 後手勝ちの内訳 |');P('|---|---|---|---|---|---|');
 for(const k of ['base-d3'].concat(Object.keys(EXP).filter(k=>k.startsWith('h-')))){const s=S[k];
  P('| '+(k==='base-d3'?'素の対局（基準）':EXP[k].label.replace('ハンデ ',''))+' | '+ci(s.D,s.n)+' | '+s.mean.all.toFixed(1)+'（先手勝ち '+s.mean.F.toFixed(1)+' / 後手勝ち '+s.mean.S.toFixed(1)+'） | '+pct(s.originShare)+' | '+whyText(s.why.F,s.F)+' | '+whyText(s.why.S,s.S)+' |');}
 P('');P('## 計算時間');P('');P('| 実験 | 局数 | CPU 時間 | 1 局あたり |');P('|---|---|---|---|');
 for(const k in R.exp){const e=R.exp[k];P('| '+k+' | '+e.games.length+' | '+(e.cpuMs/1000).toFixed(0)+' 秒 | '+(e.cpuMs/e.games.length).toFixed(0)+' ms |');}
 return L.join('\n');
}

// ---- 並列実行
function all(){
 const {fork}=require('child_process'),os=require('os');
 const W=Math.max(1,Math.min(4,os.cpus().length)),CH=50,jobs=[];
 for(const k in EXP)for(let f=0;f<EXP[k].n;f+=CH)jobs.push([k,f,Math.min(CH,EXP[k].n-f)]);
 jobs.sort((a,b)=>(b[0].includes('d4')||b[0].includes('3v4'))-(a[0].includes('d4')||a[0].includes('3v4')));  // 重い区間を先に
 const R={exp:{},workers:W,env:'Node '+process.version+'・'+os.cpus()[0].model.trim()+' ×'+os.cpus().length};
 for(const k in EXP)R.exp[k]={games:[],cpuMs:0,parts:[]};
 const t0=Date.now();let next=0,live=0;
 return new Promise(done=>{
  const go=()=>{
   if(next>=jobs.length){if(!live)done();return;}
   const j=jobs[next++];live++;
   const c=fork(__filename,['run'].concat(j.map(String)),{silent:true});let buf='';
   c.stdout.on('data',d=>buf+=d);
   c.on('exit',code=>{
    if(code){console.error('part failed',j);process.exit(1);}
    const r=JSON.parse(buf);R.exp[r.name].parts.push(r);R.exp[r.name].cpuMs+=r.cpuMs;live--;
    process.stderr.write('.'+(next%40?'':' '+next+'/'+jobs.length+' '+((Date.now()-t0)/1000|0)+'s\n'));go();
   });
  };
  for(let i=0;i<W;i++)go();
 }).then(()=>{
  for(const k in R.exp){const e=R.exp[k];e.parts.sort((a,b)=>a.from-b.from);e.games=[].concat(...e.parts.map(p=>p.games));delete e.parts;}
  R.wallMs=Date.now()-t0;R.cpuMs=Object.values(R.exp).reduce((a,e)=>a+e.cpuMs,0);
  return R;
 });
}

const cmd=process.argv[2]||'all';
if(cmd==='run'){process.stdout.write(JSON.stringify(runPart(process.argv[3],+process.argv[4],+process.argv[5])));}
else if(cmd==='report'){console.log(report(JSON.parse(fs.readFileSync(path.join(__dirname,'balance-result.json'),'utf8'))));}
else if(cmd==='all'){all().then(R=>{
 fs.writeFileSync(path.join(__dirname,'balance-result.json'),JSON.stringify(R));
 const t=report(R);fs.writeFileSync(path.join(__dirname,'balance-result.txt'),t+'\n');console.log(t);
});}
module.exports={EXP,SETUPS,origin2Engine,runPart,wilson,summarize};
