// 中心を動かす手のプレビューの判定を、自己対戦の局面で抜き取り確認する。
//   node sim/center-preview-check.js               … 3 手読み同士 30 局 + 2 手読み同士 30 局の全局面・全合法手
//   node sim/center-preview-check.js 3 3 100       … 先手の読み深さ, 後手の読み深さ, 局数
//
// index.html の エンジン と プレビューの判定（Preview.analyze）をそのまま取り出し、
// ここで別に書いた判定（下の judge）と、全局面の全合法手で突き合わせる。
//   judge の条件 1: 動かす駒 f を中心にした変換で、味方の別の駒 A が跳べる合法な行き先があるか。
//                   explain() を使わず、変換表（E.TF）から直接計算する
//   judge の条件 2: 動かす駒を除く味方全員の合法な行き先の点の集まりが、指す前と指したあと（同じ側が続けて指すとして）で違うか
// 誤判定 = 「変わるのに出ない」「変わらないのに出る」。どちらも 0 でなければ NG。印（新しい・消える・変わらない）の中身も突き合わせる。
//
// 対応づけ（プレビューの線）の確認:
//   画面の PvLink.pairs は変換表から「c + w(z − c) → c′ + w(z − c′)」を直接計算する。
//   ここでは別に、指す前の合法手と指したあとの合法手を E.explain() で読み、
//   「中心が動かす駒（指す前は c、指したあとは c′）で、同じ駒・同じ変換 w」の行き先どうしを組にする。
//   プレビューが出る全ての手で、両者の組の集まりが一致することを確かめる（不一致 0 でなければ NG）。
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const E=new Function(html.split('/*ENGINE-BEGIN*/')[1].split('/*ENGINE-END*/')[0]+';return Engine;')();
const PV=new Function('E',html.split('/*PREVIEW-BEGIN*/')[1].split('/*PREVIEW-END*/')[0]+';return Preview;')(E);
const LINK=new Function('E',html.split('/*PVLINK-BEGIN*/')[1].split('/*PVLINK-END*/')[0]+';return PvLink;')(E);
const NN=E.NN,fr=m=>(m/NN)|0,to=m=>m%NN;

function judge(s,f,t){
 const S=s.turn,legal=new Set(E.legal(s.b,S,s.rep));
 // 条件 1（変換表から直接）
 let center=false;
 for(let a=0;a<NN&&!center;a++){
  const v=s.b[a]*S;if(a===f||v<=1)continue;               // 味方の駒で、POLUS（変換で動かない）以外
  for(const tf of E.TF[v]){
   const r=tf.f(E.X[a]-E.X[f],E.Y[a]-E.Y[f]);if(!r)continue;
   const x=E.X[f]+r[0],y=E.Y[f]+r[1];if(!E.inb(x,y))continue;
   if(legal.has(a*NN+E.idx(x,y))){center=true;break;}
  }
 }
 // 条件 2（行き先の点の集まりの比較）
 const n=E.apply(s,{from:f,to:t});
 const before=new Set(),after=new Set();
 for(const m of legal)if(fr(m)!==f)before.add(to(m));
 for(const m of E.legal(n.b,S,n.rep))if(fr(m)!==t)after.add(to(m));
 const fresh=[...after].filter(x=>!before.has(x)).sort((a,b)=>a-b),gone=[...before].filter(x=>!after.has(x)).sort((a,b)=>a-b);
 const same=[...before].filter(x=>after.has(x)).sort((a,b)=>a-b);
 const changed=fresh.length+gone.length>0;
 return {center,changed,show:center&&changed,fresh,gone,same};
}

