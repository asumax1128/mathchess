// 詰めの自作（TSLIB ブロック）の検証。index.html のエンジンと TSLIB ブロックをそのまま取り出して確かめる。
//   node sim/tsume-maker-check.js          … 全部（公式 24 問の検証と答え・コード・不合格の理由・時間）
//   node sim/tsume-maker-check.js quick    … 答えの照合を省く
// 確かめること
//   1. TSLIB の exact は sim/tsume-lib.js の exact と同じ文（足した返す口 first・reset の 2 行を除いて一致）
//   2. 公式 24 問を TSLIB の verify にかけると全問合格し、初手が問題データと一致する（同じ品質条件で検証している）
//   3. 公式 24 問の答えを TSLIB の answer で作ると、埋め込み済みの答え TSUME_ANS と完全に一致する（同じ規則で作っている）
//   4. 不合格の理由: 勝ちきれない／初手が複数（数）／もっと短い手数（正しい手数）／勝ち方が違う／形の条件
//   5. コード ORIGOT1.: 往復で一致、棋譜コード・別の文字列・欠けたコード・書き換えたコードを断る
//   6. 検証の所要時間（あと 1・2・3 手の問題ごと）
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const blk=n=>html.split('/*'+n+'-BEGIN*/')[1].split('/*'+n+'-END*/')[0];
const E=new Function(blk('ENGINE')+';return Engine;')();
const TL=new Function('Engine',blk('TSLIB')+';return TsLib;')(E);
const TSUME=new Function(blk('TSUME')+';return TSUME;')(),ANS=new Function(blk('TSUMEANS')+';return TSUME_ANS;')();
const quick=process.argv[2]==='quick';
let bad=0;const ok=(name,c,d)=>{if(!c)bad++;console.log((c?'  OK  ':'  NG  ')+name+(d!==undefined?'  '+JSON.stringify(d):''));};
const run=g=>{let r;for(;;){r=g.next();if(r.done)return r.value;}};

// 1. exact の文
{const lib=fs.readFileSync(path.join(__dirname,'tsume-lib.js'),'utf8');const a=lib.indexOf('function exact(E){'),b=lib.indexOf('const ANY=',a);
 const want=lib.slice(a,b).trim();const t=blk('TSLIB'),c=t.indexOf('function exact(E){'),d=t.indexOf('const X=exact(E)',c);
 const got=t.slice(c,d).trim().split('\n').filter(l=>!l.includes('// 追加')).join('\n').replace("canWin(s,n,allow){memo=new Map();return n>0&&or(s,s.turn,n,allow);},","canWin(s,n,allow){memo=new Map();return n>0&&or(s,s.turn,n,allow);}");
 ok('1. TSLIB の exact は sim/tsume-lib.js の exact と同じ文（返す口 first・reset を除く）',got===want);}

// 2・6. 公式 24 問の検証と時間
const times={1:[],2:[],3:[]};
for(const q of TSUME){
 const b=TL.parse(q.b),t0=Date.now(),r=run(TL.verify(b,q.n,q.type)),ms=Date.now()-t0;times[q.n].push(ms);
 ok('2. 公式 第'+q.id+'問（あと'+q.n+'手・'+q.type+'）が合格し、初手が一致（'+(ms/1000).toFixed(1)+' 秒）',r.ok&&JSON.stringify(r.first)===JSON.stringify(q.first),r.ok?undefined:r);
}
for(const n of [1,2,3]){const a=times[n];console.log('  検証の時間 あと'+n+'手: 平均 '+(a.reduce((x,y)=>x+y,0)/a.length/1000).toFixed(2)+' 秒、最長 '+(Math.max(...a)/1000).toFixed(2)+' 秒（'+a.length+' 問）');}

// 3. 答え
if(!quick){const ta={1:[],2:[],3:[]};
 for(const q of TSUME){const t0=Date.now(),g=run(TL.answer(TL.parse(q.b),q.n,q.type));ta[q.n].push(Date.now()-t0);const a=ANS.find(x=>x.id===q.id);
  ok('3. 公式 第'+q.id+'問の答えが TSUME_ANS と一致',g&&JSON.stringify(g.line)===JSON.stringify(a.line)&&JSON.stringify(g.alt)===JSON.stringify(a.alt)&&g.end===a.end);}
 for(const n of [1,2,3]){const a=ta[n];console.log('  答えを作る時間 あと'+n+'手: 平均 '+(a.reduce((x,y)=>x+y,0)/a.length/1000).toFixed(2)+' 秒、最長 '+(Math.max(...a)/1000).toFixed(2)+' 秒');}}

