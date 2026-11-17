// チュートリアル脚本の検証。index.html から エンジン と 脚本(TUT) をそのまま取り出し、1 手ずつ確かめる。
//   node sim/tutorial-check.js
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
const TUT=new Function(html.split('/*TUT-BEGIN*/')[1].split('/*TUT-END*/')[0]+';return TUT;')();
const NN=49,O=E.O,fr=m=>(m/NN)|0,to=m=>m%NN,at=(x,y)=>E.idx(x,y);
const T={K:E.K,R:E.ROT,M:E.MIR,S:E.SCA,P:E.SPI},NAME={1:'POLUS',2:'ROTA',3:'IMAGO',4:'MAGNA',5:'SPIRA'};
const zf=p=>{const x=E.X[p],y=E.Y[p];if(!x&&!y)return '0';let s='';if(x)s+=(x<0?'−':'')+Math.abs(x);if(y)s+=(y<0?'−':(x?'+':''))+(Math.abs(y)===1?'':Math.abs(y))+'i';return s;};
let ok=true;const fail=m=>{ok=false;console.log('  NG: '+m);};
const b=new Array(NN).fill(0);for(const [t,x,y,side] of TUT.setup)b[at(x,y)]=T[t]*side;
let s={b,turn:1,first:1,ply:0,seed:1,rep:{},result:null,last:null,log:[]};s.rep[E.key(b,1)]=1;
const dests=(s,p)=>E.legal(s.b,1,s.rep).filter(m=>fr(m)===p).map(to);
const threatened=s=>{const buf=new Int32Array(512),n=E.gen(s.b,-1,buf),t=new Set();for(let i=0;i<n;i++)t.add(buf[i]%NN);return [...Array(NN).keys()].filter(p=>s.b[p]>0&&t.has(p));};
console.log('開始配置:',TUT.setup.map(([t,x,y,sd])=>(sd>0?'金':'銀')+NAME[T[t]]+' '+zf(at(x,y))).join(' / '));
let old=null,lastStep=0;
TUT.beats.forEach((bt,i)=>{
 if(bt.st!==lastStep){console.log('STEP '+bt.st+' '+TUT.steps[bt.st-1]);lastStep=bt.st;}
 if(bt.t==='note')return;
 if(bt.t==='look'){const p=at(bt.f[0],bt.f[1]);const d=dests(s,p);
  if(s.b[p]<=0)fail('look の駒がない');
  if(!bt.cmp){old=d;console.log('  見る   '+NAME[s.b[p]]+' '+zf(p)+' の行き先: '+d.map(zf).join(', '));}
  else{const gone=old.filter(q=>d.indexOf(q)<0),fresh=d.filter(q=>old.indexOf(q)<0);
   console.log('  見る   '+NAME[s.b[p]]+' '+zf(p)+' の行き先: '+d.map(zf).join(', ')+'　→ 消えた: '+(gone.map(zf).join(', ')||'なし')+'　生まれた: '+(fresh.map(zf).join(', ')||'なし'));
   if(!gone.length||!fresh.length)fail('第 5 ステップで行き先が変わっていない');
   const nx=TUT.beats[i+1];if(!nx||fresh.indexOf(at(nx.to[0],nx.to[1]))<0)fail('次の手が「新しく生まれた行き先」ではない');}
  return;}
 const [f,t]=bt.t==='move'?[at(bt.f[0],bt.f[1]),at(bt.to[0],bt.to[1])]:[at(bt.m[0],bt.m[1]),at(bt.m[2],bt.m[3])];
 const who=bt.t==='move'?'あなた':'相手  ';const side=bt.t==='move'?1:-1;
 if(s.turn!==side)fail('手番が合わない');
 const ex=E.explain(s.b,f,t)[0],mover=Math.abs(s.b[f]),cap=s.b[t];
 if(bt.t==='cpu'&&TUT.beats[i+1]&&TUT.beats[i+1].t==='look'&&TUT.beats[i+1].cmp===1){ /* 中心を動かした後の相手の手で ROTA の行き先が変わらないこと */ }
 const n=E.apply(s,{from:f,to:t});
 if(!n){fail('非合法手 '+zf(f)+'→'+zf(t));return;}
 console.log('  '+who+' '+NAME[mover].padEnd(5)+' '+zf(f)+' → '+zf(t)+(cap?'（'+NAME[Math.abs(cap)]+'を取る）':'')+(ex&&ex.c>=0?'　中心 '+zf(ex.c)+'・'+ex.tf.id:'')+(n.result?'　→ 終局 '+JSON.stringify(n.result):''));
 if(n.result&&i!==TUT.beats.length-1)fail('途中で終局した');
 if(bt.t==='move'&&E.inCheck(n.b,-1))fail('あなたの手が王手になっている');
 if(bt.t==='cpu'&&!n.result&&E.inCheck(n.b,1))fail('相手の手が王手になっている');
 if(bt.t==='cpu'&&cap)fail('相手が駒を取っている');
 if(bt.t==='move'&&threatened(n).length)console.log('    （注）狙われている自駒: '+threatened(n).map(zf).join(', '));
 // 第 5 ステップ: 中心の移動と相手の応手のあいだで ROTA の行き先が保たれること
 if(bt.st===5&&bt.t==='cpu'&&TUT.beats[i+1].t==='look'){const p=at(TUT.beats[i+1].f[0],TUT.beats[i+1].f[1]);
  if(dests(s,p).sort().join()!==dests(n,p).sort().join())fail('相手の応手で ROTA の行き先が変わっている（中心の移動の効果と混ざる）');}
 // 最後: 原点の POLUS を狙える応手が相手に一つもないこと
 if(i===TUT.beats.length-1){const reps=E.legal(s.b,-1,s.rep);const stop=reps.filter(m=>{const k=E.apply(s,{from:fr(m),to:to(m)});return !(k&&k.result&&k.result.winner===1);});
  console.log('  相手の応手 '+reps.length+' 通りのうち、原点制圧を止められる手: '+stop.length);if(stop.length)fail('止められる応手がある');}
 s=n;
});
if(!s.result||s.result.winner!==1||s.result.reason!=='origin')fail('最後が原点制圧の勝ちになっていない');
console.log(ok?'\n脚本の検証: OK（全 '+TUT.beats.filter(b=>b.t!=='note'&&b.t!=='look').length+' 手）':'\n脚本の検証: NG');
process.exit(ok?0:1);
