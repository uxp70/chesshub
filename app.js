/* ChessHub — static chess: rated bots, P2P play, and chess.com-style analysis.
   Requires chess.js + peerjs (CDN). Everything runs in the browser. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const boardEl=$('board'),arrowsEl=$('arrows'),statusEl=$('status'),moveListEl=$('moveList'),
evalFill=$('evalFill'),evalNum=$('evalNum'),thinkingEl=$('thinking');

/* ------------------------------------------------------------------ *
 *  Bots
 * ------------------------------------------------------------------ */
const BOTS=[
 {name:"Sprout",elo:300,avatar:"🌱",depth:1,rand:250,blunder:0.26,time:0,q:false,style:"Fresh to the board. Nearly random, perfect for a first game."},
 {name:"Pixel",elo:600,avatar:"🕹️",depth:1,rand:110,blunder:0.15,time:0,q:false,style:"Knows how the pieces move and occasionally finds a good idea."},
 {name:"Mira",elo:900,avatar:"🌙",depth:2,rand:70,blunder:0.09,time:0,q:false,style:"Club-level instincts. Punishes obvious one-move blunders."},
 {name:"Jonah",elo:1200,avatar:"🎯",depth:3,rand:28,blunder:0.04,time:100,q:true,style:"Calculates short tactics and rarely gives away material."},
 {name:"Zara",elo:1500,avatar:"🐺",depth:4,rand:12,blunder:0.02,time:240,q:true,style:"Deep, patient play with strong positional understanding."},
 {name:"Odin",elo:1850,avatar:"👑",depth:5,rand:5,blunder:0.01,time:550,q:true,style:"The final boss. Searches five plies and almost never errs."}
];
let game=new Chess();
let mode='bot', botIdx=2, playerColor='w', orientation='w';
let selected=null, legalCache=[], review=null, reviewIdx=0, showBest=true;
let myNetColor='w', peer=null, conn=null, isHost=false, netOn=false, gameOver=false, resultShown=false;
let soundOn=true, audioCtx=null;

const UNI={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟︎'};
const VAL={p:100,n:320,b:330,r:500,q:900,k:0};
// Piece-square tables, white POV, row 0 = rank 8.
const PST={
p:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
r:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
k:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
};
const KING_END=[
 -50,-30,-30,-30,-30,-30,-30,-50,
 -30,-10,  0,  0,  0,  0,-10,-30,
 -30,  0, 20, 30, 30, 20,  0,-30,
 -30,  0, 30, 40, 40, 30,  0,-30,
 -30,  0, 30, 40, 40, 30,  0,-30,
 -30,  0, 20, 30, 30, 20,  0,-30,
 -30,-10,  0,  0,  0,  0,-10,-30,
 -50,-30,-30,-30,-30,-30,-30,-50
];
const PASS_BONUS=[0,5,12,22,38,62,100,0];

/* ---------------------------- evaluation ---------------------------- */
function evaluate(g){
  const b=g.board();
  const wPawns=[],bPawns=[];
  const wFiles=[0,0,0,0,0,0,0,0],bFiles=[0,0,0,0,0,0,0,0];
  const rooksW=[],rooksB=[];
  let phase=0,score=0,wB=0,bB=0,wK=null,bK=null;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c]; if(!p)continue;
    if(p.type==='p'){
      if(p.color==='w'){wPawns.push([r,c]);wFiles[c]++;}
      else{bPawns.push([r,c]);bFiles[c]++;}
      continue;
    }
    if(p.type==='k'){ if(p.color==='w')wK=[r,c]; else bK=[r,c]; continue; }
    phase+=VAL[p.type];
    const idx=p.color==='w'?r*8+c:(7-r)*8+c;
    const v=VAL[p.type]+PST[p.type][idx];
    if(p.color==='w')score+=v; else score-=v;
    if(p.type==='b'){ if(p.color==='w')wB++; else bB++; }
    if(p.type==='r'){ if(p.color==='w')rooksW.push([r,c]); else rooksB.push([r,c]); }
  }
  if(wB>=2)score+=30;
  if(bB>=2)score-=30;
  // pawn structure and passed pawns
  for(const [r,c] of wPawns){
    if(wFiles[c]>1)score-=12;
    if((c===0||!wFiles[c-1])&&(c===7||!wFiles[c+1]))score-=14;
    let passed=true;
    for(const [pr,pc] of bPawns){ if(pr<r&&Math.abs(pc-c)<=1){passed=false;break;} }
    if(passed)score+=PASS_BONUS[Math.min(6,7-r)];
  }
  for(const [r,c] of bPawns){
    if(bFiles[c]>1)score+=12;
    if((c===0||!bFiles[c-1])&&(c===7||!bFiles[c+1]))score+=14;
    let passed=true;
    for(const [pr,pc] of wPawns){ if(pr>r&&Math.abs(pc-c)<=1){passed=false;break;} }
    if(passed)score-=PASS_BONUS[Math.min(6,r)];
  }
  // rooks on open and semi-open files
  for(const [r,c] of rooksW){ if(wFiles[c]===0)score+=(bFiles[c]===0?18:9); }
  for(const [r,c] of rooksB){ if(bFiles[c]===0)score-=(wFiles[c]===0?18:9); }
  // tapered king placement plus a simple pawn shield
  const t=Math.min(1,phase/6000);
  if(wK){
    const kr=wK[0],kc=wK[1];
    score+=t*PST.k[kr*8+kc]+(1-t)*KING_END[kr*8+kc];
    if(t>0.25){
      let shield=0;
      for(let dc=-1;dc<=1;dc++){
        const f=kc+dc; if(f<0||f>7)continue;
        let has=false;
        for(let dr=1;dr<=2;dr++){ const rr=kr-dr; if(rr<0)continue; const q=b[rr][f]; if(q&&q.type==='p'&&q.color==='w'){has=true;break;} }
        shield+=has?8:-12;
        if(wFiles[f]===0)shield-=10;
      }
      score+=shield*t;
    }
  }
  if(bK){
    const kr=bK[0],kc=bK[1];
    score-=t*PST.k[(7-kr)*8+kc]+(1-t)*KING_END[(7-kr)*8+kc];
    if(t>0.25){
      let shield=0;
      for(let dc=-1;dc<=1;dc++){
        const f=kc+dc; if(f<0||f>7)continue;
        let has=false;
        for(let dr=1;dr<=2;dr++){ const rr=kr+dr; if(rr>7)continue; const q=b[rr][f]; if(q&&q.type==='p'&&q.color==='b'){has=true;break;} }
        shield+=has?8:-12;
        if(bFiles[f]===0)shield-=10;
      }
      score-=shield*t;
    }
  }
  score+=g.turn()==='w'?8:-8;
  return Math.round(score);
}

