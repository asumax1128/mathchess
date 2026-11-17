// 詰めORIGO の探索（強制勝ちの判定）。index.html のエンジンをそのまま使う。
//  - 「あと n 手」= 自分の手の回数。原点制圧は「原点に入り、相手の応手をしのいだ」時点で成立。
//  - allow: 勝ちとして数える決着理由（'mate' 詰み / 'origin' 原点制圧 / 'stale' 手なし）
const fs=require('fs'),path=require('path');
function loadEngine(){
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 return new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
}
// ---- 速い探索（採掘用）。盤を直接動かして戻す。apply と同じ判定順。
function fast(E){
 const NN=E.NN,O=E.O,K=E.K;
 const fr=m=>(m/NN)|0,to=m=>m%NN;
 function after(b,M,rep){            // M が指した直後の判定（apply と同じ順）
  const k=E.key(b,-M);rep[k]=(rep[k]||0)+1;
  if(b[O]===-M*K&&!E.attacked(b,O,M))return {k,w:-M,why:'origin'};
  const ms=E.legal(b,-M,rep);
  if(!ms.length)return {k,w:M,why:E.inCheck(b,-M)?'mate':'stale'};
  return {k,ms};
 }
 const undoRep=(rep,k)=>{if(--rep[k]===0)delete rep[k];};
 let memo=new Map();
 // S の番。n 手以内に allow の勝ちを強制できるか
 function or(b,S,n,rep,allow,ms){
  const mk=E.key(b,S)+n;if(memo.has(mk))return memo.get(mk);
  ms=ms||E.legal(b,S,rep);let ok=false;
  for(const m of ms){if(tryMove(b,S,n,rep,allow,m)){ok=true;break;}}
  memo.set(mk,ok);return ok;
 }
 function tryMove(b,S,n,rep,allow,m){
  const f=fr(m),t=to(m),cap=b[t];b[t]=b[f];b[f]=0;
  const r=after(b,S,rep);let ok;
  if(r.w!==undefined)ok=r.w===S&&allow[r.why];
  else ok=and(b,S,n,rep,allow,r.ms);
  undoRep(rep,r.k);b[f]=b[t];b[t]=cap;return ok;
 }
 function and(b,S,n,rep,allow,replies){
  const rs=replies.slice().sort((x,y)=>(b[to(y)]!==0)-(b[to(x)]!==0));   // 駒を取る応手から
  for(const m of rs){
   const f=fr(m),t=to(m),cap=b[t];b[t]=b[f];b[f]=0;
   const r=after(b,-S,rep);let ok;
   if(r.w!==undefined)ok=r.w===S&&allow[r.why];
   else ok=n>1&&or(b,S,n-1,rep,allow,r.ms);
   undoRep(rep,r.k);b[f]=b[t];b[t]=cap;
   if(!ok)return false;
  }
  return true;
 }
 return {
  reset(){memo=new Map();},
  // 局面 b（S の番）で、n 手以内に勝てる初手の一覧（limit 個で打ち切り）
  winningFirstMoves(b,S,n,allow,limit){
   memo=new Map();const rep={};rep[E.key(b,S)]=1;const out=[];
   for(const m of E.legal(b,S,rep)){if(tryMove(b.slice?b:b,S,n,rep,allow,m)){out.push(m);if(limit&&out.length>=limit)break;}}
   return out;
  },
  canWin(b,S,n,allow){memo=new Map();const rep={};rep[E.key(b,S)]=1;return or(b,S,n,rep,allow);}
 };
}
// ---- 厳密な探索（検証用）。エンジンの apply だけを使う。記憶なし。
function exact(E){
 const NN=E.NN,fr=m=>(m/NN)|0,to=m=>m%NN;
 const okRes=(res,S,allow)=>res.winner===S&&allow[res.reason];
 // 記憶は「盤・手番・残り手数・同一局面の出現回数」すべてを鍵にするので、厳密さは変わらない
 let memo=new Map();
 function or(s,S,n,allow){
  const k=E.key(s.b,s.turn)+'|'+n+'|'+JSON.stringify(s.rep);
  if(memo.has(k))return memo.get(k);
  let ok=false;
  for(const m of E.legal(s.b,s.turn,s.rep))if(move(s,S,n,allow,m)){ok=true;break;}
  memo.set(k,ok);return ok;
 }
 function move(s,S,n,allow,m){
  const a=E.apply(s,{from:fr(m),to:to(m)});
  if(a.result)return okRes(a.result,S,allow);
  for(const r of E.legal(a.b,a.turn,a.rep)){
   const c=E.apply(a,{from:fr(r),to:to(r)});
   if(c.result){if(!okRes(c.result,S,allow))return false;continue;}
   if(n<=1||!or(c,S,n-1,allow))return false;
  }
  return true;
 }
 return {
  state(b){const s={b:b.slice(),turn:1,first:1,ply:0,seed:1,rep:{},result:null,last:null,log:[]};s.rep[E.key(s.b,1)]=1;return s;},
  winningFirstMoves(s,n,allow){memo=new Map();return E.legal(s.b,s.turn,s.rep).filter(m=>move(s,s.turn,n,allow,m));},
  canWin(s,n,allow){memo=new Map();return n>0&&or(s,s.turn,n,allow);}
 };
}
const ANY={mate:1,origin:1,stale:1},MATE={mate:1},ORIGIN={origin:1};
module.exports={loadEngine,fast,exact,ANY,MATE,ORIGIN};
