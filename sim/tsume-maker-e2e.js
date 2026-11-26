// 詰めの自作・コード交換の通し確認（ヘッドレス Chromium）。
//   node sim/tsume-maker-e2e.js [スクリーンショットの出力先]
// 流れ: 詰めを作る（駒をタップで置く）→ 不合格の理由（勝てない・初手が複数・もっと短い・勝ち方・形）→ 合格 → 保存 → コード発行
//      → 別の状態（新しい端末＝空の localStorage）で読み込み → 検証 → 遊んで解く → 答え（隠しモード）→ 削除
//      → 断るコード（棋譜コード・別の文字列・欠け）と、不合格のコード（理由 → 編集画面で開く）→ 検証の時間と、画面が固まらないこと
const {chromium}=require('playwright');
const out=process.argv[2]||'.';
const URL='file://'+require('path').join(__dirname,'..','index.html');
const results=[];
const ok=(name,cond,detail)=>{results.push({name,ok:!!cond,detail});console.log((cond?'  OK  ':'  NG  ')+name+(detail!==undefined?'  '+JSON.stringify(detail):''));};
// 作る問題（公式にない、探索で見つけた局面）: あと 2 手・原点制圧
const MADE={b:'.......M........pM...P..K........p....k.........R',n:2,type:'origin',first:[-3,-2,-2,-3],name:'星を渡る小舟',author:'みお'};
const MULTI='.....k.....K.........S..P..s.................P...';     // 1 手で勝てる初手が 10 個
const ONE='......................R..KP..k...s.......M.......';      // あと 1 手・原点制圧（2 手として出すと「もっと短い」）