/* ------------------------------ search ------------------------------ */
const MATE=100000, INF=1e9;
const TIMEOUT={abort:true};
let nodes=0, TT=new Map(), killers=[], hist={};

function evalSTM(g){ const e=evaluate(g); return g.turn()==='w'?e:-e; }
function moveKey(m){ return m.from+m.to+(m.promotion||''); }

function orderMoves(moves,ply,ttMove){
  const kk=killers[ply]||[];
  for(const m of moves){
    let s=0;
    if(ttMove&&m.from===ttMove.from&&m.to===ttMove.to&&(m.promotion||null)===(ttMove.promotion||null))s=1e8;
    else if(m.captured)s=1e7+10*VAL[m.captured]-VAL[m.piece];
    else if(m.promotion)s=9e6+VAL[m.promotion];
    else{
      const k=moveKey(m);
      if(kk[0]===k)s=8e6;
      else if(kk[1]===k)s=7e6;
      else s=hist[k]||0;
    }
    m._s=s;
  }
  moves.sort((a,b)=>b._s-a._s);
}

function negamax(g,depth,alpha,beta,ply,useQ,deadline){
  nodes++;
  if(deadline&&(nodes&63)===0&&performance.now()>deadline)throw TIMEOUT;
  const alpha0=alpha;
  const key=g.fen();
  const ent=TT.get(key);
  let ttMove=null;
  if(ent){
    ttMove=ent.move;
    if(ent.depth>=depth){
      if(ent.flag===0)return ent.score;
      if(ent.flag===1&&ent.score<=alpha)return ent.score;
      if(ent.flag===2&&ent.score>=beta)return ent.score;
    }
  }
  if(g.in_checkmate())return -MATE+ply;
  if(g.in_draw()||g.in_stalemate()||g.in_threefold_repetition()||g.insufficient_material())return 0;
  if(depth<=0)return useQ?quiesce(g,alpha,beta,ply,4,deadline):evalSTM(g);
  const moves=g.moves({verbose:true});
  if(!moves.length)return 0;
  orderMoves(moves,ply,ttMove);
  let best=-INF,bestMove=null;
  for(const m of moves){
    g.move(m);
    let s;
    try{ s=-negamax(g,depth-1,-beta,-alpha,ply+1,useQ,deadline); }
    catch(e){ g.undo(); throw e; }
    g.undo();
    if(s>best){best=s;bestMove=m;}
    if(s>alpha)alpha=s;
    if(alpha>=beta){
      if(!m.captured){
        const kk=killers[ply]||(killers[ply]=[]);
        const mk=moveKey(m);
        if(kk[0]!==mk){kk[1]=kk[0];kk[0]=mk;}
        hist[mk]=(hist[mk]||0)+depth*depth;
      }
      break;
    }
  }
  if(TT.size>160000)TT.clear();
  TT.set(key,{depth,score:best,flag:best<=alpha0?1:best>=beta?2:0,move:bestMove});
  return best;
}

function quiesce(g,alpha,beta,ply,d,deadline){
  nodes++;
  if(deadline&&(nodes&63)===0&&performance.now()>deadline)throw TIMEOUT;
  const stand=evalSTM(g);
  if(stand>=beta)return beta;
  if(stand>alpha)alpha=stand;
  if(d<=0)return alpha;
  const moves=g.moves({verbose:true}).filter(m=>m.captured||m.promotion);
  if(!moves.length)return alpha;
  orderMoves(moves,ply,null);
  for(const m of moves){
    if(stand+VAL[m.captured||'p']+180<alpha)continue;
    g.move(m);
    let s;
    try{ s=-quiesce(g,-beta,-alpha,ply+1,d-1,deadline); }
    catch(e){ g.undo(); throw e; }
    g.undo();
    if(s>=beta)return beta;
    if(s>alpha)alpha=s;
  }
  return alpha;
}

