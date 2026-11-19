/* Loads before app.js: tracks Chess instances and bot timers. */
(function(){
if(!window.Chess){return;}
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
