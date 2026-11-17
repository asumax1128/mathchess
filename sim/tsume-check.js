// 詰めORIGO の全問を、エンジン（apply / legal）だけを使う厳密な探索で再検証する。
//   node sim/tsume-check.js
// 各問題について次を確かめる:
//   条件1  あと n 手以内に、相手のどの応手に対しても、その種類（詰み／原点制圧）の勝ちが強制される
//   条件2  勝ちに届く初手（決着の種類を問わない）が、ちょうど 1 つで、記載の初手と一致する
//   補足   n−1 手以内では勝てない（手数の表示が正しい）／開始局面で王手を受けていない／両者の POLUS がある
const fs=require('fs'),path=require('path');
const L=require('./tsume-lib.js');const E=L.loadEngine();const X=L.exact(E);
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const TSUME=new Function(html.split('/*TSUME-BEGIN*/')[1].split('/*TSUME-END*/')[0]+';return TSUME;')();
const T={K:E.K,R:E.ROT,M:E.MIR,S:E.SCA,P:E.SPI},NM={1:'POLUS',2:'ROTA',3:'IMAGO',4:'MAGNA',5:'SPIRA'};
const zf=p=>{const x=E.X[p],y=E.Y[p];if(!x&&!y)return '0';let s='';if(x)s+=(x<0?'−':'')+Math.abs(x);if(y)s+=(y<0?'−':(x?'+':''))+(Math.abs(y)===1?'':Math.abs(y))+'i';return s;};
let bad=0;const t0=Date.now();
if(TSUME.length!==24){console.log('NG: 問題数が 24 ではない（'+TSUME.length+'）');bad++;}
for(const q of TSUME){
 const b=new Array(E.NN).fill(0);
 for(let i=0;i<E.NN;i++){const c=q.b[i];if(c!=='.')b[i]=(c===c.toUpperCase()?1:-1)*T[c.toUpperCase()];}
 const s=X.state(b),allow=q.type==='mate'?L.MATE:L.ORIGIN,ng=[];
 const f=E.idx(q.first[0],q.first[1]),t=E.idx(q.first[2],q.first[3]);
 if(E.kingPos(b,1)<0||E.kingPos(b,-1)<0)ng.push('POLUS がない');
 if(E.inCheck(b,1))ng.push('開始局面で王手を受けている');
 const c1=X.canWin(s,q.n,allow);if(!c1)ng.push('条件1: '+q.n+' 手以内の強制勝ちがない');
 const firsts=X.winningFirstMoves(s,q.n,L.ANY);
 if(firsts.length!==1)ng.push('条件2: 勝てる初手が '+firsts.length+' 個（'+firsts.map(m=>zf((m/49)|0)+'→'+zf(m%49)).join(', ')+'）');
 else if(firsts[0]!==f*49+t)ng.push('条件2: 記載の初手と違う');
 const typeFirst=X.winningFirstMoves(s,q.n,allow);
 if(typeFirst.length!==1||typeFirst[0]!==f*49+t)ng.push('条件1: 記載の初手で'+(q.type==='mate'?'詰み':'原点制圧')+'が強制されない');
 if(q.n>1&&X.canWin(s,q.n-1,L.ANY))ng.push('手数: '+(q.n-1)+' 手以内で勝てる');
 if(ng.length)bad++;
 console.log(String(q.id).padStart(2)+'  あと'+q.n+'手  '+(q.type==='mate'?'詰み    ':'原点制圧')+'  初手 '+NM[Math.abs(b[f])]+' '+zf(f)+' → '+zf(t)+'   '+(ng.length?'NG  '+ng.join(' / '):'OK'));
}
console.log('\n'+(bad?'NG '+bad+' 問':'全 '+TSUME.length+' 問 OK')+'（'+((Date.now()-t0)/1000).toFixed(1)+' 秒）');
process.exit(bad?1:0);