function extractPV(fen,maxLen){
  const g=new Chess(fen),pv=[];
  for(let i=0;i<maxLen;i++){
    const ent=TT.get(g.fen());
    if(!ent||!ent.move)break;
    try{
      const mv=g.move(ent.move);
      if(!mv)break;
      pv.push(mv.san);
      if(g.game_over())break;
    }catch(e){ break; }
  }
  return pv;
}

/* Iterative deepening root search.
   Returns scores from WHITE's point of view, plus the best move and PV. */
function findBest(fen,depth,randJitter,useQ,timeMs){
  const g=new Chess(fen);
  if(g.game_over())return null;
  const rootMoves=g.moves({verbose:true});
  if(!rootMoves.length)return null;
  TT.clear();killers=[];hist={};nodes=0;
  const rootTurn=g.turn();
  const deadline=timeMs?performance.now()+timeMs:0;
  const exact=!!randJitter;
  orderMoves(rootMoves,0,null);
  let best=null,bestRanked=[],lastDepth=0,lastScore=0;
  for(let d=1;d<=depth;d++){
    const scored=[];
    let aborted=false,alpha=-INF;
    for(const m of rootMoves){
      if(deadline&&performance.now()>deadline){aborted=true;break;}
      g.move(m);
      let s;
      try{ s=exact?-negamax(g,d-1,-INF,INF,1,useQ,deadline):-negamax(g,d-1,-INF,-alpha,1,useQ,deadline); }
      catch(e){ if(e!==TIMEOUT)throw e; aborted=true; }
      g.undo();
      if(aborted)break;
      scored.push({m:m,s:s});
      if(s>alpha)alpha=s;
    }
    if(!scored.length)break;
    const ranked=scored.map(o=>({m:o.m,s:o.s,sj:o.s+(randJitter?(Math.random()*2-1)*randJitter:0)}))
      .sort((a,b)=>b.sj-a.sj);
    if(!aborted||!best){
      best=ranked[0].m;
      bestRanked=ranked;
      lastDepth=d;
      lastScore=ranked[0].s;
    }
    if(aborted)break;
    if(Math.abs(lastScore)>MATE-1000)break;
    const ord=new Map(ranked.map((o,i)=>[o.m,i]));
    rootMoves.sort((a,b)=>ord.get(a)-ord.get(b));
  }
  if(!best)return null;
  return {move:best,score:rootTurn==='w'?lastScore:-lastScore,ranked:bestRanked,pv:extractPV(fen,4),depth:lastDepth};
}

/* --------------------------- move sounds --------------------------- */
function beep(freq,dur,type){
  if(!soundOn)return;
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type||'sine';o.frequency.value=freq;g.gain.value=0.08;
    o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}

/* ------------------------------ bots ------------------------------- */
function botDef(){return BOTS[botIdx];}
function maybeBotMove(){
  if(gameOver||mode!=='bot')return;
  const bot=botDef();
  const botColor=playerColor==='w'?'b':'w';
  if(game.turn()!==botColor)return;
  thinkingEl.classList.remove('hidden');
  setTimeout(()=>{
    thinkingEl.classList.add('hidden');
    const moves=game.moves({verbose:true});
    if(!moves.length)return;
    let picked;
    if(Math.random()<bot.blunder){
      picked=moves[Math.floor(Math.random()*moves.length)];
    }else{
      const r=findBest(game.fen(),bot.depth,bot.rand,bot.q,bot.time);
      picked=r?r.move:moves[0];
    }
    if(picked)doMove(picked.from,picked.to,picked.promotion||'q');
  },300+Math.random()*400);
}

/* ---------------------------- rendering ---------------------------- */
function sqName(r,c){return 'abcdefgh'[c]+(8-r);}
function kingSquare(color){
  const b=game.board();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const s=b[r][c];
    if(s&&s.type==='k'&&s.color===color)return sqName(r,c);
  }
  return null;
}
function lastMoveSquares(){
  const h=game.history({verbose:true});
  if(!h.length)return [];
  const l=h[h.length-1];
  return [l.from,l.to];
}
function render(){
  boardEl.innerHTML='';
  const b=game.board();
  const rows=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const cols=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const last=lastMoveSquares();
  const checkSq=game.in_check()?kingSquare(game.turn()):null;
  for(const r of rows)for(const c of cols){
    const d=document.createElement('div');
    d.className='sq '+(((r+c)%2===1)?'light':'dark');
    const nm=sqName(r,c);
    if(last.indexOf(nm)>=0)d.classList.add('last');
    if(checkSq===nm)d.classList.add('check');
    if(selected===nm)d.classList.add('sel');
    if((orientation==='w'&&c===0)||(orientation==='b'&&c===7)){
      const s=document.createElement('span');s.className='coord r';s.textContent=8-r;d.appendChild(s);
    }
    if((orientation==='w'&&r===7)||(orientation==='b'&&r===0)){
      const s=document.createElement('span');s.className='coord f';s.textContent='abcdefgh'[c];d.appendChild(s);
    }
    const p=b[r][c];
    if(p){
      const s=document.createElement('span');s.className='pc';s.textContent=UNI[p.type];
      d.appendChild(s);d.classList.add(p.color);
    }
    if(legalCache.some(m=>m.to===nm)){
      const dot=document.createElement('span');
      dot.className=b[r][c]?'cap':'dot';d.appendChild(dot);
    }
    d.onclick=()=>onSquare(r,c);
    boardEl.appendChild(d);
  }
  renderMoves();updateStatus();drawBestArrow();
}