// 対応づけの別計算（E.explain を使う）
function linksByExplain(s,f,t){
 const S=s.turn,n=E.apply(s,{from:f,to:t}),A=new Map(),out=[];
 for(const m of E.legal(s.b,S,s.rep)){const a=fr(m);if(a===f||Math.abs(s.b[a])===1)continue;
  for(const e of E.explain(s.b,a,to(m)))if(e.c===f)A.set(a+'|'+e.tf.id,to(m));}
 for(const m of E.legal(n.b,S,n.rep)){const a=fr(m);if(a===t||Math.abs(n.b[a])===1)continue;
  for(const e of E.explain(n.b,a,to(m)))if(e.c===t){const k=a+'|'+e.tf.id;if(A.has(k)&&A.get(k)!==to(m))out.push(k+'|'+A.get(k)+'|'+to(m));}}
 return out.sort();
}
function run(d1,d2,G,seed0){
 const r={games:G,positions:0,moves:0,show:0,miss:0,extra:0,markBad:0,linkMoves:0,links:0,linkBad:0,center:0,changed:0,centerOnly:0,changedOnly:0,neither:0};
 for(let g=0;g<G;g++){
  const rand=E.rng(1000+(seed0+g)*7919);let s=E.newGame({seed:seed0+g+1});
  while(!s.result){
   r.positions++;
   for(const m of E.legal(s.b,s.turn,s.rep)){
    const f=fr(m),t=to(m),j=judge(s,f,t),p=PV.analyze(s,f,t);r.moves++;
    if(j.center)r.center++;if(j.changed)r.changed++;
    if(j.center&&!j.changed)r.centerOnly++;if(!j.center&&j.changed)r.changedOnly++;if(!j.center&&!j.changed)r.neither++;
    if(j.show)r.show++;
    if(j.show&&!p){r.miss++;if(r.miss<=3)console.log('  変わるのに出ない: '+E.encode(s)+' '+f+'→'+t);}
    if(!j.show&&p){r.extra++;if(r.extra<=3)console.log('  変わらないのに出る: '+E.encode(s)+' '+f+'→'+t);}
    if(j.show&&p){const k=a=>a.slice().sort((x,y)=>x-y).join();if(k(p.fresh)!==j.fresh.join()||k(p.gone)!==j.gone.join()||k(p.same)!==j.same.join())r.markBad++;}
    if(j.show){const mine=LINK.pairs(s,f,t).map(q=>q.piece+'|'+q.w+'|'+q.from+'|'+q.to).sort(),ref=linksByExplain(s,f,t);
     r.linkMoves++;r.links+=ref.length;if(mine.join()!==ref.join()){r.linkBad++;if(r.linkBad<=3)console.log('  対応の不一致: '+E.encode(s)+' '+f+'→'+t);}}
   }
   s=E.apply(s,E.choose(s,{depth:s.turn>0?d1:d2,margin:s.ply<6?40:0,rand}));
  }
 }
 const pc=x=>(100*x/r.moves).toFixed(1)+'%';
 console.log('\n== 先手 '+d1+' 手読み vs 後手 '+d2+' 手読み / '+G+' 局（種 '+seed0+'〜）==');
 console.log('局面 '+r.positions+' / 合法手 '+r.moves);
 console.log('プレビューが出る手 '+r.show+'（'+pc(r.show)+'）／即確定の手 '+(r.moves-r.show)+'（'+pc(r.moves-r.show)+'）');
 console.log('  内訳: 中心で行き先も変わる '+r.show+'、中心だが行き先は変わらない '+r.centerOnly+'、中心ではないが行き先は変わる '+r.changedOnly+'、どちらでもない '+r.neither);
 console.log('誤判定: 変わるのに出ない '+r.miss+'、変わらないのに出る '+r.extra+'、印の中身の不一致 '+r.markBad);
 console.log('対応づけ: プレビューが出る手 '+r.linkMoves+' 手で、線 '+r.links+' 本を突き合わせ、不一致 '+r.linkBad+' 手');
 return r;
}
const a=process.argv.slice(2).map(Number);
const rs=a.length>=3?[run(a[0],a[1],a[2],0)]:[run(3,3,30,0),run(2,2,30,100)];
const bad=rs.reduce((x,r)=>x+r.miss+r.extra+r.markBad+r.linkBad,0);
const tot=rs.reduce((x,r)=>({p:x.p+r.positions,m:x.m+r.moves,s:x.s+r.show,l:x.l+r.links,lb:x.lb+r.linkBad}),{p:0,m:0,s:0,l:0,lb:0});
console.log('\n合計 局面 '+tot.p+' / 合法手 '+tot.m+' / プレビューが出る手 '+tot.s+'（'+(100*tot.s/tot.m).toFixed(1)+'%）');
console.log('対応づけ: 線 '+tot.l+' 本、不一致 '+tot.lb+' 手');
console.log(bad?'NG: 誤判定・不一致 '+bad+' 件':'プレビューの判定と対応づけ: OK（誤判定 0・不一致 0）');
process.exit(bad?1:0);
