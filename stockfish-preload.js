/* Loads before app.js: tracks Chess instances, bot timers and shared constants. */
(function(){
if(!window.Chess){return;}
window.BOOK={e4:1,d4:1,Nf3:1,c4:1,g3:1,b3:1,e5:1,c5:1,e6:1,c6:1,d5:1,Nf6:1,Nc6:1,d6:1,g6:1,b6:1,a6:1,h6:1,Be7:1,Bb4:1,Bc5:1,Nd7:1,Be6:1,Bg7:1,'O-O':1,'O-O-O':1};
window.TAGS={Brilliant:'!!',Great:'!',Best:'✓',Excellent:'✓',Good:'·',Book:'📖',Inaccuracy:'?!',Mistake:'?',Miss:'×',Blunder:'??'};
window.VAL={p:100,n:320,b:330,r:500,q:900,k:0};
var O=window.Chess;
window.__OrigChess=O;
window.__chessGames=[];
function W(fen){var g=new O(fen);try{g.__sfHasFen=!!fen;window.__chessGames.push(g);}catch(e){}return g;}
W.prototype=O.prototype;
window.Chess=W;
var st=window.setTimeout,ct=window.clearTimeout,timers=[];
window.setTimeout=function(fn,delay){var args=[].slice.call(arguments,2);var rec={id:0,delay:delay,done:false};var wrapped=function(){rec.done=true;if(typeof fn==='function'){return fn.apply(this,args);}return undefined;};rec.id=st.call(window,wrapped,delay);timers.push(rec);if(timers.length>300){timers.splice(0,100);}return rec.id;};
window.__clearBotTimers=function(){var i,t;for(i=0;i<timers.length;i++){t=timers[i];if(!t.done&&t.delay>=250&&t.delay<=1000){ct.call(window,t.id);t.done=true;}}};
})();