function renderMoves(){
  moveListEl.innerHTML='';
  const h=game.history();
  const cls=review?review.classes:[];
  for(let i=0;i<h.length;i+=2){
    const li=document.createElement('li');
    const tagFor=(j)=>{const c=cls[j];return c?' <span class="tag '+c.label+'">'+c.icon+'</span>':'';};
    let html=(i/2+1)+'. '+h[i]+tagFor(i);
    if(h[i+1])html+=' &nbsp;'+h[i+1]+tagFor(i+1);
    li.innerHTML=html;
    if(reviewIdx===i||reviewIdx===i+1)li.classList.add('cur');
    li.onclick=()=>{ if(review){reviewIdx=Math.min(i+1,h.length-1);jumpToPly(reviewIdx+1);} };
    moveListEl.appendChild(li);
  }
  moveListEl.scrollTop=moveListEl.scrollHeight;
}

function drawReason(){
  if(game.in_threefold_repetition())return 'threefold repetition';
  if(game.insufficient_material())return 'insufficient material';
  if(game.in_stalemate())return 'stalemate';
  return '50-move rule';
}
function updateStatus(){
  let t;
  if(game.in_checkmate()){
    const w=game.turn()==='w'?'Black':'White';
    t='Checkmate — '+w+' wins';endGame(w+' wins by checkmate');
  }else if(game.in_draw()){
    t='Draw — '+drawReason();endGame('Draw ('+drawReason()+')');
  }else if(game.in_stalemate()){
    t='Draw — stalemate';endGame('Draw (stalemate)');
  }else{
    const w=game.turn()==='w'?'White':'Black';
    t=w+' to move'+(game.in_check()?' — check!':'');
  }
  statusEl.textContent=t+(netOn?(' • '+(game.turn()===myNetColor?'your move':'waiting…')):'');
  setEvalBar(currentEvalCp());
}

function currentEvalCp(){
  if(review&&review.evalsByPly&&review.evalsByPly.length){
    const p=review.pos+1;
    if(typeof review.evalsByPly[p]==='number')return review.evalsByPly[p];
  }
  return evaluate(game);
}
function setEvalBar(cp){
  const wv=100/(1+Math.exp(-0.004*cp));
  evalFill.style.height=wv+'%';
  evalNum.textContent=(cp>=0?'+':'')+(cp/100).toFixed(1);
  evalNum.style.color=wv>55?'#fff':'#111';
}
function sqXY(sq){
  let f=sq.charCodeAt(0)-97,r=8-parseInt(sq[1],10);
  if(orientation==='b'){f=7-f;r=7-r;}
  return [f+0.5,r+0.5];
}
function drawBestArrow(){
  arrowsEl.innerHTML='';
  if(!showBest||!review||!review.lines)return;
  const line=review.lines[review.pos+1];
  if(!line||!line.move)return;
  const bm=line.move;
  if(!bm.from||!bm.to||bm.from===bm.to)return;
  const a=sqXY(bm.from),b=sqXY(bm.to);
  const el=document.createElementNS('http://www.w3.org/2000/svg','line');
  el.setAttribute('x1',a[0]);el.setAttribute('y1',a[1]);
  el.setAttribute('x2',b[0]);el.setAttribute('y2',b[1]);
  el.setAttribute('stroke','#2ebd5b');el.setAttribute('stroke-width','0.2');
  el.setAttribute('stroke-linecap','round');el.setAttribute('opacity','0.85');
  arrowsEl.appendChild(el);
  const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx',b[0]);dot.setAttribute('cy',b[1]);
  dot.setAttribute('r','0.3');dot.setAttribute('fill','#2ebd5b');
  arrowsEl.appendChild(dot);
}

/* ----------------------------- input ------------------------------ */
function onSquare(r,c){
  if(gameOver)return;
  if(review&&review.pos<game.history().length-1)return;
  if(netOn&&game.turn()!==myNetColor)return;
  if(mode==='bot'&&game.turn()!==playerColor)return;
  const nm=sqName(r,c);
  if(selected){
    const mv=legalCache.find(m=>m.to===nm);
    if(mv){
      doMove(selected,nm,mv.promotion?'q':undefined);
      selected=null;legalCache=[];render();return;
    }
  }
  const piece=game.get(nm);
  if(piece&&piece.color===game.turn()&&(!netOn||piece.color===myNetColor)){
    if(selected===nm){selected=null;legalCache=[];}
    else{selected=nm;legalCache=game.moves({square:nm,verbose:true});}
  }else{selected=null;legalCache=[];}
  render();
}

