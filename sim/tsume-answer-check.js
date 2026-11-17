// 詰めORIGO の答え（index.html に埋め込んだ勝ち手順）を、エンジンで全問再検証する。
//   node sim/tsume-answer-check.js
// 各問題について、手順どおりに指すと必ず勝てることを確かめる:
//   ・自分の手: そのたびに、相手のどの応手に対しても、残りの手数でその種類（詰み／原点制圧）の勝ちが強制される
//   ・初手: 勝てる手が唯一で、問題データの初手と一致
//   ・相手の応手: 合法で、「自分が勝つまでに要る手数が最大」の手（同じなら先に見つけた手）。勝ちを避けられる応手がない
//   ・最後に自分が勝ち、決着の種類が問題の種類と一致。自分の手の回数が「あと n 手」以内
//   ・問題データ（24 問）に 1 対 1 で対応している
const A=require('./tsume-answer-lib.js');
const h=A.html(),TS=A.loadBlock(h,'TSUME'),ANS=A.loadBlock(h,'TSUMEANS');
const NM={1:'POLUS',2:'ROTA',3:'IMAGO',4:'MAGNA',5:'SPIRA'};
const zf=(x,y)=>{if(!x&&!y)return '0';let s='';if(x)s+=(x<0?'−':'')+Math.abs(x);if(y)s+=(y<0?'−':(x?'+':''))+(Math.abs(y)===1?'':Math.abs(y))+'i';return s;};
let bad=0,steps=0,uniq=0,mine=0;const t0=Date.now();
if(TS.length!==24||ANS.length!==24){bad++;console.log('NG: 問題数／答えの数が 24 ではない',TS.length,ANS.length);}
for(const q of TS){
 const a=ANS.find(x=>x.id===q.id);
 if(!a){bad++;console.log('NG 第'+q.id+'問: 答えがない');continue;}
 const v=A.verify(q,a);
 let s=A.initial(q);const desc=[];
 for(let i=0;i<a.line.length;i++){const f=A.E.idx(a.line[i][0],a.line[i][1]);desc.push((i%2?'相手 ':'')+NM[Math.abs(s.b[f])]+' '+zf(a.line[i][0],a.line[i][1])+'→'+zf(a.line[i][2],a.line[i][3]));
  s=A.E.apply(s,{from:f,to:A.E.idx(a.line[i][2],a.line[i][3])});}
 steps+=a.line.length;uniq+=v.info.uniqueMine;mine+=v.info.mineMoves;
 if(!v.ok)bad++;
 console.log(String(q.id).padStart(2)+'  あと'+q.n+'手  '+(q.type==='mate'?'詰み    ':'原点制圧')+'  '+desc.join(' / ')+'   '+(v.ok?'OK':'NG  '+v.errors.join(' / ')));
}
console.log('\n自分の手 '+mine+' 手のうち、その局面で勝ち手が一つだけの手 '+uniq+' 手（初手の 24 手はすべて唯一）');
console.log((bad?'NG '+bad+' 件':'全 '+TS.length+' 問 OK')+'（'+((Date.now()-t0)/1000).toFixed(1)+' 秒）');
process.exit(bad?1:0);
