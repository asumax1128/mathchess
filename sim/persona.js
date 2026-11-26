// CPU の個性の強さの測定。index.html のエンジンと PERSONA ブロック（個性の定義）をそのまま取り出して使う。
//   node sim/persona.js all            … 全対戦を 4 並列で実行し、sim/persona-result.json と sim/persona-result.txt を書く
//   node sim/persona.js run <対戦> <開始局> <局数>  … 1 区間（並列実行の部品）
//   環境変数 PW='{"1":{"mat":1,...}}' で、段ごとの重みを試しに差し替えられる（調整用。結果ファイルは書かない）
//
// ======================================================================================
// 読み方の基準（測定の前に決めたもの。結果を見てから動かさない）
// ======================================================================================
// 対局の条件: 各段の CPU の設定（読みの深さ・margin・blunder）をそのまま使う。対局をばらけさせるため、序盤 6 手だけは
//   margin を max(段の margin, 40) にする（sim/selfplay.js と同じ考え方）。先後は 1 局ごとに入れ替える。120 手で引分。
// 勝率は「引分を除いた」勝率、95% 信頼区間は Wilson の区間。
// 基準A（強さの条件・必須）: 各段の「個性あり」対「素（既定の重み）」で、個性ありの勝率（引分除く）が 40% 以上 60% 以下。
//   外れたら、その個性の重みを作り直す（作り直した回数と、外れた案の数字も報告する）。
// 基準B（段の順序）: 隣り合う段の個性どうし（段 L+1 の個性 対 段 L の個性）で、上の段の勝率（引分除く）の 95% 信頼区間の
//   下端が 50% を超えること。満たさなければ、順序が崩れたとみなして作り直す。
// ======================================================================================
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
const PERSONA=new Function(html.split('/*PERSONA-BEGIN*/')[1].split('/*PERSONA-END*/')[0]+';return PERSONA;')();
const LV=[{depth:1,margin:70,blunder:.22},{depth:2,margin:25},{depth:3,margin:8},{depth:4,margin:0}];   // index.html の LV と同じ（下で照合）
{const rows=html.match(/const LV=\[([\s\S]*?)\];/)[1].split('\n').filter(x=>x.includes('depth:'));
 LV.forEach((l,i)=>{const want='depth:'+l.depth+',margin:'+l.margin+(l.blunder?',blunder:'+String(l.blunder).replace(/^0/,''):'')+'}';if(!rows[i].includes(want))throw new Error('LV mismatch '+i+' '+rows[i]);});}
if(process.env.PW){const o=JSON.parse(process.env.PW);for(const k in o)PERSONA[k].w=o[k];}
const W0={mat:1,mob:6,kd:6,org:0,grd:0};
// 調整（try）は別の種の対局（100000 番台）で行い、最終の測定（all）は調整に使っていない対局（0 番台）で確かめる
const SEED0=process.env.TUNE?100000:0;
// 対戦: a 側（測る側）と b 側。L{i}: 段 i の個性 対 段 i の素。O{i}: 段 i+1 の個性 対 段 i の個性
const MATCH={};
for(let i=0;i<4;i++)MATCH['L'+i]={a:{lv:i,w:'P'},b:{lv:i,w:'0'},n:400,label:'段'+(i+1)+' '+PERSONA[i].name+' 対 素'};
for(let i=0;i<3;i++)MATCH['O'+i]={a:{lv:i+1,w:'P'},b:{lv:i,w:'P'},n:200,label:PERSONA[i+1].name+'（段'+(i+2)+'）対 '+PERSONA[i].name+'（段'+(i+1)+'）'};
const wOf=x=>x.w==='P'?PERSONA[x.lv].w:null;   // null = 既定の重み（素の CPU）

function runPart(name,from,count){
 const M=MATCH[name],out=[],t0=process.cpuUsage();
 for(let g=from;g<from+count;g++){
  const g2=g+SEED0,rand=E.rng(3000+g2*7919),aFirst=g%2===0;
  let s=E.newGame({seed:g2+1});
  while(!s.result){
   const who=(s.turn>0)===aFirst?M.a:M.b,lv=LV[who.lv];
   const a=E.choose(s,{depth:lv.depth,margin:Math.max(lv.margin,s.ply<6?40:0),blunder:lv.blunder,rand,w:wOf(who)});
   s=E.apply(s,a);
  }
  const w=s.result.winner,aSide=aFirst?1:-1;
  out.push([w===0?0:w===aSide?1:-1,s.result.reason,s.ply,aFirst?1:0]);
 }
 const c=process.cpuUsage(t0);
 return {name,from,count,games:out,cpuMs:Math.round((c.user+c.system)/1000)};
}
function wilson(k,n){if(!n)return [NaN,NaN];const z=1.959963985,p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h];}
const pct=x=>(100*x).toFixed(1)+'%';
function sum(games){const S={n:games.length,W:0,L:0,D:0,len:0};for(const [r,,ply] of games){if(r>0)S.W++;else if(r<0)S.L++;else S.D++;S.len+=ply;}
 S.dec=S.W+S.L;S.p=S.W/S.dec;S.ci=wilson(S.W,S.dec);S.mean=S.len/S.n;return S;}
