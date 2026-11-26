// CPU の個性とふたりで対局の名前の通し確認（ヘッドレス Chromium）。
//   node sim/persona-e2e.js [スクリーンショットの出力先]
const {chromium}=require('playwright');
const out=process.argv[2]||'.';
const URL='file://'+require('path').join(__dirname,'..','index.html');
const results=[];
const ok=(name,cond,detail)=>{results.push({name,ok:!!cond,detail});console.log((cond?'  OK  ':'  NG  ')+name+(detail!==undefined?'  '+JSON.stringify(detail):''));};
const NAMES=['テオ','ミラ','セレス','ノクス'],LVN=['入門','標準','上級','達人'];

(async()=>{
 const br=await chromium.launch();const errs=[];
 for(const [name,vp,opt] of [['desk',{width:1280,height:900},{deviceScaleFactor:1}],['phone',{width:360,height:740},{deviceScaleFactor:2,hasTouch:true,isMobile:true}]]){
  console.log('\n== '+name+' ==');
  const pg=await br.newPage({viewport:vp,...opt});
  pg.on('pageerror',e=>errs.push(name+': '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text());});
  await pg.goto(URL);await pg.evaluate(()=>localStorage.clear());await pg.reload();await pg.waitForTimeout(300);
  const tap=async sel=>{await pg.$eval(sel,e=>e.scrollIntoView({block:'center'}));if(name==='phone')await pg.tap(sel);else await pg.click(sel);};
  const A=()=>pg.evaluate(()=>{const {G}=window.__origo;return {ply:G.s.ply,turn:G.s.turn,human:G.human,busy:G.busy,res:G.s.result,p2:!!G.p2};});
  const waitIdle=async()=>{for(let k=0;k<800;k++){const a=await A();if(!a.busy)return a;await pg.waitForTimeout(40);}return A();};
  const txt=sel=>pg.textContent(sel);

  // ================================================================ 難易度の選択
  const btns=await pg.$$eval('#optLv button',bs=>bs.map(b=>b.textContent));
  ok('難易度の 4 段に名前が出る（段と読みの深さも添える）',btns.length===4&&btns.every((t,i)=>t.startsWith(['テオ','ミラ','セレス','ノクス'][i])&&t.includes(['入門','標準','上級','達人'][i])),btns);
  const intros=[];
  for(let i=0;i<4;i++){await tap('#optLv button[data-v="'+i+'"]');await pg.waitForTimeout(60);intros.push(await txt('#lvIntro'));}
  const want=['ぼくはテオ。原点めざして、まっすぐ行くよ','あたしはミラ。原点のまわりで待つのが好き','セレスと申します。取るべき駒は、逃がしません','……ノクス。盤の声が、聞こえるか'];
  ok('段を選ぶと、名前と自己紹介と棋風が出る',intros.every((t,i)=>t.includes(NAMES[i])&&t.includes('「'+want[i]+'」')&&t.includes('棋風：')),intros);
  ok('入門のテオには肩書き（天文盤の見習い）',intros[0].includes('テオ（天文盤の見習い）'));
  await tap('#optLv button[data-v="0"]');await pg.waitForTimeout(60);
  await pg.$eval('.tsetup',e=>e.scrollIntoView({block:'end'}));await pg.screenshot({path:`${out}/${name}-1levels.png`});

  // ================================================================ 対局中と結果（テオに勝つ）
  const playOut=async(lv,hd,hm)=>{
   await tap('#optLv button[data-v="'+lv+'"]');await tap('#stGo');await pg.waitForTimeout(300);
   let a,seen={think:false,ply:null};
   for(let k=0;k<500;k++){a=await A();
    if(a.busy&&!a.res&&a.turn!==a.human&&!seen.think){const t=await txt('#stText');if(t.includes('考えています'))seen.think=t;}
    if(seen.ply===null)seen.ply=await txt('#plyNo');
    if(a.res)break;if(a.busy){await pg.waitForTimeout(40);continue;}
    if(a.turn===a.human)await pg.evaluate(([hd,hm])=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:hd,margin:hm,rand:E.rng(G.s.ply*13+5)}));},[hd,hm]);
    else await pg.waitForTimeout(40);}
   for(let k=0;k<60;k++){if(await pg.$eval('#mdRes',e=>e.classList.contains('show')))break;await pg.waitForTimeout(50);}
   return {a:await A(),seen};
  };
  let r=await playOut(0,3,0);
  ok('対局中の表示に相手の名前（「N 手目・テオ（入門）」）',/手目・テオ（入門）$/.test(r.seen.ply),r.seen.ply);
  ok('CPU の番は「テオが考えています…」',r.seen.think==='テオが考えています…',r.seen.think);
  // CPU が個性の重みで指していること: 実際の CPU の手を、同じ乱数で個性の重みを渡した choose と照合する
  const cmp=await pg.evaluate(()=>{const {G,E}=window.__origo;const LVs=[{depth:1,margin:70,blunder:.22}];let same=0,n=0,diffBase=0;
   for(let i=0;i+1<G.stack.length;i++){const s=G.stack[i];if(s.turn===G.human)continue;const m=G.stack[i+1].log[i];
    const rand=()=>E.rng((s.seed^Math.imul(s.ply+1,0x9E3779B1))>>>0);
    const w=window.__origo.PERSONA[0].w,a=E.choose(s,{...LVs[0],rand:rand(),w}),b=E.choose(s,{...LVs[0],rand:rand()});
    n++;if(a.from*49+a.to===m)same++;if(b.from*49+b.to!==m)diffBase++;}
   return {n,same,diffBase};});
  ok('CPU の手は、個性の重みを渡した choose と全手一致',cmp.n>0&&cmp.same===cmp.n,cmp);
  const title=await txt('#resTitle'),stat=await txt('#resStat');
  const wantT=r.a.res.winner===r.a.human?'テオに勝った':r.a.res.winner===0?'テオと引き分け':'テオに負けた';
  ok('結果画面に「テオに勝った／負けた」',title===wantT,{title,res:r.a.res});
  ok('通算の表示も名前（テオ（入門）との通算）',/^テオ（入門）との通算/.test(stat),stat);
  await pg.screenshot({path:`${out}/${name}-2result.png`});
  // ミラに負ける
  await tap('#resNew');await pg.waitForTimeout(150);
  if(!(await pg.$eval('#mdStart',e=>e.classList.contains('show')))){await tap('#btNew');await pg.waitForTimeout(150);}
  r=await playOut(1,1,80);
  const t2=await txt('#resTitle');
  const want2=r.a.res.winner===r.a.human?'ミラに勝った':r.a.res.winner===0?'ミラと引き分け':'ミラに負けた';
  ok('ミラとの対局: 結果画面に名前（'+want2+'）',t2===want2&&r.a.res.winner===-r.a.human,{t2,res:r.a.res});
  ok('ミラの対局中の表示（標準）',/手目・ミラ（標準）$/.test(r.seen.ply),r.seen.ply);
  await tap('#resNew');await pg.waitForTimeout(150);
  if(!(await pg.$eval('#mdStart',e=>e.classList.contains('show')))){await tap('#btNew');await pg.waitForTimeout(150);}

  // ================================================================ ふたりで対局（名前なし: 今まで通り）
  ok('名前なしの入口: 「金 0 勝・銀 0 勝」と「名前 金・銀」',/金 0 勝・銀 0 勝/.test(await txt('#stP2Sub'))&&(await txt('#stP2NamesSub'))==='金・銀');
  // 名前を入れる
  await tap('#stP2Names');await pg.waitForTimeout(150);
  ok('名前の入力が開く（8 文字まで）',await pg.$eval('#mdNames',e=>e.classList.contains('show'))&&await pg.$eval('#nmAu',e=>e.maxLength===8));
  await pg.fill('#nmAu','たろう');await pg.fill('#nmAg','<b>花子');await tap('#nmOk');await pg.waitForTimeout(150);
  ok('入口の集計に名前（たろう 0 勝・<b>花子 0 勝）',(await txt('#stP2Sub')).startsWith('たろう 0 勝・<b>花子 0 勝'),await txt('#stP2Sub'));
  ok('名前はこの端末に覚える',await pg.evaluate(()=>JSON.parse(localStorage.getItem('origo.p2names')).ag==='<b>花子'));
  await pg.screenshot({path:`${out}/${name}-3title-names.png`});
  // 8 文字を超える名前は 8 文字に（貼り付けなどで maxlength を越えたときも）
  const cut=await pg.evaluate(()=>{const s=window.__origo;return s.cleanName('あいうえおかきくけこ')+'|'+s.cleanName('  空白 ')+'|'+[...s.cleanName('😀😀😀😀😀😀😀😀😀')].length;});
  ok('9 文字以上は 8 文字に切る（絵文字も 1 文字）・前後の空白は除く',cut==='あいうえおかきく|空白|8',cut);
  await tap('#stP2');await pg.waitForTimeout(400);
  let st=await txt('#stText');
  ok('手番の表示が「たろうさんの番です」',st==='たろうさんの番です',st);
  const toast=await pg.$eval('#turnToast b',e=>e.textContent);
  ok('手番の知らせも名前（記号はそのまま文字として出る）',toast==='たろうさんの番です',toast);
  await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:1,margin:0,rand:E.rng(3)}));});
  await pg.waitForTimeout(100);await waitIdle();await pg.waitForTimeout(200);
  st=await txt('#stText');const toast2=await pg.$eval('#turnToast b',e=>e.textContent);
  ok('銀の番は「<b>花子さんの番です」（HTML として解釈しない）',st.startsWith('<b>花子さんの番です')&&toast2==='<b>花子さんの番です'&&!(await pg.$('#turnToast b b')),{st,toast2});
  ok('取った駒の見出しも名前',(await txt('#capMeT'))==='たろうが取った駒'&&(await txt('#capOpT'))==='<b>花子が取った駒');
  await pg.screenshot({path:`${out}/${name}-4p2-turn.png`});
  const code=await pg.evaluate(()=>window.__origo.Resign.encode(window.__origo.G.s));
  ok('棋譜コードに名前は入らない（形式は今のまま）',/^ORIGO1\.[ab]\.[0-9a-z]+\.[0-9a-zA-M]*$/.test(code)&&!/たろう|花子/.test(code),code);
  // 花子（銀）が投了
  for(let k=0;k<5;k++){await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:2,margin:0,rand:E.rng(G.s.ply+9)}));});await pg.waitForTimeout(80);await waitIdle();}
  let a=await A();if(a.turn!==-1){await pg.evaluate(()=>{const {G,E,play}=window.__origo;play(E.choose(G.s,{depth:2,margin:0,rand:E.rng(77)}));});await waitIdle();}
  await pg.waitForTimeout(300);
  await tap('#btResign');await pg.waitForTimeout(100);await tap('#rsYes');await pg.waitForTimeout(1300);
  ok('結果「たろうの勝ち」・「N 手で投了（<b>花子）」',(await txt('#resTitle'))==='たろうの勝ち'&&/手で投了（<b>花子）$/.test(await txt('#resSub')),{t:await txt('#resTitle'),s:await txt('#resSub')});
  ok('結果の通算も名前',/^この端末の通算　たろう 1 勝・<b>花子 0 勝/.test(await txt('#resStat')),await txt('#resStat'));
  await pg.screenshot({path:`${out}/${name}-5p2-result.png`});
  await tap('#resReview');for(let k=0;k<400;k++){if(await pg.evaluate(()=>window.__origo.G.rv&&window.__origo.G.rv.ready))break;await pg.waitForTimeout(50);}
  const rvt=await txt('#rvText'),note=await txt('#rvGraphNote');
  ok('ふりかえりの視点の表示に名前（<b>花子（敗れた側）／<b>花子から見て）',rvt.includes('<b>花子（敗れた側）')&&note.includes('<b>花子から見て'),{rvt:rvt.slice(0,40),note:note.slice(0,20)});
  await pg.screenshot({path:`${out}/${name}-6p2-review.png`});
  await tap('#rvClose');await pg.waitForTimeout(200);
  // 名前を消すと、今まで通り
  await tap('#res2Title');await pg.waitForTimeout(200);
  await tap('#stP2Names');await pg.waitForTimeout(100);await tap('#nmClear');await tap('#nmOk');await pg.waitForTimeout(100);
  ok('名前を消すと入口は「金 1 勝・銀 0 勝」「金・銀」',/^金 1 勝・銀 0 勝/.test(await txt('#stP2Sub'))&&(await txt('#stP2NamesSub'))==='金・銀',await txt('#stP2Sub'));
  await tap('#stP2');await pg.waitForTimeout(400);
  ok('名前なしの手番の表示は「金の番です」（今まで通り）',(await txt('#stText'))==='金の番です'&&(await pg.$eval('#turnToast b',e=>e.textContent))==='金の番です');
  // 再読み込み後も名前を覚えている
  await pg.evaluate(()=>localStorage.setItem('origo.p2names',JSON.stringify({au:'あお',ag:''})));await pg.reload();await pg.waitForTimeout(300);
  ok('再読み込み後も名前を覚えている（片方だけでもよい）',(await txt('#stP2NamesSub'))==='あお・銀'&&/^あお 1 勝・銀 0 勝/.test(await txt('#stP2Sub')),await txt('#stP2NamesSub'));
  await pg.close();
 }
 const bad=results.filter(r=>!r.ok);
 console.log('\n'+(bad.length?'NG '+bad.length+' 件 / '+results.length:'全 '+results.length+' 項目 OK'));
 console.log('errors',errs);
 await br.close();
 process.exit(bad.length||errs.length?1:0);
})();
