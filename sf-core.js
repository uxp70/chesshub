/* ChessHub Stockfish core: deep hints, Stockfish eval bar and Stockfish bots. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var Orig=window.__OrigChess||window.Chess;
if(!Orig){return;}
var SF_URL='./stockfish/stockfish-19-lite-single.js';
var HINT_GO='depth 24 movetime 3500';
var EVAL_GO='depth 12 movetime 150';
var UNI={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟︎'};
var worker=null,ready=null,readyOk=false,listeners=[],chain=Promise.resolve(),current=null;
var evalToken=0,lastHandledFen=null,botBusy=false,reviewShown=false,running=false;
var whiteView=true,originalHint=null;
function log(){try{console.log.apply(console,['[SF]'].concat([].slice.call(arguments)));}catch(e){}}
function send(cmd){if(worker){worker.postMessage(cmd);}}
function onLine(fn){listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0){listeners.splice(i,1);}};}
function emit(line){var i,c=listeners.slice();for(i=0;i<c.length;i++){try{c[i](line);}catch(e){log(e);}}}
function words(s){var a=s.split(' '),o=[],i;for(i=0;i<a.length;i++){if(a[i]){o.push(a[i]);}}return o;}
function startEngine(){
  if(ready){return ready;}
  ready=new Promise(function(resolve,reject){
    try{worker=new Worker(SF_URL);}catch(e){reject(e);return;}
    worker.onmessage=function(ev){var d=ev&&ev.data;if(typeof d!=='string'){if(d&&typeof d.data==='string'){d=d.data;}else{return;}}emit(String(d).trim());};
    worker.onerror=function(e){log('worker error',e);};
    var done=false;
    var off=onLine(function(line){if(line==='uciok'&&!done){done=true;off();readyOk=true;send('setoption name Hash value 128');send('setoption name Threads value 1');send('setoption name MultiPV value 1');configureFull();resolve();}});
    send('uci');
    setTimeout(function(){if(!done){reject(new Error('Stockfish did not load'));}},20000);
  });
  return ready;
}
function parseInfo(line){
  var p=words(line),o={},i;
  for(i=0;i<p.length;i++){
    if(p[i]==='depth'){o.depth=parseInt(p[i+1],10);}
    else if(p[i]==='seldepth'){o.seldepth=parseInt(p[i+1],10);}
    else if(p[i]==='nodes'){o.nodes=parseInt(p[i+1],10);}
    else if(p[i]==='nps'){o.nps=parseInt(p[i+1],10);}
    else if(p[i]==='score'){if(p[i+1]==='cp'){o.cp=parseInt(p[i+2],10);i+=2;}else if(p[i+1]==='mate'){o.mate=parseInt(p[i+2],10);i+=2;}}
    else if(p[i]==='pv'){o.pv=p.slice(i+1);break;}
  }
  return o;
}
function doSearch(fen,go){
  return new Promise(function(resolve,reject){
    if(!worker){reject(new Error('Stockfish not loaded'));return;}
    var st={info:{},done:false};
    current=st;
    var timer=null;
    var off=onLine(function(line){
      if(line.indexOf('bestmove')===0){var b=words(line);st.info.best=(b[1]&&b[1]!=='(none)')?b[1]:null;finish();return;}
      if(line.indexOf('info')!==0){return;}
      var o=parseInfo(line);
      if(o.depth){st.info.depth=o.depth;}
      if(o.seldepth){st.info.seldepth=o.seldepth;}
      if(o.nodes){st.info.nodes=o.nodes;}
      if(o.nps){st.info.nps=o.nps;}
      if(typeof o.cp==='number'){st.info.cp=o.cp;st.info.mate=null;}
      if(typeof o.mate==='number'){st.info.mate=o.mate;st.info.cp=null;}
      if(o.pv){st.info.pv=o.pv;}
    });
    function finish(){
      if(st.done){return;}
      st.done=true;
      if(timer){clearTimeout(timer);}
      off();
      if(current===st){current=null;}
      resolve({best:st.info.best||null,depth:st.info.depth||0,seldepth:st.info.seldepth||0,nodes:st.info.nodes||0,nps:st.info.nps||0,cp:(typeof st.info.cp==='number')?st.info.cp:null,mate:(typeof st.info.mate==='number')?st.info.mate:null,pv:st.info.pv||[]});
    }
    timer=setTimeout(function(){if(st.done){return;}send('stop');st.done=true;off();if(current===st){current=null;}reject(new Error('Stockfish timeout'));},20000);
    send('position fen '+fen);
    send('go '+go);
  });
}
function search(fen,go,setup){
  var run=function(){if(setup){setup();}return doSearch(fen,go);};
  var p=chain.then(run,run);
  chain=p.then(function(){},function(){});
  return p;
}
function skillFor(elo){if(elo<500){return 0;}if(elo<800){return 1;}if(elo<1000){return 3;}if(elo<1300){return 6;}if(elo<1500){return 9;}if(elo<1700){return 12;}return 15;}
function configureBot(elo){
  send('setoption name MultiPV value 1');
  send('setoption name Skill Level value '+skillFor(elo));
  if(elo>=1320){send('setoption name UCI_LimitStrength value true');send('setoption name UCI_Elo value '+Math.min(3190,Math.max(1320,Math.round(elo))));}
  else{send('setoption name UCI_LimitStrength value false');}
}
function configureFull(){send('setoption name UCI_LimitStrength value false');send('setoption name Skill Level value 20');send('setoption name MultiPV value 1');}
function botGo(elo){if(elo<500){return 'depth 1 movetime 150';}if(elo<800){return 'depth 2 movetime 250';}if(elo<1000){return 'depth 3 movetime 350';}if(elo<1300){return 'depth 5 movetime 500';}if(elo<1600){return 'depth 8 movetime 700';}return 'depth 12 movetime 1000';}
function whiteCp(res,turn){
  var cp;
  if(res&&res.mate!==null&&typeof res.mate==='number'){cp=res.mate>0?100000:-100000;}
  else{cp=(res&&typeof res.cp==='number')?res.cp:0;}
  return turn==='w'?cp:-cp;
}
function evalText(res,turn){
  if(res&&res.mate!==null&&typeof res.mate==='number'){var m=turn==='w'?res.mate:-res.mate;if(m===0){return '#0';}return m>0?('#'+m):('#-'+Math.abs(m));}
  var cp=(res&&typeof res.cp==='number')?res.cp:0;
  return (cp>=0?'+':'')+(cp/100).toFixed(2);
}
function uciToSan(fen,uci){
  if(!uci){return '—';}
  var g=new Orig(fen),mv;
  try{mv=g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci.slice(4,5)||undefined});}catch(e){return uci;}
  return mv?mv.san:uci;
}
function pvToSan(fen,pv,max){
  if(!pv||!pv.length){return '';}
  var g=new Orig(fen),out=[],i,u,mv;
  max=max||6;
  for(i=0;i<pv.length&&i<max;i++){u=pv[i];try{mv=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.slice(4,5)||undefined});}catch(e){break;}if(!mv){break;}out.push(mv.san);}
  return out.join(' ');
}
function el(tag,cls,text){var e=document.createElement(tag);if(cls){e.className=cls;}if(text!==undefined&&text!==null){e.textContent=text;}return e;}
function setBar(res,turn){
  var fill=$('evalFill'),num=$('evalNum');
  if(!fill||!num){return;}
  var cp=whiteCp(res,turn);
  var wv=100/(1+Math.exp(-0.004*cp));
  fill.style.height=wv+'%';
  num.textContent=evalText(res,turn);
  num.style.color=wv>55?'#fff':'#111';
}
function kingSq(g,color){var b=g.board(),r,c,p;for(r=0;r<8;r++){for(c=0;c<8;c++){p=b[r][c];if(p&&p.type==='k'&&p.color===color){return 'abcdefgh'[c]+(8-r);}}}return null;}
function drawBoard(g){
  var b=$('board');if(!b){return;}
  var coord=document.querySelector('#board .coord.r');
  if(coord){whiteView=coord.textContent==='8';}
  b.innerHTML='';
  var rows=whiteView?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  var cols=whiteView?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  var board=g.board(),hist=g.history({verbose:true}),last=hist.length?hist[hist.length-1]:null,checkSq=null,ri,ci,r,c,d,nm,p,s;
  if(g.in_check()){checkSq=kingSq(g,g.turn());}
  for(ri=0;ri<8;ri++){for(ci=0;ci<8;ci++){
    r=rows[ri];c=cols[ci];d=document.createElement('div');
    d.className='sq '+(((r+c)%2===1)?'light':'dark');
    nm='abcdefgh'[c]+(8-r);
    if(last&&(last.from===nm||last.to===nm)){d.classList.add('last');}
    if(checkSq===nm){d.classList.add('check');}
    p=board[r][c];
    if(p){s=document.createElement('span');s.className='pc';s.textContent=UNI[p.type];d.appendChild(s);d.classList.add(p.color);}
    b.appendChild(d);
  }}
}
function xy(sq){var f=sq.charCodeAt(0)-97,r=8-parseInt(sq[1],10);if(!whiteView){f=7-f;r=7-r;}return [f+0.5,r+0.5];}
function drawArrow(uci,force){
  var svg=$('arrows');if(!svg){return;}
  svg.innerHTML='';
  if(!uci){return;}
  if(!force){var chk=$('showBestChk');if(chk&&!chk.checked){return;}}
  var coord=document.querySelector('#board .coord.r');
  if(coord){whiteView=coord.textContent==='8';}
  var a=xy(uci.slice(0,2)),b=xy(uci.slice(2,4));
  var line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);
  line.setAttribute('stroke','#2ebd5b');line.setAttribute('stroke-width','0.2');line.setAttribute('stroke-linecap','round');line.setAttribute('opacity','0.85');
  svg.appendChild(line);
  var dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx',b[0]);dot.setAttribute('cy',b[1]);dot.setAttribute('r','0.3');dot.setAttribute('fill','#2ebd5b');
  svg.appendChild(dot);
}
function sansFromDom(){
  var lis=document.querySelectorAll('#moveList li'),out=[],i,j,k,clone,text,parts,t;
  for(i=0;i<lis.length;i++){
    clone=lis[i].cloneNode(true);
    var tags=clone.querySelectorAll('.tag');
    for(j=0;j<tags.length;j++){if(tags[j].parentNode){tags[j].parentNode.removeChild(tags[j]);}}
    text=clone.textContent.replace(/[0-9]+\./g,' ');
    parts=words(text);
    for(k=0;k<parts.length;k++){
      t=parts[k];
      if(/^(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?$/.test(t)){out.push(t);}
    }
  }
  return out;
}
function getLiveGame(){
  var sans=sansFromDom(),games=window.__chessGames||[],fallback=null,i,j,g,h,ok;
  for(i=games.length-1;i>=0;i--){
    g=games[i];
    if(g.__sfHasFen){continue;}
    try{h=g.history();}catch(e){continue;}
    if(!fallback){fallback=g;}
    if(h.length===sans.length){
      ok=true;
      for(j=0;j<h.length;j++){if(h[j]!==sans[j]){ok=false;break;}}
      if(ok){return g;}
    }
  }
  return fallback;
}
function modeName(){var b=document.querySelector('#modeSeg button.active');return b?b.getAttribute('data-mode'):'';}
function botElo(){var b=document.querySelector('#botList .bot.active .elo'),m=b?b.textContent.match(/[0-9]+/):null;return m?parseInt(m[0],10):900;}
function playerSide(){
  var b=document.querySelector('#colorSeg button.active');
  var c=b?b.getAttribute('data-color'):'w';
  if(c==='w'||c==='b'){return c;}
  var coord=document.querySelector('#board .coord.r');
  return (!coord||coord.textContent==='8')?'w':'b';
}
function syncBoard(){var f=$('flipBtn');if(f){f.click();f.click();return;}var b=$('board');if(b){var sq=b.querySelectorAll('.sq');if(sq.length){sq[0].click();}}}
function maybeBot(){
  if(!readyOk||running||reviewShown||botBusy){return;}
  if(modeName()!=='bot'){return;}
  var g=getLiveGame();
  if(!g||g.game_over()){return;}
  var ps=playerSide();
  if(!ps||g.turn()===ps){return;}
  var fen=g.fen();
  if(fen===lastHandledFen){return;}
  if(window.__clearBotTimers){window.__clearBotTimers();}
  botBusy=true;
  var elo=botElo();
  search(fen,botGo(elo),function(){configureBot(elo);}).then(function(res){
    botBusy=false;configureFull();
    if(g!==getLiveGame()||g.fen()!==fen){return;}
    var made=null;
    if(res&&res.best){try{made=g.move({from:res.best.slice(0,2),to:res.best.slice(2,4),promotion:res.best.slice(4,5)||undefined});}catch(e){made=null;}}
    if(!made){var ms=g.moves({verbose:true});if(ms.length){made=g.move(ms[Math.floor(Math.random()*ms.length)]);}}
    lastHandledFen=g.fen();
    if(made){syncBoard();}
  }).catch(function(e){
    botBusy=false;configureFull();log('bot failed',e);
    if(g.fen()!==fen){return;}
    var ms=g.moves({verbose:true});
    if(ms.length){g.move(ms[Math.floor(Math.random()*ms.length)]);lastHandledFen=g.fen();syncBoard();}
  });
}
function updateEvalBar(){
  if(running||reviewShown||botBusy){return;}
  if(!readyOk){startEngine().then(function(){setTimeout(updateEvalBar,0);}).catch(function(){});return;}
  var g=getLiveGame();if(!g){return;}
  var fen=g.fen(),turn=g.turn(),token=++evalToken;
  search(fen,EVAL_GO,configureFull).then(function(res){if(token!==evalToken){return;}setBar(res,turn);}).catch(function(){});
}
function schedule(){
  if(window.__sfTimer){clearTimeout(window.__sfTimer);}
  window.__sfTimer=setTimeout(function(){
    var g=getLiveGame();
    if(g&&g.history().length===0){lastHandledFen=null;reviewShown=false;try{document.dispatchEvent(new Event('sf-newgame'));}catch(e){}}
    maybeBot();
    if(!running&&!reviewShown&&!botBusy){updateEvalBar();}
  },50);
}
function watch(){
  var obs=new MutationObserver(schedule),ids=['moveList','status','resultCard','board'],i,e;
  for(i=0;i<ids.length;i++){e=$(ids[i]);if(e){obs.observe(e,{childList:true,subtree:true,characterData:true});}}
}
function fallbackHint(ev){if(originalHint){try{originalHint.call($('hintBtn'),ev);}catch(e){log(e);}}}
function deepHint(ev){
  if(running){alert('Stop the review first.');return;}
  var g=getLiveGame();
  if(!g){fallbackHint(ev);return;}
  if(g.game_over()){return;}
  var fen=g.fen(),th=$('thinking'),lineEl=$('engineLine');
  if(th){th.classList.remove('hidden');}
  if(lineEl){lineEl.textContent='Stockfish is thinking (depth 24)…';}
  var tab=$('tabAnalyse');if(tab&&$('panelAnalyse')&&$('panelAnalyse').classList.contains('hidden')){tab.click();}
  startEngine().then(function(){return search(fen,HINT_GO,configureFull);}).then(function(res){
    if(th){th.classList.add('hidden');}
    var txt='Stockfish depth '+(res.depth||'?')+' · best '+uciToSan(fen,res.best)+' ('+evalText(res,new Orig(fen).turn())+')';
    if(res.pv&&res.pv.length){txt+=' · line '+pvToSan(fen,res.pv,6);}
    if(lineEl){lineEl.textContent=txt;}
    drawArrow(res.best,true);
  }).catch(function(e){if(th){th.classList.add('hidden');}log('hint failed',e);fallbackHint(ev);});
}
window.SF={search:search,startEngine:startEngine,configureFull:configureFull,Orig:Orig,$:$,el:el,setBar:setBar,evalText:evalText,whiteCp:whiteCp,uciToSan:uciToSan,pvToSan:pvToSan,drawBoard:drawBoard,drawArrow:drawArrow,getLiveGame:getLiveGame,stop:function(){if(current){send('stop');}},setRunning:function(v){running=v;},setReviewShown:function(v){reviewShown=v;},isReviewShown:function(){return reviewShown;},winPct:function(cp){return 100/(1+Math.exp(-0.0038*cp));},winFor:function(cp,t){var w=100/(1+Math.exp(-0.0038*cp));return t==='w'?w:100-w;},accFor:function(d){return Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*Math.max(0,d))-3.1669));},avg:function(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:null;},fmtAcc:function(a){return a===null?'–':a.toFixed(1);},book:BOOK,tags:TAGS,val:VAL};
(function(){
  var hb=$('hintBtn');
  if(hb){originalHint=hb.onclick;hb.onclick=null;hb.addEventListener('click',deepHint);}
  watch();
  startEngine().catch(function(){});
  schedule();
})();
})();