function doMove(from,to,promo){
  const piece=game.get(from);
  let promotion;
  if(piece&&piece.type==='p'&&((piece.color==='w'&&to[1]==='8')||(piece.color==='b'&&to[1]==='1')))promotion=promo||'q';
  const mv=game.move({from:from,to:to,promotion:promotion});
  if(!mv)return false;
  beep(mv.captured?520:440,0.08,mv.captured?'square':'sine');
  if(mv.san.indexOf('+')>=0)setTimeout(()=>beep(660,0.1),90);
  review=null;gameOver=false;resultShown=false;
  render();
  if(netOn&&conn&&conn.open){try{conn.send({t:'move',from:from,to:to,promotion:promotion});}catch(e){}}
  maybeBotMove();
  return true;
}

/* -------------------------- game control -------------------------- */
function newGame(quiet){
  game=new Chess();selected=null;legalCache=[];review=null;gameOver=false;resultShown=false;
  if(mode==='bot'&&playerColor==='random')playerColor=Math.random()<0.5?'w':'b';
  orientation=(mode==='online')?myNetColor:(playerColor==='w'?'w':'b');
  $('resultCard').classList.add('hidden');
  $('accLine').textContent='';
  render();maybeBotMove();
  if(!quiet&&netOn&&isHost&&conn&&conn.open){try{conn.send({t:'new'});}catch(e){}}
}
function endGame(msg){
  if(resultShown)return;
  resultShown=true;gameOver=true;
  const rc=$('resultCard');rc.classList.remove('hidden');
  rc.innerHTML='<b>'+msg+'</b><br><span class="muted">'+game.history().length+' plies • '+new Date().toLocaleTimeString()+'</span><br><button id="reviewNowBtn" class="primary">Analyse game</button>';
  const b=$('reviewNowBtn');
  if(b)b.onclick=()=>{switchTab('Analyse');runReview();};
}
function undo(){
  if(netOn)return alert('Undo is disabled online — start a new game instead.');
  if(!game.history().length)return;
  game.undo();
  if(mode==='bot'&&game.history().length)game.undo();
  gameOver=false;resultShown=false;$('resultCard').classList.add('hidden');review=null;render();
}

/* ----------------------------- review ----------------------------- */
const WIN_SCALE=0.0038;
function winPctWhite(cp){return 100/(1+Math.exp(-WIN_SCALE*cp));}
function winPctFor(cpWhite,turn){return turn==='w'?winPctWhite(cpWhite):100-winPctWhite(cpWhite);}
function accFromDrop(drop){
  const raw=103.1668*Math.exp(-0.04354*Math.max(0,drop))-3.1669;
  return Math.max(0,Math.min(100,raw));
}
function sameMove(a,b){
  if(!a||!b)return false;
  return a.from===b.from&&a.to===b.to&&(a.promotion||null)===(b.promotion||null);
}
function sacrificeLikely(g,bestMove,turn,bestWhiteScore){
  if(!bestMove||bestMove.captured)return false;
  const piece=g.get(bestMove.from);
  if(!piece||VAL[piece.type]<300)return false;
  const tmp=new Chess(g.fen());
  const played=tmp.move({from:bestMove.from,to:bestMove.to,promotion:bestMove.promotion||undefined});
  if(!played)return false;
  const caps=tmp.moves({verbose:true}).filter(m=>m.to===bestMove.to&&m.captured);
  if(!caps.length)return false;
  let cheapest=9999;
  for(const c of caps)cheapest=Math.min(cheapest,VAL[c.piece]);
  if(cheapest>=VAL[piece.type])return false;
  const moverWin=winPctFor(bestWhiteScore,turn);
  return moverWin>=55;
}
function classifyMove(o){
  if(o.isBest&&o.sac)return {label:'Brilliant',icon:'!!'};
  if(o.isBest&&o.isOnly)return {label:'Great',icon:'!'};
  if(o.isBest)return {label:'Best',icon:'✓'};
  if(o.winBefore>=80&&o.winAfter<=55&&o.drop>=20)return {label:'Miss',icon:'×'};
  if(o.drop>=20)return {label:'Blunder',icon:'??'};
  if(o.drop>=10)return {label:'Mistake',icon:'?'};
  if(o.drop>=5)return {label:'Inaccuracy',icon:'?!'};
  if(o.drop>=2)return {label:'Good',icon:'·'};
  return {label:'Excellent',icon:'✓'};
}
const CLS_ORDER=['Brilliant','Great','Best','Excellent','Good','Book','Inaccuracy','Mistake','Miss','Blunder'];
const BOOK_SANS={e4:1,d4:1,Nf3:1,c4:1,g3:1,b3:1,e5:1,c5:1,e6:1,c6:1,d5:1,Nf6:1,Nc6:1,d6:1,g6:1,b6:1,a6:1,h6:1,Be7:1,Bb4:1,Bc5:1,Nd7:1,Be6:1,Bg7:1,'O-O':1,'O-O-O':1};

function summaryHtml(accW,accB,counts,done,total){
  let tally='<div class="tally"><div class="tally-row head"><span>Move</span><b>W</b><b>B</b></div>';
  let any=false;
  for(const c of CLS_ORDER){
    const w=counts.w[c]||0,b=counts.b[c]||0;
    if(!w&&!b)continue;
    any=true;
    tally+='<div class="tally-row"><span class="tag '+c+'">'+c+'</span><b>'+w+'</b><b>'+b+'</b></div>';
  }
  tally+='</div>';
  return '<div class="accbox">'+
    '<div><b>'+(accW===null?'–':accW.toFixed(1))+'</b><br><span class="muted">White accuracy</span></div>'+
    '<div><b>'+(accB===null?'–':accB.toFixed(1))+'</b><br><span class="muted">Black accuracy</span></div>'+
    '<div><b>'+(done?total:'…')+'</b><br><span class="muted">'+(done?'moves':'reviewing')+'</span></div></div>'+
    (any?tally:'');
}
function average(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}