function report(R){
 const L=[],P=x=>L.push(x),wtxt=w=>Object.entries(w).map(([k,v])=>k+' '+v).join('・');
 P('# CPU の個性の強さ（sim/persona.js）');P('');
 P('計算: '+R.env+'。並列 '+R.workers+'、経過 '+(R.wallMs/1000).toFixed(0)+' 秒、CPU 合計 '+(R.cpuMs/1000).toFixed(0)+' 秒');P('');
 P('## 個性の重み（素は '+wtxt(W0)+'）');P('');P('| 段 | 名前 | 棋風 | 重み |');P('|---|---|---|---|');
 PERSONA.forEach((p,i)=>P('| '+(i+1)+' | '+p.name+' | '+p.style+' | '+wtxt(p.w)+' |'));
 P('');P('## 基準A: 個性あり 対 素（同じ段）');P('');
 P('| 段 | 対戦 | 局数（引分除く） | 個性の勝 | 素の勝 | 引分 | 個性の勝率（引分除く） | 平均手数 | 判定（40〜60%） |');P('|---|---|---|---|---|---|---|---|---|');
 for(let i=0;i<4;i++){const S=sum(R.exp['L'+i].games);P('| '+(i+1)+' | '+MATCH['L'+i].label+' | '+S.n+'（'+S.dec+'） | '+S.W+' | '+S.L+' | '+S.D+' | '+pct(S.p)+'（95%CI '+pct(S.ci[0])+'〜'+pct(S.ci[1])+'） | '+S.mean.toFixed(1)+' | '+(S.p>=.4&&S.p<=.6?'OK':'NG')+' |');}
 P('');P('## 基準B: 段の順序（上の段の個性 対 下の段の個性）');P('');
 P('| 対戦 | 局数（引分除く） | 上の段の勝 | 下の段の勝 | 引分 | 上の段の勝率（引分除く） | 判定（下端 > 50%） |');P('|---|---|---|---|---|---|---|');
 for(let i=0;i<3;i++){const S=sum(R.exp['O'+i].games);P('| '+MATCH['O'+i].label+' | '+S.n+'（'+S.dec+'） | '+S.W+' | '+S.L+' | '+S.D+' | '+pct(S.p)+'（95%CI '+pct(S.ci[0])+'〜'+pct(S.ci[1])+'） | '+(S.ci[0]>.5?'OK':'NG')+' |');}
 P('');P('## 計算時間');P('');P('| 対戦 | 局数 | CPU 時間 |');P('|---|---|---|');
 for(const k in R.exp)P('| '+k+' '+MATCH[k].label+' | '+R.exp[k].games.length+' | '+(R.exp[k].cpuMs/1000).toFixed(0)+' 秒 |');
 return L.join('\n');
}
function all(only){
 const {fork}=require('child_process'),os=require('os'),W=Math.min(4,os.cpus().length),CH=25,jobs=[];
 const keys=Object.keys(MATCH).filter(k=>!only||only.includes(k));
 for(const k of keys)for(let f=0;f<MATCH[k].n;f+=CH)jobs.push([k,f,Math.min(CH,MATCH[k].n-f)]);
 const heavy=k=>k==='L3'||k==='O2';jobs.sort((a,b)=>heavy(b[0])-heavy(a[0]));
 const R={exp:{},workers:W,env:'Node '+process.version+'・'+os.cpus()[0].model.trim()+' ×'+os.cpus().length};
 for(const k of keys)R.exp[k]={games:[],cpuMs:0,parts:[]};
 const t0=Date.now();let next=0,live=0;
 return new Promise(done=>{const go=()=>{if(next>=jobs.length){if(!live)done();return;}
  const j=jobs[next++];live++;const c=fork(__filename,['run'].concat(j.map(String)),{silent:true,env:process.env});let buf='';
  c.stdout.on('data',d=>buf+=d);c.on('exit',code=>{if(code){console.error('part failed',j);process.exit(1);}
   const r=JSON.parse(buf);R.exp[r.name].parts.push(r);R.exp[r.name].cpuMs+=r.cpuMs;live--;go();});};
  for(let i=0;i<W;i++)go();}).then(()=>{
  for(const k in R.exp){const e=R.exp[k];e.parts.sort((a,b)=>a.from-b.from);e.games=[].concat(...e.parts.map(p=>p.games));delete e.parts;}
  R.wallMs=Date.now()-t0;R.cpuMs=Object.values(R.exp).reduce((a,e)=>a+e.cpuMs,0);return R;});
}
const cmd=process.argv[2]||'all';
if(cmd==='run')process.stdout.write(JSON.stringify(runPart(process.argv[3],+process.argv[4],+process.argv[5])));
else if(cmd==='try'){   // 調整用: node sim/persona.js try L1,L2 （結果ファイルは書かない。種は 100000 番台）
 process.env.TUNE='1';
 all(process.argv[3].split(',')).then(R=>{for(const k in R.exp){const S=sum(R.exp[k].games);console.log(k,MATCH[k].label,'勝',S.W,'負',S.L,'分',S.D,pct(S.p),'CI',pct(S.ci[0]),pct(S.ci[1]),'平均手数',S.mean.toFixed(1),'cpu',(R.exp[k].cpuMs/1000|0)+'s');}});}
else if(cmd==='all'&&!process.env.PW)all().then(R=>{fs.writeFileSync(path.join(__dirname,'persona-result.json'),JSON.stringify(R));const t=report(R);fs.writeFileSync(path.join(__dirname,'persona-result.txt'),t+'\n');console.log(t);});
else if(cmd==='all')console.log('PW を付けた試しの重みでは all は使わない（try を使う）');
