// ふたりで対局の通し確認（ヘッドレス Chromium）。
//   node sim/p2-e2e.js [スクリーンショットの出力先]
// 画面の座標は、DOM の位置ではなく「複素数の点 → 画面の位置」を自分で計算して使う（回転後もタップがずれないことの確認のため）。
const {chromium}=require('playwright');
const out=process.argv[2]||'.';
const URL='file://'+require('path').join(__dirname,'..','index.html');
const results=[];
const ok=(name,cond,detail)=>{results.push({name,ok:!!cond,detail});console.log((cond?'  OK  ':'  NG  ')+name+(detail!==undefined?'  '+JSON.stringify(detail):''));};
const C118='ORIGO1.a.i.9dLfa9BF9fH53a5HdcDAbjF1fHCoHfAcab1fbcJCjdfDd5Dx5dxDd5Dx5dx9d59f5df9d59fcdftdctHcbHtbiCv5dvCihCvhivCihCvhavCd7tn7dowd7wo7dowd7nr7drjd7jB7dBFd7FB7dBJd7Jr7drFd7woa9Cv9gvwgnwvngvwgnwvnmvw79FL9hLFmnophtFrngpot1rjgnoi1HjrnuiouBrjBCovCJjHJIHj';

(async()=>{
 const br=await chromium.launch();const errs=[];
 for(const [name,vp,opt] of [['desk',{width:1280,height:900},{deviceScaleFactor:1}],['phone',{width:360,height:740},{deviceScaleFactor:2,hasTouch:true,isMobile:true}]]){
  console.log('\n== '+name+' ==');
  const pg=await br.newPage({viewport:vp,...opt});
  pg.on('pageerror',e=>errs.push(name+': '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text());});
  const cdp=name==='phone'?await pg.context().newCDPSession(pg):null;
  await pg.goto(URL);await pg.evaluate(()=>localStorage.clear());await pg.reload();await pg.waitForTimeout(300);
  const tap=async sel=>{if(name==='phone')await pg.tap(sel);else await pg.click(sel);};
  const tapXY=async(x,y)=>{if(name==='phone')await pg.touchscreen.tap(x,y);else await pg.mouse.click(x,y);};
  const A=()=>pg.evaluate(()=>{const {G,V}=window.__origo;return {ply:G.s.ply,turn:G.s.turn,human:G.human,busy:G.busy,vs:V.s,first:G.s.first,res:G.s.result,sel:G.sel,pv:!!G.pv,p2:!!G.p2};});
  // 点 p の画面上の位置（複素数の点 → 盤の見かけの位置。回転中でないとき）
  const scr=p=>pg.evaluate(p=>{const {E,V}=window.__origo;document.getElementById('boardWrap').scrollIntoView({block:'center'});const b=document.getElementById('board').getBoundingClientRect();return [b.left+(380+V.s*90*E.X[p])/760*b.width,b.top+(380-V.s*90*E.Y[p])/760*b.height];},p);
  const waitIdle=async(turn)=>{for(let k=0;k<200;k++){const a=await A();if(!a.busy&&(turn===undefined||a.turn===turn))return a;await pg.waitForTimeout(50);}return A();};
  // 当たりの確認: 全部の駒の位置で、その点を押すと、その駒の要素に当たる。選択中なら行き先の点も
  const hitCheck=()=>pg.evaluate(()=>{const {G,E,V}=window.__origo;document.getElementById('boardWrap').scrollIntoView({block:'center'});const b=document.getElementById('board').getBoundingClientRect();
   const sc=p=>[b.left+(380+V.s*90*E.X[p])/760*b.width,b.top+(380-V.s*90*E.Y[p])/760*b.height];let n=0,bad=0;
   for(let p=0;p<49;p++)if(G.s.b[p]){const [x,y]=sc(p);const el=document.elementFromPoint(x,y);const g=el&&el.closest('[data-to],[data-p]');n++;const okp=g&&(g.dataset.p!==undefined&&+g.dataset.p===p||g.dataset.to!==undefined&&+g.dataset.to===p);if(!okp)bad++;}
   for(const p of G.moves){const [x,y]=sc(p);const el=document.elementFromPoint(x,y);const g=el&&el.closest('[data-to]');n++;if(!g||+g.dataset.to!==p)bad++;}
   return {n,bad};});
  // 手番の側の駒が画面の下側にあるか（駒の要素の画面位置の平均）
  const moverBottom=()=>pg.evaluate(()=>{const {G}=window.__origo;let m=[],o=[];document.querySelectorAll('#board g.pc').forEach(g=>{const p=+g.dataset.p,r=g.getBoundingClientRect(),y=r.top+r.height/2;(Math.sign(G.s.b[p])===G.s.turn?m:o).push(y);});const av=a=>a.reduce((x,y)=>x+y,0)/a.length;return {mover:Math.round(av(m)),other:Math.round(av(o)),bottom:av(m)>av(o)};});
  const labelOrder=()=>pg.evaluate(()=>{const t=[...document.querySelectorAll('#bgLab text')].filter(e=>e.getAttribute('text-anchor')==='middle').map(e=>[e.textContent,+e.getAttribute('x')]);const lo=t.find(x=>x[0]==='−3'),hi=t.find(x=>x[0]==='3');return {minus3x:lo[1],plus3x:hi[1],descending:lo[1]>hi[1]};});
  // 一手指す: 駒を押し、行き先を押す（どちらも「点→画面の位置」を自分で計算して押す）
  const movePick=(pred)=>pg.evaluate(pred=>{const {G,E,Preview}=window.__origo;const S=G.s.turn;for(const m of E.legal(G.s.b,S,G.s.rep)){const f=(m/49)|0,t=m%49;if(eval(pred))return {f,t};}return null;},pred);
  const clickMove=async(f,t)=>{let [x,y]=await scr(f);await tapXY(x,y);await pg.waitForTimeout(80);[x,y]=await scr(t);await tapXY(x,y);};
  const press=async(x,y,ms)=>{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await pg.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await pg.mouse.move(x,y);await pg.mouse.down();await pg.waitForTimeout(ms);await pg.mouse.up();}};
  const autoMove=async()=>{await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:1,margin:70,rand:E.rng(G.s.ply+11)}));});};
  const code=()=>pg.evaluate(()=>{const {G,Resign}=window.__origo;return Resign.encode(G.s);});
  const tally=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('origo.p2stat')||'{"au":0,"ag":0,"dr":0}'));

  // ---------------------------------------------------------------- 入口と開始
  ok('入口の表示（集計は 0 から）',/ふたりで対局/.test(await pg.textContent('#stP2'))&&/金 0 勝・銀 0 勝・引分 0/.test(await pg.textContent('#stP2Sub')),await pg.textContent('#stP2Sub'));
  await pg.screenshot({path:`${out}/${name}-0title.png`});
  await tap('#stP2');await pg.waitForTimeout(300);
  let a=await A();
  ok('2 人対戦が始まる（CPU を呼ばない、手番は金）',a.p2&&a.ply===0&&a.turn===1&&a.first===1&&a.human===1);
  ok('手番の表示（トースト）「金の番です」',/金の番です/.test(await pg.textContent('#turnToast'))&&await pg.$eval('#turnToast',e=>e.classList.contains('show')));
  ok('状況表示「金の番です」と、待ったは押せない（2 手未満）',/金の番です/.test(await pg.textContent('#stText'))&&await pg.$eval('#btUndo',e=>e.disabled&&e.textContent==='待った'));
  ok('回転の設定と手動ボタンが出る',await pg.$eval('#tgRot',e=>!e.hidden)&&await pg.$eval('#btFlip',e=>!e.hidden));
  await pg.screenshot({path:`${out}/${name}-1start.png`});
  let h=await hitCheck();ok('当たり（回転前）',h.bad===0,h);
  let mb=await moverBottom();ok('手番の側（金）が下',mb.bottom,mb);

  // ---------------------------------------------------------------- 回転オン: 金が指す → 銀の番で盤が回る
  const codes={};codes[0]=await code();
  let m=await movePick('true');await clickMove(m.f,m.t);
  // 回転の途中を見る（盤の層が回り、駒は逆に回って立っている）
  for(let k=0;k<100;k++){if(await pg.evaluate(()=>!!(window.__origo.G.p2&&window.__origo.G.p2.turning)))break;await pg.waitForTimeout(20);}
  await pg.waitForTimeout(260);
  const mid=await pg.evaluate(()=>{const {G}=window.__origo;const s=document.getElementById('board');return {transform:s.style.transform,busy:G.busy,lab:document.getElementById('bgLab').style.opacity,pcin:[...document.querySelectorAll('#board .pcin')].slice(0,2).map(e=>e.getAttribute('transform'))};});
  ok('回転のアニメーション中（盤の層が回り、駒は逆回し、目盛りは消える）',/rotate/.test(mid.transform)&&mid.busy&&mid.lab==='0'&&mid.pcin.every(t=>/rotate\(-/.test(t)),mid);
  await pg.screenshot({path:`${out}/${name}-2rotating.png`});
  a=await waitIdle(-1);codes[1]=await code();
  ok('回転し終えると、銀の番・向きが反転・human が銀',a.turn===-1&&a.vs===-1&&a.human===-1,a);
  ok('手番の表示「銀の番です」',/銀の番です/.test(await pg.textContent('#turnToast'))&&/銀の番です/.test(await pg.textContent('#stText')));
  mb=await moverBottom();ok('手番の側（銀）が下に来る',mb.bottom,mb);
  const lo=await labelOrder();ok('目盛りが回った向きに付け替わる（−3 が右、3 が左）',lo.descending,lo);
  h=await hitCheck();ok('当たり（回転後・駒）',h.bad===0,h);
  await pg.screenshot({path:`${out}/${name}-3flipped.png`});
  // 回転後のタップ: 銀の駒を押す → 行き先の点を押す
  const sp=await movePick('Preview.analyze(G.s,f,t)');   // 長押しでプレビューが開く手
  let [fx,fy]=await scr(sp.f);await tapXY(fx,fy);await pg.waitForTimeout(100);
  h=await hitCheck();ok('当たり（回転後・選択した駒の行き先）',h.bad===0&&h.n>6,h);
  // 長押し: 満ちる輪が行き先の位置に出て、450ms でプレビューが開く（回転後でもずれない）
  let [tx,ty]=await scr(sp.t);
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});else{await pg.mouse.move(tx,ty);await pg.mouse.down();}
  await pg.waitForTimeout(260);
  const ring=await pg.evaluate(()=>{const g=document.getElementById('lpRing');if(!g)return null;const r=g.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];});
  ok('満ちる輪の位置が、押した行き先と一致（回転後）',ring&&Math.hypot(ring[0]-tx,ring[1]-ty)<4,{ring,want:[tx,ty]});
  await pg.waitForTimeout(400);
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await pg.mouse.up();
  await pg.waitForTimeout(150);
  a=await A();ok('長押しでプレビューが開き、離しても確定しない（回転後）',a.pv&&a.ply===1,a);
  // 印の位置: 新しい行き先の輪・対応の線が、その点の画面位置にある
  const marks=await pg.evaluate(()=>{const {G,E,V}=window.__origo;const b=document.getElementById('board').getBoundingClientRect();const sc=p=>[b.left+(380+V.s*90*E.X[p])/760*b.width,b.top+(380-V.s*90*E.Y[p])/760*b.height];
   const bad=[];const near=(a,c)=>Math.hypot(a[0]-c[0],a[1]-c[1])<4;
   for(const p of G.pv.fresh){const el=[...document.querySelectorAll('#board .tnew')].find(e=>{const r=e.getBoundingClientRect();return near([r.left+r.width/2,r.top+r.height/2],sc(p));});if(!el)bad.push('fresh '+p);}
   for(const p of G.pv.gone){const el=[...document.querySelectorAll('#board .tghost')].find(e=>{const r=e.getBoundingClientRect();return near([r.left+r.width/2,r.top+r.height/2],sc(p));});if(!el)bad.push('gone '+p);}
   let lines=0;for(const k of G.pv.links){const ln=[...document.querySelectorAll('#board .pvlink')].find(e=>{const r=e.getBoundingClientRect();const p1=sc(k.from),p2=sc(k.to);return r.left<=Math.max(p1[0],p2[0])+2&&r.right>=Math.min(p1[0],p2[0])-2&&r.top<=Math.max(p1[1],p2[1])+2&&r.bottom>=Math.min(p1[1],p2[1])-2;});if(ln)lines++;else bad.push('link '+k.from+'>'+k.to);}
   return {fresh:G.pv.fresh.length,gone:G.pv.gone.length,links:G.pv.links.length,drawnLinks:lines,bad};});
  ok('プレビューの印と対応の線の位置（回転後）',marks.bad.length===0&&marks.links>0,marks);
  await pg.screenshot({path:`${out}/${name}-4preview-flipped.png`});
  // 駒をタップして絞り込み（回転後）
  const pick=await pg.evaluate(()=>{const {G}=window.__origo;return G.pv.links.length?G.pv.links[0].piece:-1;});
  if(pick>=0){[fx,fy]=await scr(pick);await tapXY(fx,fy);await pg.waitForTimeout(100);const f=await pg.evaluate(()=>({pick:window.__origo.G.pv&&window.__origo.G.pv.pick,lines:document.querySelectorAll('#board .pvlink').length}));ok('駒のタップで絞り込み（回転後）',f.pick===pick&&f.lines>=1,f);}
  // 取り消す → 通常のタップで確定
  await tap('#pvNo');await pg.waitForTimeout(100);
  [tx,ty]=await scr(sp.t);await tapXY(tx,ty);await pg.waitForTimeout(80);
  a=await waitIdle(1);codes[2]=await code();
  ok('回転後の通常タップで即確定し、金の番に戻って盤が戻る',a.ply===2&&a.turn===1&&a.vs===1&&a.human===1,a);
  mb=await moverBottom();ok('金が下',mb.bottom,mb);

  // ---------------------------------------------------------------- 待った
  a=await A();
  ok('待ったは 2 手以上で押せる',await pg.$eval('#btUndo',e=>!e.disabled));
  await tap('#btUndo');await pg.waitForTimeout(150);
  ok('待ったの確認が出る',await pg.$eval('#mdTake',e=>e.classList.contains('show')));
  await tap('#tkNo');await pg.waitForTimeout(100);a=await A();ok('「やめる」で何も変わらない',a.ply===2);
  await tap('#btUndo');await tap('#tkYes');await pg.waitForTimeout(200);
  a=await A();
  ok('待ったで 2 手戻る（手番は金のまま、盤の向きもそのまま）',a.ply===0&&a.turn===1&&a.vs===1&&a.human===1,a);
  const c0=await code();ok('棋譜コードが戻した局面と一致',c0===codes[0],{now:c0,want:codes[0]});
  await tap('#btRec');const rc=await pg.inputValue('#recOut');ok('棋譜コードの欄にも反映',rc===codes[0]);await tap('#mdRec .btn[data-close]');
  // もう一度指して進める（金 → 銀 → 金 → 銀）。待ったで 2 手戻したあとの棋譜は、そこから先が続く
  for(let k=0;k<4;k++){const t=(await A()).turn;await autoMove();await waitIdle(-t);}
  a=await A();ok('4 手指した（ply 4、金の番）',a.ply===4&&a.turn===1,a);
  const c4=await code();
  await tap('#btUndo');await tap('#tkYes');await pg.waitForTimeout(200);
  a=await A();const c2=await code();
  ok('待ったで ply 4 → 2。棋譜は前の 2 手分に一致',a.ply===2&&c4.startsWith(c2.split('.').slice(0,3).join('.'))&&c4.split('.')[3].startsWith(c2.split('.')[3]),{c2,c4});

  // ---------------------------------------------------------------- 回転オフ・手動で回す
  await tap('#tgRot');await pg.waitForTimeout(100);
  ok('回転をオフにできる',(await pg.$eval('#tgRot',e=>e.getAttribute('aria-pressed')))==='false'&&await pg.evaluate(()=>JSON.parse(localStorage.getItem('origo.rot'))===false));
  const vsBefore=(await A()).vs;
  await autoMove();await waitIdle(-1);a=await A();
  ok('回転オフでは、手番が替わっても盤は回らない（向きそのまま、human は銀）',a.vs===vsBefore&&a.turn===-1&&a.human===-1,a);
  h=await hitCheck();ok('当たり（回転オフ）',h.bad===0,h);
  await tap('#btFlip');await pg.waitForTimeout(150);ok('手動の回転が動いている最中は操作できない',(await A()).busy);
  a=await waitIdle();ok('手動で回すと向きが反転する',a.vs===-vsBefore,a);
  h=await hitCheck();ok('当たり（手動で回した後）',h.bad===0,h);
  mb=await moverBottom();ok('手動で回した向き（銀が下）',mb.bottom,mb);
  await pg.screenshot({path:`${out}/${name}-5manual.png`});
  await tap('#tgRot');await pg.waitForTimeout(100);   // オンに戻す（向きは手番の側に合う）
  a=await waitIdle();ok('回転をオンに戻すと、いまの手番の側が下になる',a.vs===-1&&a.turn===-1&&(await moverBottom()).bottom,a);

  // ---------------------------------------------------------------- 投了
  const tBefore=await tally();
  await tap('#btResign');await pg.waitForTimeout(100);ok('投了の確認が出る',await pg.$eval('#mdResign',e=>e.classList.contains('show')));
  await tap('#rsYes');await pg.waitForTimeout(1200);
  a=await A();const sub=await pg.textContent('#resSub');
  ok('銀が投了 → 金の勝ち、「N 手で投了（銀）」',a.res&&a.res.reason==='resign'&&a.res.winner===1&&new RegExp(a.ply+' 手で投了（銀）').test(sub)&&/金の勝ち/.test(await pg.textContent('#resTitle')),{sub,title:await pg.textContent('#resTitle')});
  const tAfter=await tally();ok('集計が更新される（金 +1）',tAfter.au===tBefore.au+1&&tAfter.ag===tBefore.ag,tAfter);
  ok('2 人対戦の結果の行（交代あり／なし・タイトル）が出る',await pg.$eval('#res2pRow',e=>!e.hidden)&&await pg.$eval('#resRowStd',e=>e.hidden));
  await pg.screenshot({path:`${out}/${name}-6result.png`});
  const rcode=await code();ok('投了の棋譜コード（.R- 付き）',/\.R-$/.test(rcode),rcode);
  // ふりかえり（敗れた側＝銀の視点）
  ok('ふりかえりが出る',await pg.$eval('#resReviewRow',e=>!e.hidden));
  await tap('#resReview');for(let k=0;k<200;k++){if(await pg.evaluate(()=>window.__origo.G.rv&&window.__origo.G.rv.ready))break;await pg.waitForTimeout(50);}
  const rv=await pg.evaluate(()=>{const {G,V}=window.__origo;return {title:document.getElementById('rvTitle').textContent,text:document.getElementById('rvText').textContent,human:G.human,vs:V.s,H:G.rv.c.H,tabs:!document.getElementById('rvTabs').hidden,mine:document.getElementById('rvMine').textContent};});
  ok('ふりかえりは敗れた側（銀）の視点で、その側が下',/敗因の一手/.test(rv.title)&&/銀（敗れた側）/.test(rv.text)&&rv.H===-1&&rv.vs===-1,rv);
  await pg.screenshot({path:`${out}/${name}-7review.png`});
  if(rv.tabs){await tap('#rvAlt');await pg.waitForTimeout(150);ok('よかった手に切り替えられる',/よかった手/.test(await pg.textContent('#fmT')));await tap('#rvMine');}
  await tap('#rvClose');await pg.waitForTimeout(300);
  a=await A();ok('ふりかえりを閉じると、結果画面に戻り、向きと human が元に戻る',a.vs===-1&&await pg.$eval('#mdRes',e=>e.classList.contains('show')),a);
  // 棋譜コードを読み込む → 投了の状態で再生（集計は増えない）
  await tap('#res2View');await pg.waitForTimeout(100);
  await tap('#btNew');await pg.waitForTimeout(100);
  ok('タイトルの集計',/金 1 勝・銀 0 勝・引分 0/.test(await pg.textContent('#stP2Sub')),await pg.textContent('#stP2Sub'));
  await tap('#stP2');await pg.waitForTimeout(300);
  await tap('#btRec');await pg.fill('#recIn',rcode);await tap('#recLoad');await pg.waitForTimeout(1100);
  a=await A();ok('棋譜コードの読み込み: 2 人対戦のまま、投了で終局（銀が投了）',a.p2&&a.res&&a.res.reason==='resign'&&a.res.by===-1,a);
  ok('再生は集計に数えない',JSON.stringify(await tally())===JSON.stringify(tAfter));
  ok('結果「銀が投了」の表示',/銀が投了しました/.test(await pg.textContent('#stText'))&&/棋譜コードからの再生/.test(await pg.textContent('#resStat')));
  await tap('#res2View');

  // ---------------------------------------------------------------- 勝敗まで通して指す（金の勝ち／銀の勝ち）
  const playOut=async(depthG,depthS)=>{
   return pg.evaluate(async([dg,ds])=>{const {G,E,play}=window.__origo;const rand=E.rng(99);let n=0;
    while(!G.s.result&&n<200){if(!G.busy){const d=G.s.turn===1?dg:ds;play(E.choose(G.s,{depth:d,margin:G.s.ply<6?40:0,rand}));n++;}await new Promise(r=>setTimeout(r,25));}
    await new Promise(r=>setTimeout(r,1500));return {res:G.s.result,ply:G.s.ply};},[depthG,depthS]);
  };
  await pg.evaluate(()=>document.getElementById('mdRes').classList.remove('show'));
  await tap('#btNew');await pg.waitForTimeout(100);await tap('#stP2');await pg.waitForTimeout(300);
  const t1=await tally();
  const g1=await playOut(3,1);
  const t2=await tally();
  ok('通しで指して勝敗がつく（回転しながら）',g1.res&&g1.res.winner!==0,g1);
  ok('集計が勝った色に +1',g1.res.winner===1?t2.au===t1.au+1:t2.ag===t1.ag+1,t2);
  const title1=await pg.textContent('#resTitle');ok('結果の見出しが色で出る',/(金|銀)の勝ち/.test(title1),title1);
  await pg.screenshot({path:`${out}/${name}-8played.png`});
  // 先後を交代して再戦（既定のボタン）
  const f0=(await A()).first;
  await tap('#res2Swap');await pg.waitForTimeout(500);
  a=await A();
  ok('先後を交代して再戦: first が反転し、先手（金）の陣が下に来る',a.first===-f0&&a.ply===0&&a.turn===a.first&&a.vs===(a.first<0?-1:1),a);
  ok('「金の番です」が出る（交代後も金が先）',/金の番です/.test(await pg.textContent('#stText')));
  mb=await moverBottom();ok('先手の駒が下',mb.bottom,mb);
  h=await hitCheck();ok('当たり（交代後・回転あり）',h.bad===0,h);
  await pg.screenshot({path:`${out}/${name}-9swapped.png`});
  // 交代しない再戦
  const g2=await playOut(1,3);
  const f1=(await A()).first;
  await tap('#res2Same');await pg.waitForTimeout(500);
  a=await A();ok('交代しない再戦: first はそのまま',a.first===f1&&a.ply===0,a);

  // ---------------------------------------------------------------- 120 手の引き分け
  await tap('#btNew');await pg.waitForTimeout(100);await tap('#stP2');await pg.waitForTimeout(300);
  await tap('#btRec');await pg.fill('#recIn',C118);await tap('#recLoad');await pg.waitForTimeout(500);
  a=await A();ok('118 手まで読み込む（2 人対戦のまま、金の番）',a.p2&&a.ply===118&&a.turn===1&&a.human===1,a);
  const t3=await tally();
  // 119・120 手目: 終局しない手を選んで指す
  for(let k=0;k<2;k++){
   const mv=await pg.evaluate(()=>{const {G,E}=window.__origo;for(const m of E.legal(G.s.b,G.s.turn,G.s.rep)){const n=E.apply(G.s,{from:(m/49)|0,to:m%49});if(!n.result||n.result.reason==='limit')return {f:(m/49)|0,t:m%49};}return null;});
   const tt=(await A()).turn;await clickMove(mv.f,mv.t);await waitIdle(-tt);
  }
  await pg.waitForTimeout(1200);
  a=await A();const t4=await tally();
  ok('120 手で引き分け',a.res&&a.res.reason==='limit'&&a.res.winner===0&&/引き分け/.test(await pg.textContent('#resTitle')),a.res);
  ok('引分が集計に +1、ふりかえりは出ない',t4.dr===t3.dr+1&&await pg.$eval('#resReviewRow',e=>e.hidden),t4);
  await pg.screenshot({path:`${out}/${name}-10draw.png`});

  // ---------------------------------------------------------------- 通常対局は影響を受けない
  await tap('#res2Title');await pg.waitForTimeout(150);
  await tap('#optLv button[data-v="1"]');await tap('#stGo');await pg.waitForTimeout(400);
  a=await A();
  ok('CPU 対局に戻る: 向き・human・ボタンが通常に戻る',!a.p2&&a.vs===1&&a.human===1&&await pg.$eval('#tgRot',e=>e.hidden)&&await pg.$eval('#btFlip',e=>e.hidden)&&(await pg.textContent('#btUndo'))==='一手戻す',a);
  const lo2=await labelOrder();ok('目盛りも通常の向き',!lo2.descending,lo2);
  ok('2 人対戦の集計は CPU の通算と別',await pg.evaluate(()=>localStorage.getItem('origo.stat')===null));
  await pg.close();
 }
 const bad=results.filter(r=>!r.ok);
 console.log('\n'+(bad.length?'NG '+bad.length+' 件 / '+results.length:'全 '+results.length+' 項目 OK'));
 console.log('errors',errs);
 await br.close();
 process.exit(bad.length||errs.length?1:0);
})();
