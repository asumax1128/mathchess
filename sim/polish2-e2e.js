// 仕上げ 2 点の通し確認（ヘッドレス Chromium）: ふりかえりの形勢グラフ と 長押しプレビューの囁き。
//   node sim/polish2-e2e.js [スクリーンショットの出力先]
// PC 幅 1280px と スマホ幅 360px（タッチ）の両方で確かめる。
const {chromium}=require('playwright');
const out=process.argv[2]||'.';
const URL='file://'+require('path').join(__dirname,'..','index.html');
const results=[];
const ok=(name,cond,detail)=>{results.push({name,ok:!!cond,detail});console.log((cond?'  OK  ':'  NG  ')+name+(detail!==undefined?'  '+JSON.stringify(detail):''));};

(async()=>{
 const br=await chromium.launch();const errs=[];
 for(const [name,vp,opt] of [['desk',{width:1280,height:900},{deviceScaleFactor:1}],['phone',{width:360,height:740},{deviceScaleFactor:2,hasTouch:true,isMobile:true}]]){
  console.log('\n== '+name+' ==');
  const pg=await br.newPage({viewport:vp,...opt});
  pg.on('pageerror',e=>errs.push(name+': '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text());});
  const cdp=name==='phone'?await pg.context().newCDPSession(pg):null;
  await pg.goto(URL);await pg.evaluate(()=>localStorage.clear());await pg.reload();await pg.waitForTimeout(300);
  const tap=async sel=>{await pg.$eval(sel,e=>e.scrollIntoView({block:'center'}));if(name==='phone')await pg.tap(sel);else await pg.click(sel);};
  const tapXY=async(x,y)=>{if(name==='phone')await pg.touchscreen.tap(x,y);else await pg.mouse.click(x,y);};
  const scr=p=>pg.evaluate(p=>{const {E,V}=window.__origo;document.getElementById('boardWrap').scrollIntoView({block:'center'});const b=document.getElementById('board').getBoundingClientRect();return [b.left+(380+V.s*90*E.X[p])/760*b.width,b.top+(380-V.s*90*E.Y[p])/760*b.height];},p);
  const press=async(x,y,ms)=>{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await pg.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await pg.mouse.move(x,y);await pg.mouse.down();await pg.waitForTimeout(ms);await pg.mouse.up();}};
  const A=()=>pg.evaluate(()=>{const {G}=window.__origo;return {ply:G.s.ply,turn:G.s.turn,human:G.human,busy:G.busy,res:G.s.result,sel:G.sel,pv:!!G.pv,p2:!!G.p2,rv:!!G.rv};});
  const waitIdle=async()=>{for(let k=0;k<600;k++){const a=await A();if(!a.busy)return a;await pg.waitForTimeout(50);}return A();};
  const hintOn=()=>pg.$eval('#pvHint',e=>e.classList.contains('show'));
  // 自分の駒のうち、プレビューが効く手を持つ駒（want=false なら、持たない駒）
  const pieceWith=want=>pg.evaluate(want=>{const {G,E,Preview}=window.__origo;const s=G.s;
   for(let p=0;p<49;p++)if(s.b[p]*G.human>0){const ms=E.legal(s.b,s.turn,s.rep).filter(m=>((m/49)|0)===p);if(!ms.length)continue;
    const has=ms.some(m=>Preview.analyze(s,p,m%49));if(has===want)return {p,t:(ms.find(m=>Preview.analyze(s,p,m%49))||ms[0])%49};}return null;},want);
  const tapPt=async p=>{const [x,y]=await scr(p);await tapXY(x,y);await pg.waitForTimeout(120);};

  // ================================================================ 囁き
  await tap('#optLv button[data-v="0"]');await tap('#stGo');await pg.waitForTimeout(400);await waitIdle();
  ok('はじめは囁きは出ていない',!(await hintOn()));
  // プレビューが効く手を探すため、序盤を少し進める（効く手がない駒も試す）
  let pc=await pieceWith(true),pn=await pieceWith(false),guard=0;
  while(!pc&&guard++<10){await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:1,margin:0,rand:E.rng(G.s.ply+3)}));});await waitIdle();pc=await pieceWith(true);pn=await pieceWith(false);}
  ok('プレビューが効く手を持つ駒がある局面になった',!!pc,{pc,pn});
  if(pn){await tapPt(pn.p);ok('効く手のない駒を選んでも、囁きは出ない',!(await hintOn()));await tapPt(pn.p);}
  await tapPt(pc.p);
  const hs=await pg.evaluate(()=>{const e=document.getElementById('pvHint'),b=document.getElementById('boardWrap').getBoundingClientRect(),r=e.getBoundingClientRect(),st=getComputedStyle(e);return {show:e.classList.contains('show'),text:e.textContent,pe:st.pointerEvents,near:r.bottom<=b.bottom&&r.top>b.top+b.height*.85,clear:(()=>{const {G,E,V}=window.__origo,bb=document.getElementById('board').getBoundingClientRect(),k=bb.height/760,R=37*k;let n=0;for(let p=0;p<49;p++)if(G.s.b[p]){const cx=bb.left+(380+V.s*90*E.X[p])*k,cy=bb.top+(380-V.s*90*E.Y[p])*k;if(cy+R>r.top&&cy-R<r.bottom&&cx+R>r.left&&cx-R<r.right)n++;}return n===0;})(),inView:r.left>=0&&r.right<=innerWidth,oneLine:r.height<26,w:Math.round(r.width),h:Math.round(r.height)};});
  ok('効く手のある駒を選ぶと囁きが出る（盤の下端の目盛りの行に 1 行、画面内、文言どおり。駒には重ならない）',hs.show&&hs.text==='行き先を長押しすると、味方の行き先の変化が見られます'&&hs.near&&hs.clear&&hs.inView&&hs.oneLine,hs);
  ok('囁きは操作を妨げない（pointer-events: none）',hs.pe==='none');
  await pg.waitForTimeout(350);await pg.screenshot({path:`${out}/${name}-1hint.png`});
  // 囁きが出ている場所の下の行き先も押せる: 囁きの真下にある点を elementFromPoint で確かめる
  const under=await pg.evaluate(()=>{const r=document.getElementById('pvHint').getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return el?(el.id||el.className||el.tagName):null;});
  ok('囁きは押しても当たらない（下の要素に届く）',under!=='pvHint',under);
  await tapPt(pc.p);ok('駒の選択を外すと囁きは消える',!(await hintOn()));
  await tapPt(pc.p);ok('同じ対局で、もう一度選んでも出ない（1 局 1 回）',!(await hintOn()));
  await tapPt(pc.p);
  // 次の対局（未使用のまま）: また 1 回だけ出る
  await pg.evaluate(()=>{const {store}=window.__origo;});
  await tap('#btNew');await pg.waitForTimeout(150);await tap('#stGo');await pg.waitForTimeout(400);await waitIdle();
  pc=await pieceWith(true);guard=0;
  while(!pc&&guard++<10){await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:1,margin:0,rand:E.rng(G.s.ply+3)}));});await waitIdle();pc=await pieceWith(true);}
  await tapPt(pc.p);ok('新しい対局では、未使用ならまた出る',await hintOn());
  // 長押しでプレビューを使う → 記録され、囁きは消える
  const [tx,ty]=await scr(pc.t);await press(tx,ty,650);await pg.waitForTimeout(200);
  let a=await A();
  ok('長押しでプレビューが開き、囁きは消え、使用が記録される',a.pv&&!(await hintOn())&&await pg.evaluate(()=>localStorage.getItem('origo.pvUsed')==='true'),a);
  await tapXY(5,5);await pg.waitForTimeout(150);
  await tap('#btNew');await pg.waitForTimeout(150);await tap('#stGo');await pg.waitForTimeout(400);await waitIdle();
  pc=await pieceWith(true);guard=0;
  while(!pc&&guard++<10){await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:1,margin:0,rand:E.rng(G.s.ply+3)}));});await waitIdle();pc=await pieceWith(true);}
  await tapPt(pc.p);ok('使ったあとは、新しい対局でも二度と出ない',!(await hintOn()));
  await tapPt(pc.p);
  // チュートリアルと詰めORIGO では出さない（未使用に戻して確かめる）
  await pg.evaluate(()=>localStorage.removeItem('origo.pvUsed'));
  const inMode=await pg.evaluate(()=>{const {G,E,Preview,Tut,Ts,TSUME,select,PVH}=window.__origo;const r={};
   const tryAll=()=>{const s=G.s;for(let p=0;p<49;p++)if(s.b[p]*G.human>0&&E.legal(s.b,s.turn,s.rep).some(m=>((m/49)|0)===p&&Preview.analyze(s,p,m%49))){select(p);return {p,show:document.getElementById('pvHint').classList.contains('show')};}return null;};
   Ts.start(0);let n=0;r.ts=[];for(let i=0;i<TSUME.length;i++){Ts.start(i);PVH.shown=false;const x=tryAll();if(x){n++;r.ts.push(x.show);}}r.tsTried=n;
   Tut.start();PVH.shown=false;r.tut=tryAll();
   return r;});
  ok('詰めORIGO では出さない（効く手のある問題すべてで駒を選んでも出ない）',inMode.tsTried>0&&inMode.ts.every(x=>!x),{tried:inMode.tsTried});
  ok('チュートリアルでは出さない',inMode.tut===null||!inMode.tut.show,inMode.tut);
  await pg.reload();await pg.waitForTimeout(300);

  // ================================================================ ふりかえりの形勢グラフ
  const playOut=async(hd,hm,lv)=>{
   await tap('#optLv button[data-v="'+lv+'"]');await tap('#stGo');await pg.waitForTimeout(400);
   for(let k=0;k<400;k++){a=await waitIdle();if(a.res)break;
    if(a.turn===a.human)await pg.evaluate(([hd,hm])=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:hd,margin:hm,rand:E.rng(G.s.ply*7+1)}));},[hd,hm]);}
   for(let k=0;k<60;k++){if(await pg.$eval('#mdRes',e=>e.classList.contains('show')))break;await pg.waitForTimeout(50);}
   return A();
  };
  const openReview=async()=>{await tap('#resReview');for(let k=0;k<1200;k++){if(await pg.evaluate(()=>window.__origo.G.rv&&window.__origo.G.rv.ready))break;await pg.waitForTimeout(50);}};
  const graphCheck=async(tag)=>{
   const g=await pg.evaluate(()=>{const {G,RVG,Review}=window.__origo;const c=G.rv.c,N=c.v.length-1;
    const X=j=>RVG.L+(RVG.R-RVG.L)*(N?j/N:0),Y=v=>{const m=(RVG.T+RVG.B)/2,h=(RVG.B-RVG.T)/2;return m-Math.max(-1,Math.min(1,v/RVG.CAP))*h;};
    const box=document.getElementById('rvGraphBox'),svg=document.getElementById('rvGraph');
    const key=svg.querySelector('.gKey'),lbl=svg.querySelector('.gKeyLbl');
    // 線の頂点（実線と破線）を集め、c.v から計算した位置と照合する
    const pts=[];for(const el of svg.querySelectorAll('.gLine,.gOver'))for(const m of (el.getAttribute('d')||'').matchAll(/[ML]([\d.]+) ([\d.]+)/g))pts.push([+m[1],+m[2]]);
    let bad=0;for(const [x,y] of pts){const j=Math.round((x-RVG.L)/(RVG.R-RVG.L)*N);if(Math.abs(X(j)-x)>.06||Math.abs(Y(c.v[j])-y)>.06)bad++;}
    const seen=new Set(pts.map(([x])=>Math.round((x-RVG.L)/(RVG.R-RVG.L)*N)));
    const over=c.v.some(v=>Math.abs(v)>RVG.CAP);
    const band=svg.querySelector('.gBand');
    return {shown:!box.hidden&&box.getBoundingClientRect().height>40,N,k:c.k,kind:c.kind,H:c.H,
     keyX:key?+key.getAttribute('x1'):null,wantX:c.k>=0?+X(c.k+1).toFixed(1):null,lbl:lbl?lbl.textContent:null,title:document.getElementById('rvTitle').textContent,
     ptsBad:bad,allJ:seen.size===N+1,over,omit:!!svg.querySelector('.gOmit'),dash:!!svg.querySelector('.gOver'),
     bandTop:band?+(+band.getAttribute('y')).toFixed(1):null,wantTop:+Y(Review.T).toFixed(1),bandH:band?+(+band.getAttribute('height')).toFixed(1):null,wantH:+(Y(-Review.T)-Y(Review.T)).toFixed(1),
     note:document.getElementById('rvGraphNote').textContent,last:c.v[N],brk:svg.querySelectorAll('.gBrk').length,run2:c.v.some((v,j)=>j<N&&Math.abs(v)>RVG.CAP&&Math.abs(c.v[j+1])>RVG.CAP&&Math.sign(v)===Math.sign(c.v[j+1]))};});
   ok(tag+': グラフが出る',g.shown,{N:g.N,k:g.k,kind:g.kind});
   ok(tag+': 線の全頂点が、ふりかえりの系列 c.v そのものの位置（0〜'+g.N+' 手の全点）',g.ptsBad===0&&g.allJ,{bad:g.ptsBad});
   ok(tag+': 決め手の印の位置が手数と一致（'+(g.k+1)+' 手目）',g.k>=0&&Math.abs(g.keyX-g.wantX)<.06&&g.lbl===(g.k+1)+' 手目'&&g.title.includes('（'+(g.k+1)+' 手目）'),{keyX:g.keyX,wantX:g.wantX,lbl:g.lbl,title:g.title});
   ok(tag+': 互角の帯が ±150',g.bandTop===g.wantTop&&g.bandH===g.wantH,{top:g.bandTop,h:g.bandH});
   ok(tag+': 上限を超えた所は、端に止めて波の印と「以降 省略」で示す（2 点以上続けば破線。終局の値 '+g.last+'）',g.over&&g.omit&&g.brk>0&&(g.run2?g.dash:true)&&/省略/.test(g.note),{brk:g.brk,run2:g.run2,dash:g.dash});
   return g;
  };
  const browseCheck=async(tag)=>{
   const info=await pg.evaluate(()=>{const {G}=window.__origo;return {N:G.rv.c.states.length-1,k:G.rv.c.k};});
   const j=Math.max(1,Math.floor(info.N/3));
   const pos=await pg.evaluate(j=>{const {G,RVG}=window.__origo;const N=G.rv.c.states.length-1,el=document.getElementById('rvGraph');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();const x=RVG.L+(RVG.R-RVG.L)*j/N;return [r.left+x/RVG.W*r.width,r.top+r.height/2];},j);
   await tapXY(pos[0],pos[1]);await pg.waitForTimeout(200);
   let b=await pg.evaluate(()=>{const {G}=window.__origo;const g=G.rv;return {view:g.view,ply:G.s.ply,same:G.s===g.c.states[g.view],back:!document.getElementById('rvBack').hidden,msg:document.getElementById('rvMsg').textContent,cur:!!document.querySelector('#rvGraph .gCur'),trail:!!document.querySelector('#board .cons.hot')};});
   ok(tag+': グラフをタップすると、その手の局面が盤に出る（'+j+' 手目のあと）',b.view===j&&b.ply===j&&b.same&&b.cur&&b.back&&/閲覧のみ/.test(b.msg)&&!b.trail,b);
   await pg.screenshot({path:`${out}/${name}-${tag}-browse.png`});
   // 閲覧中に盤の駒を押しても、選択も手も起きない
   const p=await pg.evaluate(()=>{const {G}=window.__origo;for(let p=0;p<49;p++)if(G.s.b[p]*G.human>0)return p;return -1;});
   await tapPt(p);b=await A();ok(tag+': 閲覧中は盤に触れても何も起きない（指し直し不可）',b.sel===-1&&b.ply===j,b);
   // 端の局面: 最後の局面
   const pe=await pg.evaluate(()=>{const {G,RVG}=window.__origo;const el=document.getElementById('rvGraph');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return [r.left+(RVG.R+2)/RVG.W*r.width,r.top+r.height/2];});
   await tapXY(pe[0],pe[1]);await pg.waitForTimeout(150);
   b=await pg.evaluate(()=>{const {G}=window.__origo;const c=G.rv.c;return {view:G.rv.view,N:c.states.length-1,last:G.s===c.states[c.states.length-1]};});
   ok(tag+': 右端をタップすると最後の局面',b.view===b.N&&b.last,b);
   await tap('#rvBack');await pg.waitForTimeout(150);
   b=await pg.evaluate(()=>{const {G}=window.__origo;return {view:G.rv.view,ply:G.s.ply,k:G.rv.c.k,back:!document.getElementById('rvBack').hidden,cur:!!document.querySelector('#rvGraph .gCur'),trail:!!document.querySelector('#board .cons.hot'),title:document.getElementById('rvTitle').textContent};});
   ok(tag+': 「決め手に戻る」で決め手の表示に戻る',b.view===null&&b.ply===b.k&&!b.back&&!b.cur&&b.trail,b);
   // キー操作: ← で決め手の手前の局面
   await pg.focus('#rvGraph');await pg.keyboard.press('ArrowLeft');await pg.waitForTimeout(100);
   b=await pg.evaluate(()=>{const {G}=window.__origo;return {view:G.rv.view,k:G.rv.c.k};});
   ok(tag+': キー（←）でも局面を動かせる',b.view===b.k,b);
   await tap('#rvBack');await pg.waitForTimeout(100);
  };

  // ---- 対 CPU（勝ち）: 入門の CPU に 3 手読みで勝つ
  a=await playOut(3,0,0);
  ok('対 CPU の対局が勝ちで終わる',a.res&&a.res.winner===a.human,a.res);
  await openReview();
  let g=await graphCheck('勝ち');ok('勝ち: 視点は「あなた」',/あなたから見て/.test(g.note)&&g.H===1);
  await pg.$eval('#rvCard',e=>e.scrollIntoView({block:'start'}));await pg.screenshot({path:`${out}/${name}-2win.png`});
  await browseCheck('勝ち');
  await tap('#rvClose');await pg.waitForTimeout(200);
  // ---- 対 CPU（負け）: 達人の CPU に 1 手読み（乱択）で負ける
  await tap('#resNew');await pg.waitForTimeout(150);
  if(!(await pg.$eval('#mdStart',e=>e.classList.contains('show')))){await tap('#btNew');await pg.waitForTimeout(150);}
  a=await playOut(1,60,3);
  ok('対 CPU の対局が負けで終わる',a.res&&a.res.winner===-a.human,a.res);
  await openReview();
  g=await graphCheck('負け');
  // 「よかった手」の切り替えと、閲覧からの戻り
  const hasAlt=await pg.$eval('#rvTabs',e=>!e.hidden);
  if(hasAlt){await tap('#rvAlt');await pg.waitForTimeout(100);
   const before=await pg.evaluate(()=>window.__origo.G.rv.show);
   await pg.focus('#rvGraph');await pg.keyboard.press('Home');await pg.waitForTimeout(100);
   await tap('#rvAlt');await pg.waitForTimeout(150);
   const s=await pg.evaluate(()=>{const {G}=window.__origo;return {view:G.rv.view,show:G.rv.show,ply:G.s.ply,k:G.rv.c.k};});
   ok('負け: 閲覧中に「よかった手」を押すと、決め手の局面に戻って表示',before==='alt'&&s.view===null&&s.show==='alt'&&s.ply===s.k,s);
   await tap('#rvMine');}
  await pg.$eval('#rvCard',e=>e.scrollIntoView({block:'start'}));await pg.screenshot({path:`${out}/${name}-3lose.png`});
  await browseCheck('負け');
  await tap('#rvClose');await pg.waitForTimeout(200);
  ok('閉じると結果画面に戻り、盤は終局の局面',await pg.$eval('#mdRes',e=>e.classList.contains('show'))&&!!(await A()).res&&!(await A()).rv);
  // ---- ふたりで対局（銀が投了 → 視点は敗れた銀）
  await tap('#resNew');await pg.waitForTimeout(150);
  if(!(await pg.$eval('#mdStart',e=>e.classList.contains('show')))){await tap('#btNew');await pg.waitForTimeout(150);}
  await tap('#stP2');await pg.waitForTimeout(300);
  for(let k=0;k<9;k++){a=await waitIdle();await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:2,margin:0,rand:E.rng(G.s.ply+5)}));});await pg.waitForTimeout(50);}
  a=await waitIdle();
  if(a.turn!==-1){await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:2,margin:0,rand:E.rng(99)}));});a=await waitIdle();}
  await tap('#btResign');await pg.waitForTimeout(100);await tap('#rsYes');await pg.waitForTimeout(1300);
  a=await A();ok('2 人対戦: 銀の投了で終局',a.p2&&a.res&&a.res.winner===1,a.res);
  await openReview();
  g=await graphCheck('2人対戦');ok('2人対戦: 視点は敗れた側（銀から見て）',/銀から見て/.test(g.note)&&g.H===-1,g.note);
  await pg.$eval('#rvCard',e=>e.scrollIntoView({block:'start'}));await pg.screenshot({path:`${out}/${name}-4p2.png`});
  await browseCheck('2人対戦');
  const vs=await pg.evaluate(()=>window.__origo.V.s);ok('2人対戦: 閲覧中も視点の側（銀）が下',vs===-1,vs);
  await tap('#rvClose');await pg.waitForTimeout(200);
  await pg.close();
 }
 const bad=results.filter(r=>!r.ok);
 console.log('\n'+(bad.length?'NG '+bad.length+' 件 / '+results.length:'全 '+results.length+' 項目 OK'));
 console.log('errors',errs);
 await br.close();
 process.exit(bad.length||errs.length?1:0);
})();