// 4. 不合格の理由
{const q=TSUME[16];   // 第17問（あと3手・原点制圧）
 let r=run(TL.verify(TL.parse(q.b),2,q.type));ok('4. 3 手の問題を「あと 2 手」で → 勝ちきれない',!r.ok&&r.reason==='nowin',r);
 const q1=TSUME[0];r=run(TL.verify(TL.parse(q1.b),2,q1.type));ok('4. 1 手の問題を「あと 2 手」で → もっと短い手数（1 手）',!r.ok&&r.reason==='short'&&r.min===1,r);
 r=run(TL.verify(TL.parse(q1.b),1,'mate'));ok('4. 原点制圧の 1 手の問題を「詰み」で → 勝ち方が違う（原点制圧なら勝てる）',!r.ok&&r.reason==='type'&&r.other==='origin',r);
 // 初手が複数: 相手 POLUS だけの局面に、解く側の駒を多く置く（どれでも詰む・原点に入れる形）
 const b=TL.parse('.....k.....K.........S..P..s.................P...');   // 探索で見つけた、1 手で勝てる初手が 10 個ある局面
 r=run(TL.verify(b,1,'mate'));ok('4. 初手が複数の局面 → 初手が複数（候補の数）',!r.ok&&r.reason==='multi'&&r.count>1&&r.firsts.length===r.count,{reason:r.reason,count:r.count});
 const b2=new Array(49).fill(0);b2[E.idx(0,-3)]=E.K;b2[E.idx(0,3)]=-E.K;
 r=run(TL.verify(b2,1,'mate'));ok('4. POLUS 2 つだけ（勝てない）→ 勝ちきれない',!r.ok&&r.reason==='nowin',r);
 const b3=b2.slice();b3[E.idx(1,3)]=-E.K;ok('4. 相手の POLUS が 2 つ → 形の条件',TL.shape(b3).some(e=>e.k==='king'&&e.side===-1&&e.n===2));
 const b4=b2.slice();b4[E.idx(0,-3)]=0;ok('4. 解く側の POLUS がない → 形の条件',TL.shape(b4).some(e=>e.k==='king'&&e.side===1&&e.n===0));
 const b5=b2.slice();b5[E.idx(0,-2)]=-E.ROT;b5[E.idx(1,-2)]=-E.MIR;ok('4. 解く側の POLUS が最初から狙われている → 形の条件',TL.shape(b5).some(e=>e.k==='check'),TL.shape(b5));}

// 5. コード
{const q=TSUME[22],p={n:q.n,type:q.type,b:q.b,name:'月夜の原点',author:'あおい'};
 const c=TL.encode(p),d=TL.decode(c);
 ok('5. コードの往復で一致（1 行・接頭辞 ORIGOT1.）',d.ok&&d.p.b===p.b&&d.p.n===p.n&&d.p.type===p.type&&d.p.name===p.name&&d.p.author===p.author&&/^ORIGOT1\.[^\s]+$/.test(c),c);
 ok('5. 名前なしでも往復',TL.decode(TL.encode({n:1,type:'mate',b:TSUME[1].b,name:'',author:''})).ok);
 ok('5. 絵文字や記号の題も往復（12 文字まで）',(()=>{const x=TL.decode(TL.encode({n:2,type:'origin',b:q.b,name:'星★<b>&"🌙月夜の原点の夜の',author:'A.B'}));return x.ok&&x.p.name==='星★<b>&"🌙月夜の原'&&x.p.author==='A.B';})());
 ok('5. 棋譜コード（ORIGO1.）は「棋譜コード」として断る',TL.decode('ORIGO1.a.i.9dLf').why==='kifu');
 ok('5. 別の文字列は断る',TL.decode('hello').why==='other'&&TL.decode('').why==='other');
 ok('5. 末尾が欠けたコードは断る',TL.decode(c.slice(0,-3)).why==='broken');
 const flip=c.replace(/\.(\d)([om])\./,(m,n,t)=>'.'+(n==='3'?'2':'3')+t+'.');ok('5. 書き換えたコード（手数）は検査で断る',TL.decode(flip).why==='broken');
 ok('5. 空白や改行が混ざっても読める',TL.decode(' '+c.slice(0,20)+'\n'+c.slice(20)+' ').ok);
 ok('5. 同じ問題は同じ id（名前は問わない）',TL.idOf(p)===TL.idOf(Object.assign({},p,{name:'別'})));}
console.log('\n'+(bad?'NG '+bad+' 件':'全項目 OK'));
process.exit(bad?1:0);