(async()=>{
 const br=await chromium.launch();const errs=[];
 for(const [name,vp,opt] of [['desk',{width:1280,height:900},{deviceScaleFactor:1}],['phone',{width:360,height:740},{deviceScaleFactor:2,hasTouch:true,isMobile:true}]]){
  console.log('\n== '+name+' ==');
  const ctx=await br.newContext({viewport:vp,...opt});
  let pg=await ctx.newPage();
  const watch=p=>{p.on('pageerror',e=>errs.push(name+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text());});};
  watch(pg);
  await pg.goto(URL);await pg.evaluate(()=>localStorage.clear());await pg.reload();await pg.waitForTimeout(300);
  const tap=async(sel,p=pg)=>{await p.$eval(sel,e=>e.scrollIntoView({block:'center'}));if(name==='phone')await p.tap(sel);else await p.click(sel);};
  const tapPt=async(x,y,p=pg)=>{const [cx,cy]=await p.evaluate(([x,y])=>{const {V}=window.__origo;document.getElementById('boardWrap').scrollIntoView({block:'center'});const b=document.getElementById('board').getBoundingClientRect();return [b.left+(380+V.s*90*x)/760*b.width,b.top+(380-V.s*90*y)/760*b.height];},[x,y]);
   if(name==='phone')await p.touchscreen.tap(cx,cy);else await p.mouse.click(cx,cy);await p.waitForTimeout(60);};
  const board=(p=pg)=>p.evaluate(()=>window.__origo.TsLib.format(window.__origo.G.s.b));
  const msg=(p=pg)=>p.textContent('#mkMsg');
  const waitCheck=async(p=pg)=>{for(let k=0;k<1200;k++){if(!(await p.evaluate(()=>window.__origo.TsJob.busy())))break;await p.waitForTimeout(50);}return msg(p);};
  // 局面 str を、パレットで駒を選んでタップして置く（いまの盤をいったん空にしてから）
  const build=async str=>{
   const cur=await board();for(let i=0;i<49;i++)if(cur[i]!=='.'){await tapPt(i%7-3,Math.floor(i/7)-3);}
   const KT={K:1,R:2,M:3,S:4,P:5};
   for(let i=0;i<49;i++){const c=str[i];if(c==='.')continue;const side=c===c.toUpperCase()?1:-1;
    await tap('#mkSide [data-side="'+side+'"]');await tap('#mkPcs [data-t="'+KT[c.toUpperCase()]+'"]');await tapPt(i%7-3,Math.floor(i/7)-3);}
  };
  const setN=async(n,type)=>{await tap('#mkN [data-v="'+n+'"]');await tap('#mkType [data-v="'+type+'"]');};

  // ================================================================ 作る
  await tap('#stTsume');await pg.waitForTimeout(150);
  ok('詰めORIGO の画面に「自分の詰め」と「詰めを作る」「コードを読み込む」',await pg.isVisible('#tsMake')&&await pg.isVisible('#tsImport')&&/まだありません/.test(await pg.textContent('#tsMine')));
  await tap('#tsMake');await pg.waitForTimeout(200);
  ok('編集画面が開く（POLUS 2 つの盤、手番は金）',await pg.isVisible('#mkCard')&&(await board()).replace(/\./g,'')==='Kk',await board());
  await pg.screenshot({path:`${out}/${name}-1maker.png`});
  // 置く・取り除く
  await tap('#mkSide [data-side="1"]');await tap('#mkPcs [data-t="2"]');await tapPt(1,0);
  let b=await board();ok('駒を選んで点をタップすると置ける（ROTA を 1）',b[pg?E_idx(1,0):0]==='R',b);
  await tapPt(1,0);b=await board();ok('置いた駒をタップで取り除ける',b[E_idx(1,0)]==='.',b);
  await tap('#mkPcs [data-t="1"]');await tapPt(2,-3);b=await board();
  ok('POLUS は各側 1 つ（置き直すと前の POLUS は消える）',b.split('K').length===2&&b[E_idx(2,-3)]==='K'&&b[E_idx(0,-3)]==='.',b);

  // ---- 不合格: 勝ちきれない（POLUS だけ）
  await tap('#mkClear');await setN(1,'mate');await tap('#mkCheck');let m=await waitCheck();
  ok('不合格「勝ちきれない」（POLUS 2 つだけ・あと 1 手）',/^勝ちきれません：あと 1 手では/.test(m)&&await pg.isHidden('#mkSave')&&await pg.isHidden('#mkCode'),m);
  // ---- 形の条件: 解く側の POLUS がない
  await tapPt(0,-3);await tap('#mkCheck');m=await msg();
  ok('形の条件「金の POLUS を 1 つ置いてください」（読まずにすぐ）',/金（解く側）の POLUS を 1 つ置いてください/.test(m),m);
  // ---- 不合格: 初手が複数
  await build(MULTI);await setN(1,'mate');await tap('#mkCheck');m=await waitCheck();
  ok('不合格「初手が複数」（候補の数 10 と例）',/^初手が複数あります：勝ちに届く初手が 10 個あります（例：.+ ほか）/.test(m),m);
  await pg.screenshot({path:`${out}/${name}-2multi.png`});
  // ---- 不合格: もっと短い手数
  await build(ONE);await setN(2,'origin');await tap('#mkCheck');m=await waitCheck();
  ok('不合格「もっと短い手数」（正しい手数 1 を示す）',/^もっと短い手数で解けます：あと 1 手で勝てます/.test(m),m);
  // ---- 不合格: 勝ち方が違う
  await setN(1,'mate');await tap('#mkCheck');m=await waitCheck();
  ok('不合格「指定の勝ち方（詰み）では勝ちきれない。原点制圧なら勝てる」',/^指定の勝ち方（詰み）では勝ちきれません。原点制圧なら、あと 1 手で勝ちきれます/.test(m),m);
  // ---- 合格
  await build(MADE.b);await setN(2,'origin');
  ok('置いた局面が意図どおり',(await board())===MADE.b);
  await pg.fill('#mkName','星を渡る小舟と月の夜の物語');await pg.fill('#mkAuthor',MADE.author);
  const t0=Date.now();await tap('#mkCheck');
  // 進み具合が見え、画面は固まらない（確かめている間に requestAnimationFrame が回る）
  const live=await pg.evaluate(()=>new Promise(r=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<400)requestAnimationFrame(f);else r(n);};requestAnimationFrame(f);}));
  m=await waitCheck();const wall=Date.now()-t0;
  ok('合格（初手 1 つ・あと 2 手で原点制圧）で、保存とコードのボタンが出る',/^合格：初手は 1 つだけで、あと 2 手以内に必ず原点制圧で勝てます/.test(m)&&await pg.isVisible('#mkSave')&&await pg.isVisible('#mkCode'),{m,wall});
  ok('確かめている間も画面は動く（0.4 秒に描画 '+live+' 回）',live>=10,live);
  // 変えたら合格は消える
  await tap('#mkN [data-v="3"]');ok('手数を変えると合格は取り消される（保存・コードは出ない）',await pg.isHidden('#mkSave'));
  await tap('#mkN [data-v="2"]');await tap('#mkCheck');await waitCheck();
  await tap('#mkSave');ok('保存できる',/自分の詰めに保存しました/.test(await msg()));
  await tap('#mkCode');const code=await pg.inputValue('#mkCodeOut');
  ok('コードを発行（1 行・ORIGOT1.・題は 12 文字に切る）',/^ORIGOT1\.2o\.[^\s]+$/.test(code)&&await pg.evaluate(c=>window.__origo.TsLib.decode(c).p.name,code)==='星を渡る小舟と月の夜の物',code);
  await pg.screenshot({path:`${out}/${name}-3pass.png`});
  await tap('#mkQuit');await pg.waitForTimeout(200);
  ok('一覧の「自分の詰め」に並ぶ（題・手数・勝ち方・作者）',/星を渡る小舟と月の夜の物.*あと 2 手 · 原点制圧 · みお/.test(await pg.textContent('#tsMine')));
  ok('公式の 24 問は別（自分の詰めは公式の一覧に混ざらない）',(await pg.$$eval('#tsSections .ts-q',x=>x.length))===24);
  await pg.screenshot({path:`${out}/${name}-4list.png`});

  // ================================================================ 別の状態（新しい端末）で読み込んで解く
  const ctx2=await br.newContext({viewport:vp,...opt});const pg2=await ctx2.newPage();watch(pg2);
  await pg2.goto(URL);await pg2.evaluate(()=>localStorage.clear());await pg2.reload();await pg2.waitForTimeout(300);
  await tap('#stTsume',pg2);await tap('#tsImport',pg2);await pg2.waitForTimeout(150);
  const tcMsg=()=>pg2.textContent('#tcMsg');
  const tryCode=async c=>{await pg2.fill('#tcIn',c);await tap('#tcLoad',pg2);for(let k=0;k<1200;k++){if(!(await pg2.evaluate(()=>window.__origo.TsJob.busy())))break;await pg2.waitForTimeout(50);}return tcMsg();};
  m=await tryCode('ORIGO1.a.i.9dLfa9BF');ok('棋譜コードは優しく断る',/^これは棋譜コード（ORIGO1.）です/.test(m),m);
  m=await tryCode('こんにちは');ok('別の文字列は優しく断る',/^詰めのコードは「ORIGOT1.」で始まります/.test(m),m);
  m=await tryCode(code.slice(0,-4));ok('欠けたコードは優しく断る',/^コードの一部が欠けているか/.test(m),m);
  m=await tryCode(code.replace('.2o.','.3o.'));ok('書き換えたコードも断る（検査）',/^コードの一部が欠けているか/.test(m),m);
  ok('断ったコードは登録されない',await pg2.evaluate(()=>(JSON.parse(localStorage.getItem('origo.tsMine')||'[]')).length===0));
  m=await tryCode(' '+code+'\n');
  ok('正しいコードは検証して合格 → 自分の詰めに入る',/^合格：「星を渡る小舟と月の夜の物」（作：みお）を自分の詰めに入れました/.test(m)&&await pg2.isVisible('#tcPlay'),m);
  await pg2.screenshot({path:`${out}/${name}-5import.png`});
  await tap('#tcPlay',pg2);await pg2.waitForTimeout(300);
  ok('遊ぶ画面は公式と同じカード（見出しは題）',await pg2.isVisible('#tsCard')&&/自分の詰め\s*星を渡る小舟と月の夜の物/.test(await pg2.textContent('#tsHead'))&&/あと 2 手/.test(await pg2.textContent('#tsTitle')));
  ok('答えのボタンは隠しモードのときだけ（いまは出ない）',await pg2.isHidden('#tsAnswer'));
  // 解く: 初手（唯一）→ 相手の応手 → 勝ち手（Ts.winningMove）
  const clickMove=async(f,t)=>{await tapPt(f[0],f[1],pg2);await tapPt(t[0],t[1],pg2);};
  await clickMove([MADE.first[0],MADE.first[1]],[MADE.first[2],MADE.first[3]]);
  for(let k=0;k<100;k++){const a=await pg2.evaluate(()=>({busy:window.__origo.G.busy,turn:window.__origo.G.s.turn}));if(!a.busy&&a.turn===1)break;await pg2.waitForTimeout(60);}
  const w=await pg2.evaluate(()=>{const {Ts,E}=window.__origo,m=Ts.winningMove();return m&&[E.X[m.from],E.Y[m.from],E.X[m.to],E.Y[m.to]];});
  await clickMove([w[0],w[1]],[w[2],w[3]]);
  for(let k=0;k<100;k++){if(/正解/.test(await pg2.textContent('#tsMsg')))break;await pg2.waitForTimeout(60);}
  ok('別の端末で読み込んだ問題を解ける（正解・原点制圧）',/正解　原点制圧で勝ちました/.test(await pg2.textContent('#tsMsg')),await pg2.textContent('#tsMsg'));
  const id=await pg2.evaluate(c=>window.__origo.TsLib.idOf(window.__origo.TsLib.decode(c).p),code);
  ok('「解いた」の記録は問題ごと（公式の数には入らない）',await pg2.evaluate(id=>JSON.parse(localStorage.getItem('origo.tsSolved'))[id]===1&&Object.keys(JSON.parse(localStorage.getItem('origo.tsSolved'))).length===1,id)&&/解いた問題 0 \/ 24/.test(await pg2.textContent('#stTsumeSub')));
  await pg2.screenshot({path:`${out}/${name}-6solved.png`});
  // ================================================================ 答え（隠しモード）: その場で作る。解く前に見ると「答えを見た」
  await pg.evaluate(()=>localStorage.setItem('origo.ansMode','true'));await pg.reload();await pg.waitForTimeout(300);
  await tap('#stTsume');await pg.waitForTimeout(150);
  await tap('#tsMine [data-mine]');await pg.waitForTimeout(300);
  ok('隠しモードでは「答え」が出る',await pg.isVisible('#tsAnswer'));
  await tap('#tsAnswer');for(let k=0;k<400;k++){if(await pg.isVisible('#tsAns'))break;await pg.waitForTimeout(50);}
  const rows=await pg.$$eval('#taRows tr',t=>t.map(r=>r.textContent));
  const want=await pg.evaluate(b=>{const {TsLib}=window.__origo;const g=TsLib.answer(TsLib.parse(b),2,'origin');let r;for(;;){r=g.next();if(r.done)return r.value;}},MADE.b);
  ok('答えの手順をその場で作って表示（公式の答えと同じ規則の手順・初手は「この手だけが正解」）',rows.length===want.line.length&&/この手だけが正解/.test(rows[0])&&/最も粘る手/.test(rows[1])&&/答え\s*星を渡る小舟/.test(await pg.textContent('#taHead')),{rows,want:want.line});
  ok('解く前に答えを見ると「答えを見た」（問題ごと）',await pg.evaluate(()=>{const se=JSON.parse(localStorage.getItem('origo.tsSeen')||'{}');return Object.keys(se).length===1&&Object.keys(se)[0].startsWith('u');}));
  await pg.screenshot({path:`${out}/${name}-7answer.png`});
  await tap('#taClose');await tap('#tsList');await pg.waitForTimeout(150);
  ok('一覧で「答えを見た」の印',await pg.$eval('#tsMine .ts-q',e=>e.classList.contains('seen')));
  // ================================================================ 不合格のコード → 理由と編集画面
  const badCode=await pg.evaluate(b=>window.__origo.TsLib.encode({n:1,type:'mate',b,name:'たくさん',author:''}),MULTI);
  await tap('#stTsume',pg2).catch(()=>{});
  await pg2.evaluate(()=>{document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));});
  await pg2.evaluate(()=>window.__origo.TsCode.open());await pg2.waitForTimeout(100);
  m=await tryCode(badCode);
  ok('不合格のコードは登録せず、理由と「編集画面で開く」',/登録しませんでした：初手が複数あります：勝ちに届く初手が 10 個/.test(m)&&await pg2.isVisible('#tcEdit')&&await pg2.evaluate(()=>JSON.parse(localStorage.getItem('origo.tsMine')).length===1),m);
  await tap('#tcEdit',pg2);await pg2.waitForTimeout(300);
  ok('編集画面で開く（局面・手数・勝ち方・題が入り、理由が出ている）',await pg2.isVisible('#mkCard')&&(await board(pg2))===MULTI&&await pg2.inputValue('#mkName')==='たくさん'&&/初手が複数/.test(await msg(pg2))&&await pg2.$eval('#mkN [data-v="1"]',e=>e.getAttribute('aria-pressed')==='true'));
  // ================================================================ 棋譜コードの欄に詰めのコード
  await pg2.evaluate(()=>{document.getElementById('mkQuit').click();});await pg2.waitForTimeout(150);
  await pg2.evaluate(()=>{document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));document.getElementById('stGo').click();});await pg2.waitForTimeout(300);
  await tap('#btRec',pg2);await pg2.fill('#recIn',code);await tap('#recLoad',pg2);
  ok('棋譜コードの欄に詰めのコードを入れると、優しく案内して読み込まない',/これは詰めのコードです/.test(await pg2.textContent('#recMsg'))&&await pg2.evaluate(()=>window.__origo.G.s.ply===0));
  // ================================================================ 削除
  await pg.evaluate(()=>{document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));window.__origo.Ts.list();});await pg.waitForTimeout(150);
  await tap('#tsMine [data-del]');ok('削除は 2 回押し（1 回目は「削除する」に変わるだけ）',(await pg.textContent('#tsMine [data-del]'))==='削除する'&&await pg.evaluate(()=>JSON.parse(localStorage.getItem('origo.tsMine')).length===1));
  await tap('#tsMine [data-del]');await pg.waitForTimeout(100);
  ok('削除すると一覧と記録から消える',/まだありません/.test(await pg.textContent('#tsMine'))&&await pg.evaluate(()=>JSON.parse(localStorage.getItem('origo.tsMine')).length===0&&Object.keys(JSON.parse(localStorage.getItem('origo.tsSeen')||'{}')).length===0));
  // ================================================================ 検証の時間（ブラウザ・Worker）。公式の 1・2・3 手の問題で測る
  if(name==='desk'){
   const T=await pg.evaluate(async()=>{const {TsJob,TsLib,G}=window.__origo;const TS=window.__origo.TSUME;const out=[];
    for(const id of [1,5,9,10,17,19,20]){const q=TS[id-1];const r=await TsJob.run('verify',{b:q.b,n:q.n,type:q.type});out.push({id,n:q.n,type:q.type,ok:r.value.ok,sec:+(r.wall/1000).toFixed(2),worker:r.worker});}
    return out;});
   for(const t of T)ok('検証の時間（ブラウザ・Worker）公式 第'+t.id+'問 あと'+t.n+'手: '+t.sec+' 秒',t.ok&&t.worker,t);
  }
  await ctx2.close();await ctx.close();
 }
 const bad=results.filter(r=>!r.ok);
 console.log('\n'+(bad.length?'NG '+bad.length+' 件 / '+results.length:'全 '+results.length+' 項目 OK'));
 console.log('errors',errs);
 await br.close();
 process.exit(bad.length||errs.length?1:0);
})();
function E_idx(x,y){return (y+3)*7+(x+3);}
