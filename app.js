/* ChessHub — static chess: bots + P2P + analysis. Requires chess.js + peerjs CDN. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const boardEl=$('board'),arrowsEl=$('arrows'),statusEl=$('status'),moveListEl=$('moveList'),
evalFill=$('evalFill'),evalNum=$('evalNum'),thinkingEl=$('thinking');

const BOTS=[
 {name:"Rookie Robbie",elo:300,avatar:"🐣",depth:1,rand:260,blunder:0.28,style:"Plays random hopeful moves. Great for day 1.",q:false},
 {name:"Casual Carla",elo:600,avatar:"🦊",depth:1,rand:130,blunder:0.16,style:"Knows the basics, hangs pieces sometimes.",q:false},
 {name:"Club Karl",elo:900,avatar:"♟️",depth:2,rand:80,blunder:0.10,style:"Solid club player. Punishes obvious blunders.",q:false},
 {name:"Expert Emma",elo:1200,avatar:"🦉",depth:2,rand:35,blunder:0.05,style:"Sees tactics 2 moves deep. Rarely blunders.",q:true},
 {name:"Master Milo",elo:1500,avatar:"🐺",depth:3,rand:18,blunder:0.03,style:"Deep calculation, strong positional play.",q:true},
 {name:"Grandmaster Gus",elo:1850,avatar:"👑",depth:3,rand:8,blunder:0.015,style:"Near-perfect. You have been warned.",q:true},
];
let game=new Chess();
let mode='bot', botIdx=2, playerColor='w', orientation='w';
let selected=null, legalCache=[], review=null, reviewIdx=0, showBest=true;
let myNetColor='w', peer=null, conn=null, isHost=false, netOn=false, gameOver=false;
let soundOn=true, audioCtx=null;

const UNI={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟︎'};
const VAL={p:100,n:320,b:330,r:500,q:900,k:0};
// PST from white POV, row0=rank8
const PST={
p:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
r:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
k:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
};

function evaluate(chess){
  const b=chess.board(); let s=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const sq=b[r][c]; if(!sq)continue;
    const idx=r*8+c; let v=VAL[sq.type]+PST[sq.type][idx];
    // black mirrors table
    if(sq.color==='b'){ const mr=(7-r)*8+c; v=VAL[sq.type]+PST[sq.type][mr]; s-=v; } else s+=v;
  }
  // mobility tiny
  return s;
}
const MATE=100000;
function alphabeta(g,depth,alpha,beta,ply,useQ){
  if(g.in_checkmate()){ return g.turn()==='w' ? -MATE+ply : MATE-ply; }
  if(g.in_draw()||g.in_stalemate()||g.in_threefold_repetition()||g.insufficient_material()) return 0;
  if(depth<=0){
    if(useQ) return quiesce(g,alpha,beta,ply,2);
    return evaluate(g);
  }
  const moves=g.moves({verbose:true});
  orderMoves(g,moves);
  const white=g.turn()==='w';
  if(white){
    let best=-Infinity;
    for(const m of moves){ g.move(m); const s=alphabeta(g,depth-1,alpha,beta,ply+1,useQ); g.undo();
      if(s>best)best=s; if(s>alpha)alpha=s; if(alpha>=beta)break; }
    return best;
  }else{
    let best=Infinity;
    for(const m of moves){ g.move(m); const s=alphabeta(g,depth-1,alpha,beta,ply+1,useQ); g.undo();
      if(s<best)best=s; if(s<beta)beta=s; if(alpha>=beta)break; }
    return best;
  }
}
function quiesce(g,alpha,beta,ply,d){
  const stand=evaluate(g);
  if(g.turn()==='w'){ if(stand>=beta)return beta; if(stand>alpha)alpha=stand; }
  else{ if(stand<=alpha)return alpha; if(stand<beta)beta=stand; }
  if(d<=0)return stand;
  const moves=g.moves({verbose:true}).filter(m=>m.captured||m.promotion);
  orderMoves(g,moves);
  const white=g.turn()==='w';
  for(const m of moves){ g.move(m);
    const s=g.in_checkmate()?(g.turn()==='w'?-MATE+ply:MATE-ply):quiesce(g,alpha,beta,ply+1,d-1);
    g.undo();
    if(white){ if(s>alpha)alpha=s; if(alpha>=beta)break; } else { if(s<beta)beta=s; if(alpha>=beta)break; }
  }
  return white?alpha:beta;
}
function orderMoves(g,moves){
  for(const m of moves){ m._s=(m.captured?(10*({p:1,n:3,b:3,r:5,q:9,k:0}[m.captured]||1)-({p:1,n:3,b:3,r:5,q:9}[m.piece]||0)):0)+(m.promotion?50:0)+(m.san.includes('+')?10:0); }
  moves.sort((a,b)=>b._s-a._s);
}
function findBest(fen,depth,randJitter,useQ){
  const g=new Chess(fen);
  if(g.game_over())return null;
  const moves=g.moves({verbose:true});
  if(!moves.length)return null;
  orderMoves(g,moves);
  const white=g.turn()==='w';
  let best=null,bestScore=white?-Infinity:Infinity,scored=[];
  for(const m of moves){
    g.move(m);
    let s;
    if(g.in_checkmate()) s=g.turn()==='w'?-MATE:MATE;
    else s=depth<=1&&!useQ?evaluate(g):alphabeta(g,depth-1,-Infinity,Infinity,1,useQ);
    g.undo();
    const jitter=(Math.random()*2-1)*randJitter;
    const sj=s+(white?jitter:-jitter);
    scored.push({m,s,sj});
    if(white? sj>bestScore : sj<bestScore){bestScore=sj;best={m,s};}
  }
  scored.sort((a,b)=>white?b.sj-a.sj:a.sj-b.sj);
  return {move:best.m,score:best.s,ranked:scored};
}
function botDef(){return BOTS[botIdx];}
function maybeBotMove(){
  if(gameOver)return;
  if(mode==='bot'){
    const bot=botDef();
    const botColor=playerColor==='w'?'b':'w';
    if(game.turn()!==botColor)return;
    thinkingEl.classList.remove('hidden');
    setTimeout(()=>{
      thinkingEl.classList.add('hidden');
      // blunder: random move
      const moves=game.moves({verbose:true});
      if(!moves.length)return;
      let picked;
      if(Math.random()<bot.blunder){ picked=moves[Math.floor(Math.random()*moves.length)]; }
      else{
        const r=findBest(game.fen(),bot.depth,bot.rand,bot.q);
        picked=r?r.move:moves[0];
      }
      doMove(picked.from,picked.to,picked.promotion||'q');
    },350+Math.random()*500);
  }
}
// ---------- rendering ----------
function beep(freq,dur,type){
  if(!soundOn)return;
  try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type||'sine';o.frequency.value=freq;g.gain.value=0.08;
    o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}
function sqName(r,c){return 'abcdefgh'[c]+(8-r);}
function render(){
  const disp=orientation==='w'?game.fen():flipFenView();
  // we render from game.board() but reorder for black orientation
  boardEl.innerHTML='';
  const b=game.board();
  const rows=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const cols=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const last=lastMoveSquares();
  const inCheckSq=game.in_check()?kingSquare(game.turn()):null;
  for(const r of rows)for(const c of cols){
    const d=document.createElement('div');
    const light=(r+c)%2===1;
    d.className='sq '+(light?'light':'dark');
    d.dataset.r=r;d.dataset.c=c;
    const nm=sqName(r,c);
    if(last.includes(nm))d.classList.add('last');
    if(inCheckSq===nm)d.classList.add('check');
    if(selected===nm)d.classList.add('sel');
    if(r===7&&(orientation==='w'?c===0:c===7)||r===0&&(orientation==='w'?c===0:c===7)){}
    // coords
    if((orientation==='w'&&c===0)||(orientation==='b'&&c===7)){
      const s=document.createElement('span');s.className='coord r';s.textContent=8-r;d.appendChild(s);
    }
    if((orientation==='w'&&r===7)||(orientation==='b'&&r===0)){
      const s=document.createElement('span');s.className='coord f';s.textContent='abcdefgh'[c];d.appendChild(s);
    }
    const p=b[r][c];
    if(p){const s=document.createElement('span');s.className='pc';s.textContent=UNI[p.type];
      const w=document.createElement('span');w.className=p.color;w.appendChild(s);
      const wrap=document.createElement('span');wrap.className='sq '+p.color;wrap.appendChild(s);d.appendChild(s);d.classList.add(p.color);}
    if(legalCache.some(m=>m.to===nm)){
      const dot=document.createElement('span');
      dot.className=b[r][c]?'cap':'dot';d.appendChild(dot);
    }
    d.onclick=()=>onSquare(r,c);
    boardEl.appendChild(d);
  }
  renderMoves();updateStatus();drawBestArrow();
}
function flipFenView(){return game.fen();}
function kingSquare(color){const b=game.board();for(let r=0;r<8;r++)for(let c=0;c<8;c++){const s=b[r][c];if(s&&s.type==='k'&&s.color===color)return sqName(r,c);}return null;}
function lastMoveSquares(){
  const h=game.history({verbose:true});if(!h.length)return[];
  const l=h[h.length-1];return[l.from,l.to];
}
function renderMoves(){
  moveListEl.innerHTML='';
  const h=game.history();
  const cls=review&&review.classes.length===h.length?review.classes:[];
  for(let i=0;i<h.length;i+=2){
    const li=document.createElement('li');
    li.dataset.ply=i;
    let txt=(i/2+1)+'. '+h[i];
    if(h[i+1])txt+=' '+h[i+1];
    // tags
    const t1=cls[i]?'<span class="tag '+cls[i].label+'">'+cls[i].icon+'</span>':'';
    const t2=cls[i+1]?'<span class="tag '+cls[i+1].label+'">'+cls[i+1].icon+'</span>':'';
    li.innerHTML=txt+' '+t1+' '+t2;
    if(reviewIdx===i||reviewIdx===i+1)li.classList.add('cur');
    li.onclick=()=>{ if(review){reviewIdx=Math.min(i+1,h.length-1);jumpToPly(reviewIdx+1);} };
    moveListEl.appendChild(li);
  }
  moveListEl.scrollTop=moveListEl.scrollHeight;
}
function updateStatus(){
  let t;
  if(game.in_checkmate()){const w=game.turn()==='w'?'Black':'White';t='Checkmate — '+w+' wins';endGame(w+' wins by checkmate');}
  else if(game.in_draw()){t='Draw — '+drawReason();endGame('Draw ('+drawReason()+')');}
  else if(game.in_stalemate()){t='Draw — stalemate';endGame('Draw (stalemate)');}
  else{const w=game.turn()==='w'?'White':'Black';t=w+' to move'+(game.in_check()?' — check!':'');}
  statusEl.textContent=t+(netOn?(' • '+(game.turn()===myNetColor?'your move':'waiting…')):'');
  const cp=currentEvalCp();
  setEvalBar(cp);
}
function drawReason(){if(game.in_threefold_repetition())return'threefold';if(game.insufficient_material())return'insufficient material';if(game.in_stalemate())return'stalemate';return'50-move rule';}
function currentEvalCp(){
  if(review&&review.evalsByPly&&review.evalsByPly.length){const p=reviewIdxPly();return review.evalsByPly[p]??0;}
  return evaluate(game);
}
function reviewIdxPly(){ // number of plies shown (for live game = full)
  if(!review)return game.history().length;
  return review.pos+1;
}
function setEvalBar(cp){
  const wv=100/(1+Math.exp(-0.004*cp));
  evalFill.style.height=wv+'%';
  evalNum.textContent=(cp>=0?'+':'')+(cp/100).toFixed(1);
  evalNum.style.color=wv>55?'#fff':'#111';
}
function drawBestArrow(){
  arrowsEl.innerHTML='';
  if(!showBest||!review||!review.bestMoves)return;
  const bm=review.bestMoves[review.pos];
  if(!bm||bm.from===bm.to)return;
  const [x1,y1]=sqXY(bm.from),[x2,y2]=sqXY(bm.to);
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);
  line.setAttribute('stroke','#2ebd5b');line.setAttribute('stroke-width','0.22');line.setAttribute('stroke-linecap','round');line.setAttribute('opacity','0.9');
  arrowsEl.appendChild(line);
  const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx',x2);dot.setAttribute('cy',y2);dot.setAttribute('r','0.35');dot.setAttribute('fill','#2ebd5b');
  arrowsEl.appendChild(dot);
}
function sqXY(sq){
  let f=sq.charCodeAt(0)-97,r=8-parseInt(sq[1]);
  if(orientation==='b'){f=7-f;r=7-r;}
  return [f+0.5,r+0.5];
}
// ---------- input ----------
function onSquare(r,c){
  if(gameOver)return;
  if(netOn&&game.turn()!==myNetColor)return;
  if(mode==='bot'&&game.turn()!==playerColor&&game.history().length>0){
    // still allow observing but not moving when bot turn (bot moves automatically)
    if(game.turn()!==playerColor)return;
  }
  const nm=sqName(r,c);
  if(selected){
    const mv=legalCache.find(m=>m.to===nm);
    if(mv){ doMove(selected,nm,mv.promotion&&mv.promotion!=='?'?'q':undefined); selected=null;legalCache=[];render();return; }
  }
  const piece=game.get(nm);
  if(piece&&(mode!=='bot'||piece.color===game.turn())&&(!netOn||piece.color===myNetColor)){
    if(selected===nm){selected=null;legalCache=[];}
    else{selected=nm;legalCache=game.moves({square:nm,verbose:true});}
  }else{selected=null;legalCache=[];}
  render();
}
function doMove(from,to,promo){
  // auto-queen; upgrade to choice if pawn to last rank and UI later — keep queen for simplicity + knight popup skipped
  const piece=game.get(from);
  let promotion;
  if(piece&&piece.type==='p'&&((piece.color==='w'&&to[1]==='8')||(piece.color==='b'&&to[1]==='1')))promotion=promo||'q';
  const mv=game.move({from,to,promotion});
  if(!mv)return false;
  beep(mv.captured?520:440,0.08,mv.captured?'square':'sine');
  if(mv.san.includes('+'))setTimeout(()=>beep(660,0.1),90);
  gameOver=false;review=null;reviewIdx=game.history().length-1;
  render();
  if(netOn&&conn&&conn.open){try{conn.send({t:'move',from,to,promotion});}catch(e){}}
  maybeBotMove();
  return true;
}
// ---------- game controls ----------
function newGame(){
  game=new Chess();selected=null;legalCache=[];review=null;gameOver=false;
  if(mode==='bot'&&playerColor==='random')playerColor=Math.random()<0.5?'w':'b';
  orientation=(mode==='online')?myNetColor:playerColor==='w'?'w':'b';
  if(mode==='bot'&&playerColor==='b'){/* bot (white) starts */}
  render();maybeBotMove();
  $('resultCard').classList.add('hidden');
  if(netOn&&isHost&&conn&&conn.open){try{conn.send({t:'new'});}catch(e){}}
}
function endGame(msg){
  if(gameOver&&$('resultCard').textContent===msg)return;
  gameOver=true;
  const rc=$('resultCard');rc.classList.remove('hidden');
  rc.innerHTML='<b>'+msg+'</b><br><span class="muted">'+game.history().length+' plies • '+new Date().toLocaleTimeString()+'</span><br><button id="reviewNowBtn" class="primary">🔍 Analyse</button>';
  const b=$('reviewNowBtn');if(b)b.onclick=()=>{switchTab('Analyse');runReview();};
}
function undo(){
  if(netOn)return alert('Undo is disabled online — start a new game instead.');
  game.undo();if(mode==='bot')game.undo();
  gameOver=false;$('resultCard').classList.add('hidden');review=null;render();
}
// ---------- analysis ----------
function winPct(cp){return 100/(1+Math.exp(-0.004*cp));}
function classifyLoss(loss,winBefore,winAfter,isBest,sac){
  const drop=winBefore-winAfter;
  if(isBest&&sac)return{label:'Brilliant',icon:'✨ Brilliant'};
  if(isBest&&drop<=2&&loss<=5)return{label:'Best',icon:'✓ Best'};
  if(isBest)return{label:'Great',icon:'❕ Great'};
  if(loss<=12)return{label:'Excellent',icon:'Excellent'};
  if(loss<=30)return{label:'Good',icon:'Good'};
  if(drop>=25||loss>=200)return{label:'Blunder',icon:'?? Blunder'};
  if(drop>=15||loss>=100)return{label:'Mistake',icon:'? Mistake'};
  if(drop>=8||loss>=55)return{label:'Miss',icon:'Miss'};
  if(loss>=30)return{label:'Inaccuracy',icon:'?! Inaccuracy'};
  return{label:'Good',icon:'Good'};
}
let reviewing=false;
async function runReview(){
  if(reviewing)return;
  const sans=game.history();if(!sans.length)return alert('Play some moves first (or load a PGN).');
  reviewing=true;$('runReviewBtn').disabled=true;$('stopReviewBtn').classList.remove('hidden');
  const g=new Chess();const evalsByPly=[evaluate(g)];const bestMoves=[];const classes=[];let wAcc=[],bAcc=[],wSum=0,bSum=0,wN=0,bN=0;
  const rs=$('reviewSummary');rs.innerHTML='<div class="muted">Analysing '+sans.length+' moves with local engine (depth 3)…</div>';
  $('engineLine').textContent='Thinking…';
  for(let i=0;i<sans.length;i++){
    if(!reviewing)break;
    const fen=g.fen();const turn=g.turn();
    const best=findBest(fen,3,0,true);
    const bestSan=best?g.moves({verbose:true}).find(m=>m.from===best.move.from&&m.to===best.move.to):null;
    const playedSan=sans[i];
    // material sacrifice check: compare captured values
    let sac=false;
    if(best){const bm=best.move;const pc=g.get(bm.from);
      if(bm.captured||(pc&&Math.abs(best.score)<50))sac=false;
      // brilliant heuristic: best move gives up material (moving piece en prise) but keeps eval
      const beforeMat=materialCount(g);
      const tmp=new Chess(fen);tmp.move({from:bm.from,to:bm.to,promotion:bm.promotion||undefined});
      const afterMat=materialCount(tmp)*(turn==='w'?1:-1);
      const beforeM=materialCount(g)*(turn==='w'?1:-1);
      if(afterMat<beforeM-150&&((turn==='w'&&best.score>30)||(turn==='b'&&best.score<-30)))sac=true;
    }
    // play the actual move
    const mv=g.move(playedSan);
    const after=findBest(g.fen(),2,0,true);
    const actualCp=after? (turn==='w'? after.score : after.score) : evaluate(g);
    // eval of position before (best) in white persp:
    const bestCp=best?best.score:evalsByPly[evalsByPly.length-1];
    const beforeCp=evalsByPly[evalsByPly.length-1];
    evalsByPly.push(actualCp);
    const loss=turn==='w'?(bestCp-actualCp):(actualCp-bestCp);
    const isBestMove=best&&mv&&best.move.from===mv.from&&best.move.to===mv.to;
    const wb=winPct(turn==='w'?beforeCp:beforeCp); // win for mover: convert
    // win from mover perspective:
    const winBefore=turn==='w'?winPct(beforeCp):100-winPct(beforeCp);
    const winAfter=turn==='w'?winPct(actualCp):100-winPct(actualCp);
    const cls=classifyLoss(Math.max(0,loss),winBefore,winAfter,!!isBestMove,sac);
    classes.push(cls);
    bestMoves.push(best?best.move:{from:mv.from,to:mv.to});
    const acc=Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*Math.max(0,winBefore-winAfter))-3.1669+(winAfter>=winBefore? (100-(103.1668*Math.exp(0)-3.1669)):0)));
    const accClamped=winAfter>=winBefore?100:acc;
    if(turn==='w'){wAcc.push(accClamped);}else{bAcc.push(accClamped);}
    $('engineLine').textContent='Move '+(i+1)+'/'+sans.length+': '+playedSan+' → '+cls.icon+' ('+Math.round(accClamped)+')';
    $('reviewSummary').innerHTML=progressHtml(wAcc,bAcc);
    await new Promise(r=>setTimeout(r,10));
  }
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  review={evalsByPly,bestMoves,classes,pos:sans.length-1,wAcc:avg(wAcc),bAcc:avg(bAcc)};
  reviewIdx=sans.length-1;
  $('reviewSummary').innerHTML=progressHtml(wAcc,bAcc,true)+
    '<div class="accbox"><div><b>White '+avg(wAcc).toFixed(1)+'</b><br><span class="muted">accuracy</span></div><div><b>Black '+avg(bAcc).toFixed(1)+'</b><br><span class="muted">accuracy</span></div></div>';
  $('accLine').textContent='W '+avg(wAcc).toFixed(0)+' • B '+avg(bAcc).toFixed(0);
  reviewing=false;$('runReviewBtn').disabled=false;$('stopReviewBtn').classList.add('hidden');
  $('engineLine').textContent='Review complete. Step with ◀ ▶. Green arrow = engine best move.';
  render();
  function progressHtml(w,b,done){
    const avg2=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'–';
    return '<div class="accbox"><div>White <b>'+avg2(w)+'</b></div><div>Black <b>'+avg2(b)+'</b></div><div>'+(done?'Done':'…analysing')+'</div></div>';
  }
}
function materialCount(g){const b=g.board();let s=0;for(const r of b)for(const q of r)if(q)s+=q.color==='w'?VAL[q.type]:-VAL[q.type];return s;}
function jumpToPly(n){ // n = plies to show
  if(!review){return;}
  review.pos=Math.max(-1,Math.min(game.history().length-1,n-1));
  reviewIdx=review.pos;
  // show position by replaying
  const sans=game.history();
  const tmp=new Chess();
  for(let i=0;i<=review.pos;i++)tmp.move(sans[i]);
  // temporarily render tmp position without destroying game: swap fen view
  renderPosition(tmp);
}
function renderPosition(tmp){
  // render arbitrary position + review overlays
  const keepFen=game.fen;
  // simplest: render board from tmp by monkey-patching: draw manually
  boardEl.innerHTML='';
  const b=tmp.board();
  const rows=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const cols=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  for(const r of rows)for(const c of cols){
    const d=document.createElement('div');
    d.className='sq '+(((r+c)%2===1)?'light':'dark');
    const nm=sqName(r,c);
    if(tmp.in_check()&&kingSquareTmp(tmp,tmp.turn())===nm)d.classList.add('check');
    const p=b[r][c];
    if(p){const s=document.createElement('span');s.className='pc';s.textContent=UNI[p.type];d.appendChild(s);d.classList.add(p.color);}
    boardEl.appendChild(d);
  }
  const sans=game.history();
  const idx=review.pos;
  statusEl.textContent=idx<0?'Starting position':('Move '+(idx+1)+': '+sans[idx]+(review.classes[idx]?' — '+review.classes[idx].icon:''));
  setEvalBar(review.evalsByPly[idx+1]??0);
  renderMoves();drawBestArrow();
  // highlight current li
  [...moveListEl.children].forEach((li,k)=>li.classList.toggle('cur',idx>=k*2&&idx<k*2+2));
}
function kingSquareTmp(t,color){const b=t.board();for(let r=0;r<8;r++)for(let c=0;c<8;c++){const s=b[r][c];if(s&&s.type==='k'&&s.color===color)return sqName(r,c);}return null;}
// ---------- tabs / setup ----------
function switchTab(which){
  for(const t of['Play','Analyse','Bots'])$('tab'+t).classList.toggle('active',t===which);
  $('panelPlay').classList.toggle('hidden',which!=='Play');
  $('panelAnalyse').classList.toggle('hidden',which!=='Analyse');
  $('panelBots').classList.toggle('hidden',which!=='Bots');
}
function buildBots(){
  const bl=$('botList');bl.innerHTML='';
  BOTS.forEach((b,i)=>{
    const btn=document.createElement('button');btn.className='bot'+(i===botIdx?' active':'');
    btn.innerHTML='<span class="avatar">'+b.avatar+'</span><span><span class="nm">'+b.name+'</span><br><span class="elo">Elo '+b.elo+' • '+(b.depth)+' ply • '+b.style+'</span></span>';
    btn.onclick=()=>{botIdx=i;mode='bot';setModeUI();buildBots();buildBotTable();newGame();};
    bl.appendChild(btn);
  });
}
function buildBotTable(){
  const t=$('botTable');t.innerHTML=BOTS.map((b,i)=>'<div class="bot'+(i===botIdx?' active':'')+'" data-i="'+i+'"><span class="avatar">'+b.avatar+'</span><span><span class="nm">'+b.name+' — '+b.elo+'</span><br><span class="elo">'+b.style+'</span></span></div>').join('');
  t.querySelectorAll('.bot').forEach(el=>el.onclick=()=>{botIdx=+el.dataset.i;buildBots();buildBotTable();if(mode==='bot')newGame();});
}
function setModeUI(){
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('botSetup').classList.toggle('hidden',mode!=='bot');
  $('onlineSetup').classList.toggle('hidden',mode!=='online');
}
// ---------- online (PeerJS P2P) ----------
function rndCode(){const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=A[Math.floor(Math.random()*A.length)];return s;}
function hostGame(){
  cleanupNet();
  const code=rndCode();const id='chesshub-v1-'+code;
  peer=new Peer(id);
  $('netStatus').textContent='Creating code…';
  peer.on('open',()=>{$('myCode').textContent=code;$('myCode').classList.remove('hidden');$('copyCodeBtn').classList.remove('hidden');$('netStatus').textContent='Share the code. Waiting for friend…';});
  peer.on('connection',c=>{conn=c;wireConn(true);});
  peer.on('error',e=>{$('netStatus').textContent='Net error: '+e.type;});
  isHost=true;myNetColor='w';netOn=true;mode='online';setModeUI();orientation='w';newGame();
  $('leaveNetBtn').classList.remove('hidden');
}
function joinGame(){
  const code=$('joinCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length<4)return alert('Enter the 6-letter code from your friend.');
  cleanupNet(true);
  peer=new Peer();
  $('netStatus').textContent='Connecting…';
  peer.on('open',()=>{conn=peer.connect('chesshub-v1-'+code,{reliable:true});wireConn(false);});
  peer.on('error',e=>{$('netStatus').textContent='Could not join ('+e.type+'). Check the code.';});
  isHost=false;myNetColor='b';netOn=true;mode='online';setModeUI();orientation='b';
  $('leaveNetBtn').classList.remove('hidden');
}
function wireConn(host){
  conn.on('open',()=>{$('netStatus').textContent=host?'Friend connected! You are White.':'Connected! You are Black.';newGame();render();});
  conn.on('data',d=>{
    if(d.t==='move'){game.move({from:d.from,to:d.to,promotion:d.promotion});gameOver=false;beep(440,0.08);render();}
    else if(d.t==='new'){newGame();}
  });
  conn.on('close',()=>{$('netStatus').textContent='Friend disconnected.';});
}
function cleanupNet(keepPeer){
  try{if(conn)conn.close();}catch(e){}
  try{if(peer&&!keepPeer)peer.destroy();}catch(e){}
  conn=null;if(!keepPeer){peer=null;netOn=false;}
}
// ---------- wire up ----------
$('tabPlay').onclick=()=>switchTab('Play');
$('tabAnalyse').onclick=()=>switchTab('Analyse');
$('tabBots').onclick=()=>switchTab('Bots');
document.querySelectorAll('#modeSeg button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;if(mode!=='online'&&netOn){cleanupNet();$('leaveNetBtn').classList.add('hidden');}setModeUI();newGame();});
document.querySelectorAll('#colorSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#colorSeg button').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  playerColor=b.dataset.color==='random'?'random':b.dataset.color;newGame();
});
$('newBtn').onclick=newGame;
$('undoBtn').onclick=undo;
$('flipBtn').onclick=()=>{orientation=orientation==='w'?'b':'w';render();};
$('soundBtn').onclick=e=>{soundOn=!soundOn;e.target.classList.toggle('on',soundOn);e.target.textContent=soundOn?'🔊':'🔇';};
$('resignBtn').onclick=()=>{if(gameOver)return;const loser=netOn? (myNetColor==='w'?'White':'Black') : (mode==='bot'?(playerColor==='w'?'White':'Black'):(game.turn()==='w'?'White':'Black'));endGame(loser+' resigned');};
$('hintBtn').onclick=()=>{
  thinkingEl.classList.remove('hidden');$('engineLine').textContent='Hint: thinking (depth 3)…';
  setTimeout(()=>{const r=findBest(game.fen(),3,0,true);thinkingEl.classList.add('hidden');
    if(!r)return;selected=r.move.from;legalCache=[r.move];render();
    $('engineLine').textContent='Hint: try '+r.move.from+' → '+r.move.to+' (eval '+(r.score/100).toFixed(2)+')';
    if($('panelAnalyse').classList.contains('hidden'))switchTab('Analyse');
  },30);
};
$('analyseBtn').onclick=()=>{switchTab('Analyse');runReview();};
$('runReviewBtn').onclick=runReview;
$('stopReviewBtn').onclick=()=>{reviewing=false;};
$('showBestChk').onchange=e=>{showBest=e.target.checked;render();};
$('prevBtn').onclick=()=>{if(review)jumpToPly(review.pos);};
$('nextBtn').onclick=()=>{if(review)jumpToPly(review.pos+2);};
$('firstBtn').onclick=()=>{if(review)jumpToPly(0);};
$('lastBtn').onclick=()=>{if(review)jumpToPly(game.history().length);};
$('pgnBtn').onclick=()=>{navigator.clipboard.writeText(game.pgn()).then(()=>alert('PGN copied'))};
$('loadPgnBtn').onclick=()=>{
  const v=$('pgnIn').value.trim();if(!v)return;
  try{
    const g=new Chess();let ok=false;
    if(g.load_pgn)ok=g.load_pgn(v);else if(g.loadPgn)ok=g.loadPgn(v);else ok=g.load(v);
    if(ok===false)throw new Error('bad pgn');
    game=g;review=null;gameOver=game.game_over();render();switchTab('Analyse');
  }catch(e){alert('Could not parse PGN.');}
};
$('loadFenBtn').onclick=()=>{
  const v=$('fenIn').value.trim();if(!v)return;
  try{const g=new Chess(v);game=g;review=null;render();}catch(e){alert('Bad FEN');}
};
$('hostBtn').onclick=hostGame;
$('joinBtn').onclick=joinGame;
$('copyCodeBtn').onclick=()=>navigator.clipboard.writeText($('myCode').textContent);
$('leaveNetBtn').onclick=()=>{cleanupNet();netOn=false;mode='bot';setModeUI();$('leaveNetBtn').classList.add('hidden');$('netStatus').textContent='';newGame();};
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'&&review)jumpToPly(review.pos);
  if(e.key==='ArrowRight'&&review)jumpToPly(review.pos+2);
});
// init
buildBots();buildBotTable();setModeUI();render();
})();