let reviewing=false;
async function runReview(){
  if(reviewing)return;
  const sans=game.history();
  if(!sans.length)return alert('Play some moves first (or load a PGN).');
  reviewing=true;
  $('runReviewBtn').disabled=true;
  $('stopReviewBtn').classList.remove('hidden');
  $('reviewSummary').innerHTML='<div class="muted">Analysing '+sans.length+' moves with the local engine…</div>';
  $('engineLine').textContent='Thinking…';
  const g=new Chess();
  const classes=[],lines=[],evalsByPly=[],wAcc=[],bAcc=[];
  const counts={w:{},b:{}};
  let cur=findBest(g.fen(),4,0,true,120);
  lines[0]=cur;
  evalsByPly[0]=cur?cur.score:evaluate(g);
  try{
  for(let i=0;i<sans.length;i++){
    if(!reviewing)break;
    const turn=g.turn();
    const legalBefore=g.moves().length;
    const before=cur||{move:null,score:evaluate(g),pv:[]};
    const cpBefore=typeof before.score==='number'?before.score:evaluate(g);
    const sac=sacrificeLikely(g,before.move,turn,cpBefore);
    const mv=g.move(sans[i]);
    const next=findBest(g.fen(),4,0,true,110);
    lines[i+1]=next;
    const cpAfter=next?next.score:evaluate(g);
    evalsByPly[i+1]=cpAfter;
    const winBefore=winPctFor(cpBefore,turn);
    const winAfter=winPctFor(cpAfter,turn);
    const drop=Math.max(0,winBefore-winAfter);
    const side=turn==='w'?'w':'b';
    const book=i<8&&BOOK_SANS[sans[i].replace(/[+#]/g,'')];
    let cls,acc=null;
    if(book){
      cls={label:'Book',icon:'📖'};
    }else{
      cls=classifyMove({
        isBest:!!(before.move&&mv&&sameMove(before.move,mv)),
        isOnly:legalBefore===1,
        sac:sac,
        winBefore:winBefore,winAfter:winAfter,drop:drop
      });
      acc=accFromDrop(drop);
      if(turn==='w')wAcc.push(acc); else bAcc.push(acc);
    }
    classes.push(cls);
    counts[side][cls.label]=(counts[side][cls.label]||0)+1;
    $('engineLine').textContent='Move '+(i+1)+'/'+sans.length+': '+sans[i]+' → '+cls.label+
      (acc===null?'':' ('+acc.toFixed(0)+' accuracy)')+
      (next&&next.pv&&next.pv.length?' · best line: '+next.pv.join(' '):'');
    $('reviewSummary').innerHTML=summaryHtml(average(wAcc),average(bAcc),counts,false,sans.length);
    cur=next;
    await new Promise(r=>setTimeout(r,0));
  }
  }catch(err){
    console.error('review stopped',err);
    $('engineLine').textContent='Analysis stopped: '+((err&&err.message)||err);
  }
  const used=classes.length;
  review={
    classes:classes,lines:lines,evalsByPly:evalsByPly,
    pos:used-1,partial:used<sans.length,
    wAcc:average(wAcc),bAcc:average(bAcc),counts:counts
  };
  reviewIdx=used-1;
  reviewing=false;
  $('runReviewBtn').disabled=false;
  $('stopReviewBtn').classList.add('hidden');
  $('reviewSummary').innerHTML=summaryHtml(average(wAcc),average(bAcc),counts,true,used);
  $('accLine').textContent=(average(wAcc)===null?'':'W '+average(wAcc).toFixed(1)+' · B '+average(bAcc).toFixed(1));
  $('engineLine').textContent='Review complete'+(used<sans.length?' (stopped early)':'')+
    ' · step with the arrows · green arrow = best move';
  render();
}

function jumpToPly(n){
  if(!review)return;
  const maxPlies=review.classes.length;
  review.pos=Math.max(-1,Math.min(maxPlies-1,n-1));
  reviewIdx=review.pos;
  const tmp=new Chess();
  const sans=game.history();
  for(let i=0;i<=review.pos;i++)tmp.move(sans[i]);
  renderPosition(tmp);
}
function renderPosition(tmp){
  boardEl.innerHTML='';
  const b=tmp.board();
  const rows=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const cols=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
  const hist=tmp.history({verbose:true});
  const last=hist.length?[hist[hist.length-1].from,hist[hist.length-1].to]:[];
  const checkSq=tmp.in_check()?kingSquareTmp(tmp,tmp.turn()):null;
  for(const r of rows)for(const c of cols){
    const d=document.createElement('div');
    d.className='sq '+(((r+c)%2===1)?'light':'dark');
    const nm=sqName(r,c);
    if(last.indexOf(nm)>=0)d.classList.add('last');
    if(checkSq===nm)d.classList.add('check');
    if((orientation==='w'&&c===0)||(orientation==='b'&&c===7)){
      const s=document.createElement('span');s.className='coord r';s.textContent=8-r;d.appendChild(s);
    }
    if((orientation==='w'&&r===7)||(orientation==='b'&&r===0)){
      const s=document.createElement('span');s.className='coord f';s.textContent='abcdefgh'[c];d.appendChild(s);
    }
    const p=b[r][c];
    if(p){
      const s=document.createElement('span');s.className='pc';s.textContent=UNI[p.type];
      d.appendChild(s);d.classList.add(p.color);
    }
    boardEl.appendChild(d);
  }
  const sans=game.history();
  const idx=review.pos;
  if(idx<0){
    statusEl.textContent='Starting position';
  }else{
    const side=idx%2===0?'White':'Black';
    statusEl.textContent=side+' played '+sans[idx]+
      (review.classes[idx]?' — '+review.classes[idx].label:'');
  }
  const cp=review.evalsByPly[idx+1];
  setEvalBar(typeof cp==='number'?cp:evaluate(tmp));
  renderMoves();
  drawBestArrow();
  updateEngineLine();
}
function updateEngineLine(){
  if(!review)return;
  const p=review.pos+1;
  const line=review.lines[p];
  if(!line){
    $('engineLine').textContent='No engine data for this position.';
    return;
  }
  const cp=typeof line.score==='number'?line.score:0;
  let txt='Eval '+(cp>=0?'+':'')+(cp/100).toFixed(2)+' (White)';
  if(line.pv&&line.pv.length)txt+=' · best: '+line.pv[0]+' · line: '+line.pv.join(' ');
  $('engineLine').textContent=txt;
}
function kingSquareTmp(t,color){
  const b=t.board();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const s=b[r][c];
    if(s&&s.type==='k'&&s.color===color)return sqName(r,c);
  }
  return null;
}

/* --------------------------- tabs & setup -------------------------- */
function switchTab(which){
  for(const t of ['Play','Analyse','Bots'])$('tab'+t).classList.toggle('active',t===which);
  $('panelPlay').classList.toggle('hidden',which!=='Play');
  $('panelAnalyse').classList.toggle('hidden',which!=='Analyse');
  $('panelBots').classList.toggle('hidden',which!=='Bots');
}
function buildBots(){
  const bl=$('botList');bl.innerHTML='';
  BOTS.forEach((b,i)=>{
    const btn=document.createElement('button');
    btn.className='bot'+(i===botIdx?' active':'');
    btn.innerHTML='<span class="avatar">'+b.avatar+'</span><span><span class="nm">'+b.name+
      '</span><br><span class="elo">Elo '+b.elo+' · depth '+b.depth+' · '+b.style+'</span></span>';
    btn.onclick=()=>{botIdx=i;mode='bot';setModeUI();buildBots();buildBotTable();newGame();};
    bl.appendChild(btn);
  });
}
function buildBotTable(){
  const t=$('botTable');
  t.innerHTML=BOTS.map((b,i)=>'<div class="bot'+(i===botIdx?' active':'')+'" data-i="'+i+
    '"><span class="avatar">'+b.avatar+'</span><span><span class="nm">'+b.name+' — '+b.elo+
    '</span><br><span class="elo">'+b.style+'</span></span></div>').join('');
  t.querySelectorAll('.bot').forEach(el=>el.onclick=()=>{
    botIdx=+el.dataset.i;buildBots();buildBotTable();if(mode==='bot')newGame();
  });
}
function setModeUI(){
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('botSetup').classList.toggle('hidden',mode!=='bot');
  $('onlineSetup').classList.toggle('hidden',mode!=='online');
}

/* ------------------------- online (PeerJS) ------------------------- */
function rndCode(){
  const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s='';
  for(let i=0;i<6;i++)s+=A[Math.floor(Math.random()*A.length)];
  return s;
}
function hostGame(){
  cleanupNet();
  const code=rndCode();
  const id='chesshub-v1-'+code;
  peer=new Peer(id);
  $('netStatus').textContent='Creating code…';
  peer.on('open',()=>{
    $('myCode').textContent=code;
    $('myCode').classList.remove('hidden');
    $('copyCodeBtn').classList.remove('hidden');
    $('netStatus').textContent='Share the code. Waiting for your friend…';
  });
  peer.on('connection',c=>{conn=c;wireConn(true);});
  peer.on('error',e=>{$('netStatus').textContent='Net error: '+e.type;});
  isHost=true;myNetColor='w';netOn=true;mode='online';setModeUI();orientation='w';
  $('leaveNetBtn').classList.remove('hidden');
  newGame(true);
}
function joinGame(){
  const code=$('joinCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length<4)return alert('Enter the 6-letter code from your friend.');
  cleanupNet(true);
  peer=new Peer();
  $('netStatus').textContent='Connecting…';
  peer.on('open',()=>{
    conn=peer.connect('chesshub-v1-'+code,{reliable:true});
    wireConn(false);
  });
  peer.on('error',e=>{$('netStatus').textContent='Could not join ('+e.type+'). Check the code.';});
  isHost=false;myNetColor='b';netOn=true;mode='online';setModeUI();orientation='b';
  $('leaveNetBtn').classList.remove('hidden');
}
function wireConn(host){
  conn.on('open',()=>{
    $('netStatus').textContent=host?'Friend connected! You are White.':'Connected! You are Black.';
    newGame(true);render();
  });
  conn.on('data',d=>{
    if(d.t==='move'){
      const made=game.move({from:d.from,to:d.to,promotion:d.promotion});
      if(made){gameOver=false;resultShown=false;beep(440,0.08);render();}
    }else if(d.t==='new'){
      newGame(true);
    }
  });
  conn.on('close',()=>{$('netStatus').textContent='Friend disconnected.';});
}
function cleanupNet(keepPeer){
  try{if(conn)conn.close();}catch(e){}
  try{if(peer&&!keepPeer)peer.destroy();}catch(e){}
  conn=null;
  if(!keepPeer){peer=null;netOn=false;}
}

/* ------------------------------ wire up ---------------------------- */
$('tabPlay').onclick=()=>switchTab('Play');
$('tabAnalyse').onclick=()=>switchTab('Analyse');
$('tabBots').onclick=()=>switchTab('Bots');
document.querySelectorAll('#modeSeg button').forEach(b=>b.onclick=()=>{
  mode=b.dataset.mode;
  if(mode!=='online'&&netOn){cleanupNet();$('leaveNetBtn').classList.add('hidden');$('netStatus').textContent='';}
  setModeUI();newGame();
});
document.querySelectorAll('#colorSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#colorSeg button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  playerColor=b.dataset.color==='random'?'random':b.dataset.color;
  newGame();
});
$('newBtn').onclick=()=>newGame();
$('undoBtn').onclick=undo;
$('flipBtn').onclick=()=>{orientation=orientation==='w'?'b':'w';render();};
$('soundBtn').onclick=e=>{
  soundOn=!soundOn;
  e.target.classList.toggle('on',soundOn);
  e.target.textContent=soundOn?'🔊':'🔇';
};
$('resignBtn').onclick=()=>{
  if(gameOver)return;
  const loser=netOn?(myNetColor==='w'?'White':'Black')
    :(mode==='bot'?(playerColor==='w'?'White':'Black'):(game.turn()==='w'?'White':'Black'));
  endGame(loser+' resigned');
};
$('hintBtn').onclick=()=>{
  thinkingEl.classList.remove('hidden');
  $('engineLine').textContent='Hint: thinking (iterative deepening)…';
  setTimeout(()=>{
    const r=findBest(game.fen(),4,0,true,220);
    thinkingEl.classList.add('hidden');
    if(!r)return;
    selected=r.move.from;
    legalCache=[r.move];
    render();
    const cp=r.score;
    $('engineLine').textContent='Hint: '+r.move.from+' → '+r.move.to+
      ' (eval '+(cp>=0?'+':'')+(cp/100).toFixed(2)+')'+
      (r.pv&&r.pv.length?' · line: '+r.pv.join(' '):'');
    if($('panelAnalyse').classList.contains('hidden'))switchTab('Analyse');
    render();
  },30);
};
$('analyseBtn').onclick=()=>{switchTab('Analyse');runReview();};
$('runReviewBtn').onclick=runReview;
$('stopReviewBtn').onclick=()=>{reviewing=false;};
$('showBestChk').onchange=e=>{showBest=e.target.checked;render();};
$('prevBtn').onclick=()=>{if(review)jumpToPly(review.pos);};
$('nextBtn').onclick=()=>{if(review)jumpToPly(review.pos+2);};
$('firstBtn').onclick=()=>{if(review)jumpToPly(0);};
$('lastBtn').onclick=()=>{if(review)jumpToPly(review.classes.length);};
$('pgnBtn').onclick=()=>{
  navigator.clipboard.writeText(game.pgn()).then(()=>alert('PGN copied'));
};
$('loadPgnBtn').onclick=()=>{
  const v=$('pgnIn').value.trim();
  if(!v)return;
  try{
    const g=new Chess();
    let ok=false;
    if(g.load_pgn)ok=g.load_pgn(v);
    else if(g.loadPgn)ok=g.loadPgn(v);
    else ok=g.load(v);
    if(ok===false)throw new Error('bad pgn');
    game=g;review=null;gameOver=game.game_over();resultShown=false;render();switchTab('Analyse');
  }catch(e){alert('Could not parse that PGN.');}
};
$('loadFenBtn').onclick=()=>{
  const v=$('fenIn').value.trim();
  if(!v)return;
  try{
    const g=new Chess(v);
    game=g;review=null;resultShown=false;render();
  }catch(e){alert('Bad FEN.');}
};
$('hostBtn').onclick=hostGame;
$('joinBtn').onclick=joinGame;
$('copyCodeBtn').onclick=()=>navigator.clipboard.writeText($('myCode').textContent);
$('leaveNetBtn').onclick=()=>{
  cleanupNet();netOn=false;mode='bot';setModeUI();
  $('leaveNetBtn').classList.add('hidden');$('netStatus').textContent='';
  newGame();
};
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'&&review)jumpToPly(review.pos);
  if(e.key==='ArrowRight'&&review)jumpToPly(review.pos+2);
});

buildBots();buildBotTable();setModeUI();render();
})();
