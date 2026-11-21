/* ChessHub Stockfish full game review: labels, accuracy, best move and eval graph. */
(function(){
'use strict';
var SF=window.SF;
var Orig=(SF&&SF.Orig)||window.__OrigChess||window.Chess;
if(!SF||!Orig){return;}
var $=SF.$;
var el=SF.el;
var VAL={p:100,n:320,b:330,r:500,q:900,k:0};
var TAGS={Brilliant:'!!',Great:'!',Best:'✓',Excellent:'✓',Good:'·',Book:'📖',Inaccuracy:'?!',Mistake:'?',Miss:'×',Blunder:'??'};
var BOOK={e4:1,d4:1,Nf3:1,c4:1,g3:1,b3:1,e5:1,c5:1,e6:1,c6:1,d5:1,Nf6:1,Nc6:1,d6:1,g6:1,b6:1,a6:1,h6:1,Be7:1,Bb4:1,Bc5:1,Nd7:1,Be6:1,Bg7:1,'O-O':1,'O-O-O':1};
var CLASS_COLORS={Brilliant:'#12b3b3',Great:'#5b8fd9',Best:'#9bc25a',Excellent:'#7fa650',Good:'#5f8f45',Book:'#a98545',Inaccuracy:'#f0b429',Mistake:'#e07020',Miss:'#e03b3b',Blunder:'#d32f2f'};
var MISTAKES={Inaccuracy:1,Mistake:1,Miss:1,Blunder:1};
/* Per-position search budget for Game Review: the deep search is opt-in. */
var REVIEW_SPEEDS={
  fast:{depth:18,ms:400,label:'fast'},
  balanced:{depth:22,ms:1200,label:'balanced'},
  deep:{depth:26,ms:2500,label:'deep'}
};
var reviewSpeed='balanced';
function budget(){return REVIEW_SPEEDS[reviewSpeed]||REVIEW_SPEEDS.balanced;}
function reviewGo(){var s=budget();return 'depth '+s.depth+' movetime '+s.ms;}
var review=null,graph=null,stopFlag=false,busy=false,runSeq=0;
function tagSpan(t){
  var s=el('span','tag '+t,TAGS[t]);
  s.title=t;
  s.setAttribute('aria-label',t);
  return s;
}
function depthStats(r){
  var d=(r&&r.depths)||[],i,v,min=0,max=0,sum=0,n=0;
  for(i=0;i<d.length;i++){
    v=d[i]||0;
    if(!v){continue;}
    n++;sum+=v;
    if(!min||v<min){min=v;}
    if(v>max){max=v;}
  }
  if(!n){return null;}
  return {min:min,max:max,avg:sum/n,n:n};
}
function depthText(r){
  var s=depthStats(r);
  if(!s){return 'depth –';}
  if(s.min===s.max){return 'depth '+s.min;}
  return 'depth '+s.min+'–'+s.max+' (avg '+s.avg.toFixed(0)+')';
}
function msAvg(r){
  var a=(r&&r.ms)||[],i,sum=0,n=0;
  for(i=0;i<a.length;i++){if(a[i]>0){sum+=a[i];n++;}}
  return n?sum/n:0;
}
function depthLine(r){
  var s=depthStats(r),a=msAvg(r),txt;
  if(!s){return 'Stockfish is searching…';}
  txt='Stockfish reached '+depthText(r);
  if(a){txt+=' · '+(a/1000).toFixed(1)+' s per position';}
  if(r&&r.totalMs){txt+=' · '+(r.totalMs/1000).toFixed(0)+' s total';}
  return txt;
}
function makeGraph(){
  var rs=$('reviewSummary');
  if(!rs||!rs.parentNode){return;}
  graph=el('div','sf-graph');
  graph.id='sfGraph';
  rs.parentNode.insertBefore(graph,rs.nextSibling);
}
function renderSummary(r){
  var box=$('reviewSummary');
  if(!box||!r){return;}
  box.innerHTML='';
  var acc=el('div','accbox');
  var items=[['White accuracy',SF.fmtAcc(SF.avg(r.wAcc))],['Black accuracy',SF.fmtAcc(SF.avg(r.bAcc))],['moves rated',String(r.classes.length)]];
  var i,d;
  for(i=0;i<items.length;i++){
    d=el('div');
    d.appendChild(el('b',null,items[i][1]));
    d.appendChild(document.createElement('br'));
    d.appendChild(el('span','muted',items[i][0]));
    acc.appendChild(d);
  }
  box.appendChild(acc);
  var cap=el('div','sf-depth muted',depthLine(r));
  cap.id='sfDepth';
  box.appendChild(cap);
  var order=['Brilliant','Great','Best','Excellent','Good','Book','Inaccuracy','Mistake','Miss','Blunder'];
  var tally=el('div','tally');
  var head=el('div','tally-row head');
  head.appendChild(el('span',null,'Move'));
  head.appendChild(el('b',null,'W'));
  head.appendChild(el('b',null,'B'));
  tally.appendChild(head);
  var any=false;
  for(i=0;i<order.length;i++){
    var k=order[i],w=r.counts.w[k]||0,b=r.counts.b[k]||0;
    if(!w&&!b){continue;}
    any=true;
    var row=el('div','tally-row');
    row.appendChild(el('span','tag '+k,k));
    row.appendChild(el('b',null,String(w)));
    row.appendChild(el('b',null,String(b)));
    tally.appendChild(row);
  }
  if(any){box.appendChild(tally);}
  renderLegend(r);
}
function renderLegend(r){
  var box=$('badgeLegend');
  if(!box||!r||!r.counts){return;}
  box.innerHTML='';
  var order=['Brilliant','Great','Best','Excellent','Good','Book','Inaccuracy','Mistake','Miss','Blunder'];
  var i,k,any=false;
  for(i=0;i<order.length;i++){
    k=order[i];
    if(!(r.counts.w[k]||r.counts.b[k])){continue;}
    any=true;
    box.appendChild(el('span','chip '+k,TAGS[k]+' '+k));
  }
  box.classList.toggle('hidden',!any);
}
function renderGraph(){
  if(!graph||!review){return;}
  graph.innerHTML='';
  var n=review.classes.length;
  if(!n){return;}
  var ns='http://www.w3.org/2000/svg';
  var svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 100 40');
  svg.setAttribute('preserveAspectRatio','none');
  var pts=[],i,j,cp,win,x,y;
  for(i=0;i<=n;i++){cp=review.evals[i]||0;win=SF.winPct(cp);pts.push({x:i/n*100,y:40-win/100*40});}
  var mid=document.createElementNS(ns,'line');
  mid.setAttribute('x1','0');mid.setAttribute('y1','20');mid.setAttribute('x2','100');mid.setAttribute('y2','20');
  mid.setAttribute('stroke','#3a352f');mid.setAttribute('stroke-width','0.3');
  svg.appendChild(mid);
  var area=document.createElementNS(ns,'polygon');
  var ap=[];
  for(i=0;i<pts.length;i++){ap.push(pts[i].x.toFixed(2)+','+pts[i].y.toFixed(2));}
  ap.push('100,40');ap.push('0,40');
  area.setAttribute('points',ap.join(' '));
  area.setAttribute('fill','rgba(232,227,216,.09)');
  svg.appendChild(area);
  var poly=document.createElementNS(ns,'polyline');
  var linePts=[];
  for(i=0;i<pts.length;i++){linePts.push(pts[i].x.toFixed(2)+','+pts[i].y.toFixed(2));}
  poly.setAttribute('points',linePts.join(' '));
  poly.setAttribute('fill','none');poly.setAttribute('stroke','#efeae0');poly.setAttribute('stroke-width','0.7');
  svg.appendChild(poly);
  for(i=1;i<=n;i++){
    var cls=review.classes[i-1];
    var dot=document.createElementNS(ns,'circle');
    dot.setAttribute('cx',pts[i].x.toFixed(2));dot.setAttribute('cy',pts[i].y.toFixed(2));dot.setAttribute('r','0.85');
    dot.setAttribute('fill',CLASS_COLORS[cls]||'#8d877d');
    svg.appendChild(dot);
  }
  for(i=0;i<=n;i++){
    var hit=document.createElementNS(ns,'circle');
    hit.setAttribute('cx',pts[i].x.toFixed(2));hit.setAttribute('cy',pts[i].y.toFixed(2));hit.setAttribute('r','1.9');
    hit.setAttribute('fill','transparent');hit.style.cursor='pointer';
    hit.setAttribute('data-ply',String(i));
    var ev=review.evals[i]||0;
    var title=document.createElementNS(ns,'title');
    title.textContent=(i===0?'Start':review.sans[i-1])+' '+((ev>=0?'+':'')+(ev/100).toFixed(2))+(i>0&&review.classes[i-1]?' · '+review.classes[i-1]:'');
    hit.appendChild(title);
    hit.addEventListener('click',function(){renderReviewAt(parseInt(this.getAttribute('data-ply'),10));});
    svg.appendChild(hit);
  }
  var here=pts[review.p]||pts[0]||{x:0,y:20};
  var marker=document.createElementNS(ns,'line');
  marker.setAttribute('x1',here.x.toFixed(2));marker.setAttribute('y1','0');marker.setAttribute('x2',here.x.toFixed(2));marker.setAttribute('y2','40');
  marker.setAttribute('stroke','#81b64c');marker.setAttribute('stroke-width','0.5');
  svg.appendChild(marker);
  var cur=document.createElementNS(ns,'circle');
  cur.setAttribute('cx',here.x.toFixed(2));cur.setAttribute('cy',here.y.toFixed(2));cur.setAttribute('r','1.6');
  cur.setAttribute('fill','#81b64c');cur.setAttribute('stroke','#0c0b0a');cur.setAttribute('stroke-width','0.5');
  svg.appendChild(cur);
  graph.appendChild(svg);
  graph.appendChild(el('div','cap','Eval graph — above the line White is winning. Click any point to jump there.'));
}
function renderMovesInto(box){
  if(!box||!review){return;}
  box.innerHTML='';
  var i,li,t;
  for(i=0;i<review.sans.length;i+=2){
    li=document.createElement('li');
    li.appendChild(document.createTextNode((i/2+1)+'. '+review.sans[i]));
    t=review.classes[i];if(t){li.appendChild(tagSpan(t));}
    if(review.sans[i+1]){
      li.appendChild(document.createTextNode('  '+review.sans[i+1]));
      t=review.classes[i+1];if(t){li.appendChild(tagSpan(t));}
    }
    if(review.p>=i+1&&review.p<=i+2){li.classList.add('cur');}
    (function(ply){li.onclick=function(){renderReviewAt(ply);};})(Math.min(i+2,review.sans.length));
    box.appendChild(li);
  }
  var curLi=box.querySelector('li.cur');
  if(curLi){
    var rb=box.getBoundingClientRect(),rc=curLi.getBoundingClientRect();
    if(rc.top<rb.top||rc.bottom>rb.bottom){box.scrollTop+=(rc.top-rb.top)-box.clientHeight/2+curLi.offsetHeight/2;}
  }
}
function renderMoveList(){
  var ids=['moveList','reviewMoves'],i;
  for(i=0;i<ids.length;i++){renderMovesInto($(ids[i]));}
}
/* Badges follow the pieces: every reviewed move keeps its badge on whichever
   square that piece now stands on, so the whole game can be scanned at once. */
function drawBadges(map,curPly){
  var b=$('board');
  if(!b){return;}
  var sq,cell,info,badge;
  for(sq in map){
    if(!Object.prototype.hasOwnProperty.call(map,sq)){continue;}
    info=map[sq];
    if(!info||!info.cls){continue;}
    cell=b.querySelector('.sq[data-sq="'+sq+'"]');
    if(!cell){continue;}
    badge=el('span','mvbadge '+info.cls+(info.ply===curPly?' cur':''),TAGS[info.cls]||'');
    badge.title=info.san+' — '+info.cls;
    badge.setAttribute('aria-label',info.san+' '+info.cls);
    cell.appendChild(badge);
  }
}
function setProgress(done,total){
  var bar=$('reviewBar'),fill=$('reviewBarFill');
  if(!bar||!fill){return;}
  if(!total){bar.classList.add('hidden');return;}
  bar.classList.remove('hidden');
  fill.style.width=Math.max(0,Math.min(100,done/total*100)).toFixed(1)+'%';
}
function hideProgress(){
  var bar=$('reviewBar');
  if(bar){bar.classList.add('hidden');}
}
/* The review bar sits directly under the board (pinned to the bottom of the
   screen on phones) so stepping never needs a scroll. */
function showBoardNav(on){
  var bar=$('boardNav');
  if(bar){bar.classList.toggle('hidden',!on);}
  if(document.body){document.body.classList.toggle('reviewnav',!!on);}
}
function jumpMistake(dir){
  if(!review){return;}
  var i;
  var lineEl=$('engineLine');
  if(dir>0){
    for(i=review.p+1;i<=review.classes.length;i++){
      if(MISTAKES[review.classes[i-1]]){renderReviewAt(i);return;}
    }
    if(lineEl){lineEl.textContent='No more mistakes after this move.';}
  }else{
    for(i=review.p-1;i>=1;i--){
      if(MISTAKES[review.classes[i-1]]){renderReviewAt(i);return;}
    }
    if(lineEl){lineEl.textContent='No mistakes before this move.';}
  }
}
function renderReviewAt(p){
  if(!review){return;}
  p=Math.max(0,Math.min(review.classes.length,p));
  review.p=p;
  var g=new Orig(),i,line,status,mv,map={},from,rank,cls;
  for(i=0;i<p;i++){
    mv=g.move(review.sans[i]);
    if(!mv){continue;}
    cls=review.classes[i];
    from=mv.from||'';
    rank=from?from.charAt(1):'';
    if(from){delete map[from];}
    if(mv.flags&&rank){
      if(mv.flags.indexOf('k')>=0){delete map['h'+rank];}
      if(mv.flags.indexOf('q')>=0){delete map['a'+rank];}
      if(mv.flags.indexOf('e')>=0&&mv.to){delete map[mv.to.charAt(0)+rank];}
    }
    map[mv.to]={cls:cls,san:mv.san,ply:i+1};
  }
  SF.drawBoard(g);
  drawBadges(map,p);
  line=review.lines[p];
  status=$('status');
  if(status){
    if(p===0){status.textContent='Starting position';}
    else{status.textContent=(p%2===1?'White':'Black')+' played '+review.sans[p-1]+' — '+(review.classes[p-1]||'');}
  }
  if(line){SF.setBar({cp:line.cp,mate:line.mate},line.turn);}
  SF.drawArrow(line?line.best:null,false);
  renderMoveList();
  renderGraph();
  var lbl=$('bMove');
  if(lbl){
    lbl.textContent=p?('move '+p+'/'+review.classes.length):('start · '+review.classes.length+' moves');
    lbl.style.color=p?(CLASS_COLORS[review.classes[p-1]]||''):'';
    lbl.title=p?('Move '+p+' of '+review.classes.length+' — '+(review.classes[p-1]||'')):'Start of the game';
  }
  showBoardNav(true);
  var lineEl=$('engineLine');
  if(lineEl){lineEl.textContent=line?('Stockfish depth '+(line.depth||'?')+' · eval '+SF.evalText({cp:line.cp,mate:line.mate},line.turn)+' · best '+(line.bestSan||'—')+(line.pvSan?' · '+line.pvSan:'')):'No engine data.';}
}
function evalPos(fen){
  var t0=Date.now();
  return SF.search(fen,reviewGo(),SF.configureFull).then(function(res){
    var g=new Orig(fen),turn=g.turn(),cp;
    if(res.mate!==null&&typeof res.mate==='number'){cp=res.mate>0?100000:-100000;}
    else{cp=(res.cp===null||typeof res.cp!=='number')?0:res.cp;}
    return {fen:fen,turn:turn,white:turn==='w'?cp:-cp,cp:res.cp,mate:res.mate,best:res.best,bestSan:SF.uciToSan(fen,res.best),pvSan:SF.pvToSan(fen,res.pv,6),depth:res.depth,seldepth:res.seldepth,nodes:res.nodes,ms:Date.now()-t0};
  });
}
function sacrificeBefore(fen,uci,turn,whiteCp){
  if(!uci){return false;}
  var g=new Orig(fen),from=uci.slice(0,2),to=uci.slice(2,4),promo=uci.slice(4,5)||undefined,mv,piece,caps,i,cheapest=9999;
  piece=g.get(from);
  if(!piece||VAL[piece.type]<300){return false;}
  try{mv=g.move({from:from,to:to,promotion:promo});}catch(e){return false;}
  if(!mv||mv.captured){return false;}
  caps=g.moves({verbose:true}).filter(function(m){return m.to===to&&m.captured;});
  if(!caps.length){return false;}
  for(i=0;i<caps.length;i++){cheapest=Math.min(cheapest,VAL[caps[i].piece]);}
  if(cheapest>=VAL[piece.type]){return false;}
  return SF.winFor(whiteCp,turn)>=55;
}
function finishReview(){
  busy=false;
  SF.setRunning(false);
  SF.setReviewShown(true);
  var runBtn=$('runReviewBtn'),stopBtn=$('stopReviewBtn'),acc=$('accLine'),lineEl=$('engineLine');
  if(runBtn){runBtn.disabled=false;}
  if(stopBtn){stopBtn.classList.add('hidden');}
  setProgress(1,1);
  setTimeout(hideProgress,1200);
  if(review){
    renderSummary(review);
    if(acc){acc.textContent='W '+SF.fmtAcc(SF.avg(review.wAcc))+' · B '+SF.fmtAcc(SF.avg(review.bAcc));}
    renderReviewAt(review.p);
    if(lineEl){lineEl.textContent='Stockfish review complete · '+depthText(review)+' · every move rated';}
  }
}
function abortUI(){
  busy=false;
  runSeq++;
  hideProgress();
  showBoardNav(!!review);
  SF.setRunning(false);
  var runBtn=$('runReviewBtn'),stopBtn=$('stopReviewBtn'),t=$('engineLine');
  if(runBtn){runBtn.disabled=false;}
  if(stopBtn){stopBtn.classList.add('hidden');}
  if(t){t.textContent='Review stopped.';}
}
function runDeepReview(){
  if(busy){return;}
  var g=SF.getLiveGame();
  if(!g){return;}
  var sans=g.history();
  if(!sans.length){alert('Play some moves first (or load a PGN).');return;}
  busy=true;
  var myRun=++runSeq;
  SF.setRunning(true);
  SF.setReviewShown(false);
  stopFlag=false;
  review=null;
  showBoardNav(false);
  var runBtn=$('runReviewBtn'),stopBtn=$('stopReviewBtn'),sum=$('reviewSummary'),lineEl=$('engineLine');
  if(runBtn){runBtn.disabled=true;}
  if(stopBtn){stopBtn.classList.remove('hidden');}
  var b0=budget();
  if(sum){sum.innerHTML='';sum.appendChild(el('div','muted','Review ('+b0.label+'): Stockfish searches every move up to depth '+b0.depth+' ('+(b0.ms/1000).toFixed(1)+' s per position max)…'));}
  if(lineEl){lineEl.textContent='Loading Stockfish…';}
  setProgress(0,sans.length+1);
  var tab=$('tabAnalyse');
  if(tab&&$('panelAnalyse')&&$('panelAnalyse').classList.contains('hidden')){tab.click();}
  SF.startEngine().then(async function(){
    if(myRun!==runSeq){return;}
    if(lineEl){lineEl.textContent='Stockfish: searching position 1/'+(sans.length+1)+'…';}
    var replay=new Orig();
    var first=await evalPos(replay.fen());
    if(stopFlag){if(lineEl){lineEl.textContent='Review stopped.';}finishReview();return;}
    review={sans:sans,classes:[],lines:[first],evals:[first.white],counts:{w:{},b:{}},wAcc:[],bAcc:[],p:0,depths:[first.depth||0],ms:[first.ms||0],totalMs:first.ms||0};
    setProgress(1,sans.length+1);
    var i,turn,legalBefore,before,mv,after,winBefore,winAfter,drop,side,cls,acc,isBest,isOnly,sac;
    for(i=0;i<sans.length;i++){
      if(stopFlag){break;}
      turn=replay.turn();
      legalBefore=replay.moves().length;
      before=review.lines[i];
      mv=replay.move(sans[i]);
      after=await evalPos(replay.fen());
      if(myRun!==runSeq){return;}
      if(stopFlag){break;}
      review.lines[i+1]=after;
      review.evals[i+1]=after.white;
      review.depths[i+1]=after.depth||0;
      review.ms[i+1]=after.ms||0;
      review.totalMs+=(after.ms||0);
      winBefore=SF.winFor(before.white,turn);
      winAfter=SF.winFor(after.white,turn);
      drop=Math.max(0,winBefore-winAfter);
      side=turn==='w'?'w':'b';
      if(i<8&&BOOK[sans[i].replace(/[+#]/g,'')]){cls='Book';}
      else{
        isBest=!!(before.best&&mv&&before.best===mv.from+mv.to+(mv.promotion||''));
        isOnly=legalBefore===1;
        sac=isBest?sacrificeBefore(before.fen,before.best,turn,before.white):false;
        if(isBest&&sac){cls='Brilliant';}
        else if(isBest&&isOnly){cls='Great';}
        else if(isBest){cls='Best';}
        else if(winBefore>=80&&winAfter<=55&&drop>=20){cls='Miss';}
        else if(drop>=20){cls='Blunder';}
        else if(drop>=10){cls='Mistake';}
        else if(drop>=5){cls='Inaccuracy';}
        else if(drop>=2){cls='Good';}
        else{cls='Excellent';}
        acc=SF.accFor(drop);
        if(turn==='w'){review.wAcc.push(acc);}else{review.bAcc.push(acc);}
      }
      review.classes[i]=cls;
      review.counts[side][cls]=(review.counts[side][cls]||0)+1;
      if(lineEl){lineEl.textContent='Stockfish: move '+(i+1)+'/'+sans.length+' · depth '+(after.depth||'?')+' of '+budget().depth+' · '+((after.ms||0)/1000).toFixed(1)+' s · '+cls;}
      renderSummary(review);
      setProgress(i+2,sans.length+1);
      await new Promise(function(r){setTimeout(r,0);});
    }
    review.p=Math.min(review.classes.length,review.sans.length);
    finishReview();
  }).catch(function(e){
    if(myRun!==runSeq){return;}
    busy=false;
    hideProgress();
    SF.setRunning(false);
    SF.setReviewShown(false);
    if(runBtn){runBtn.disabled=false;}
    if(stopBtn){stopBtn.classList.add('hidden');}
    if(lineEl){lineEl.textContent='Stockfish unavailable: '+e.message;}
  });
}
function init(){
  makeGraph();
  var speedBtns=document.querySelectorAll('#speedSeg button');
  function paintSpeed(){
    for(var k=0;k<speedBtns.length;k++){
      var btn=speedBtns[k];
      if(btn.dataset.speed===reviewSpeed){btn.classList.add('active');}else{btn.classList.remove('active');}
    }
  }
  function wireSpeed(i){
    var btn=speedBtns[i];
    if(!btn){return;}
    btn.addEventListener('click',function(){
      reviewSpeed=btn.dataset.speed||'balanced';
      paintSpeed();
      var l=$('engineLine');
      if(l&&!busy){var s=budget();l.textContent='Review speed: '+s.label+' · up to depth '+s.depth+' · '+(s.ms/1000).toFixed(1)+' s per position';}
    });
  }
  for(var wi=0;wi<speedBtns.length;wi++){wireSpeed(wi);}
  paintSpeed();
  var rb=$('runReviewBtn'),sb=$('stopReviewBtn'),ab=$('analyseBtn');
  if(rb){rb.onclick=null;rb.addEventListener('click',function(){runDeepReview();});}
  if(sb){sb.onclick=null;sb.addEventListener('click',function(){
    stopFlag=true;
    if(SF.stop){SF.stop();}
    if(busy){abortUI();}
  });}
  if(ab){ab.onclick=null;ab.addEventListener('click',function(){var t=$('tabAnalyse');if(t){t.click();}runDeepReview();});}
  var nav=function(id,fn){var b=$(id);if(b){b.onclick=null;b.addEventListener('click',fn);}};
  nav('prevBtn',function(){if(review){renderReviewAt(review.p-1);}});
  nav('nextBtn',function(){if(review){renderReviewAt(review.p+1);}});
  nav('firstBtn',function(){if(review){renderReviewAt(0);}});
  nav('lastBtn',function(){if(review){renderReviewAt(review.classes.length);}});
  nav('prevMistBtn',function(){jumpMistake(-1);});
  nav('nextMistBtn',function(){jumpMistake(1);});
  nav('bPrev',function(){if(review){renderReviewAt(review.p-1);}});
  nav('bNext',function(){if(review){renderReviewAt(review.p+1);}});
  nav('bPrevMist',function(){jumpMistake(-1);});
  nav('bNextMist',function(){jumpMistake(1);});
  var chk=$('showBestChk');
  if(chk){chk.onchange=null;chk.addEventListener('change',function(){if(review){var l=review.lines[review.p];SF.drawArrow(l?l.best:null,false);}});}
  document.addEventListener('keydown',function(e){
    if(!review){return;}
    var tag=(e.target&&e.target.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'){return;}
    if(e.key==='ArrowLeft'){e.preventDefault();renderReviewAt(review.p-1);}
    if(e.key==='ArrowRight'){e.preventDefault();renderReviewAt(review.p+1);}
    if(e.key==='['){e.preventDefault();jumpMistake(-1);}
    if(e.key===']'){e.preventDefault();jumpMistake(1);}
    if(e.key==='Home'){e.preventDefault();renderReviewAt(0);}
    if(e.key==='End'){e.preventDefault();renderReviewAt(review.classes.length);}
  });
  var rc=$('resultCard');
  if(rc){
    var mo=new MutationObserver(function(){var b=$('reviewNowBtn');if(b&&!b.__sf){b.__sf=true;b.onclick=function(){var t=$('tabAnalyse');if(t){t.click();}runDeepReview();};}});
    mo.observe(rc,{childList:true,subtree:true});
  }
  document.addEventListener('sf-newgame',function(){review=null;stopFlag=true;showBoardNav(false);if(SF.stop){SF.stop();}});
}
init();
})();
