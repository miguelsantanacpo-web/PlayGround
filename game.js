(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = 1000, H = 568, GROUND = 500;
  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), waveEl = $('wave'), waveNameEl = $('waveName');
  const statusEl = $('statusText'), toastEl = $('toast');
  const startOverlay = $('startOverlay'), pauseOverlay = $('pauseOverlay'), overOverlay = $('gameOverOverlay');
  const cityX = [115, 269, 423, 577, 731, 885];
  const silos = [78, 500, 922];
  let dpr = 1, scaleX = 1, scaleY = 1;
  let mode = 'ready', lastTime = 0, elapsed = 0, score = 0, wave = 1, best = Number(localStorage.getItem('starguard-best') || 0);
  let cities = [], enemies = [], shots = [], blasts = [], particles = [], stars = [], skyline = [], ammo = 3, ammoTimer = 0;
  let spawnLeft = 0, spawnTimer = 0, waveDelay = 0, toastTimer = 0, audioCtx = null, soundOn = true;
  $('bestScore').textContent = format(best);

  function format(n) { return String(Math.max(0, Math.floor(n))).padStart(6, '0'); }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    scaleX = canvas.width / W; scaleY = canvas.height / H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }
  window.addEventListener('resize', resize); new ResizeObserver(resize).observe(canvas);

  function makeWorld() {
    stars = Array.from({length: 105}, (_, i) => ({x: Math.random()*W, y: 25+Math.random()*390, r: .5+Math.random()*1.7, p: Math.random()*6.28, speed: .5+Math.random()*2, hue: Math.random()>.86 ? 185 : 260}));
    skyline = [];
    let x = 0;
    while (x < W) {
      const w = 30 + Math.random()*45, h = 32 + Math.random()*88;
      skyline.push({x, w, h, style: Math.floor(Math.random()*3), seed: Math.random()*10}); x += w+3;
    }
  }
  makeWorld(); resize();
  cities = cityX.map((x, i) => ({x, alive:true, type:i%4, twinkle:Math.random()*10}));
  renderLives(); renderAmmo();
  function resetGame() {
    score = 0; wave = 1; cities = cityX.map((x, i) => ({x, alive:true, type:i%4, twinkle:Math.random()*10}));
    enemies=[]; shots=[]; blasts=[]; particles=[]; ammo=3; ammoTimer=0; waveDelay=0; elapsed=0;
    spawnLeft = 8; spawnTimer = .7; mode='playing';
    scoreEl.textContent=format(score); waveEl.textContent=String(wave).padStart(2,'0'); waveNameEl.textContent='WARM UP';
    statusEl.textContent='DEFENSE ACTIVE'; renderLives(); renderAmmo();
    startOverlay.classList.add('hidden'); pauseOverlay.classList.add('hidden'); overOverlay.classList.add('hidden');
    lastTime=performance.now();
  }
  function renderLives(){
    $('cityLives').innerHTML=cities.map(c=>`<span class="city-heart ${c.alive?'':'lost'}">♥</span>`).join('');
    $('cityLives').setAttribute('aria-label',`${cities.filter(c=>c.alive).length} cities remaining`);
  }
  function renderAmmo(){ $('batteryPips').innerHTML=Array.from({length:3},(_,i)=>`<span class="pip ${i<ammo?'':'empty'}"></span>`).join(''); }
  function setScore(n){score=Math.max(0,n); scoreEl.textContent=format(score); if(score>best){best=score;localStorage.setItem('starguard-best',String(best));$('bestScore').textContent=format(best);}}
  function announce(text){toastEl.textContent=text;toastEl.classList.add('show');toastTimer=1.6;}

  function sound(freq=420, duration=.11, type='sine', volume=.045, endFreq=null) {
    if(!soundOn)return;
    try {
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended')audioCtx.resume();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);
      if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,audioCtx.currentTime+duration);
      g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);
      o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);
    } catch(e) { /* Audio is an optional flourish. */ }
  }
  function togglePause(){
    if(mode==='playing'){mode='paused';pauseOverlay.classList.remove('hidden');statusEl.textContent='SYSTEM PAUSED';}
    else if(mode==='paused'){mode='playing';pauseOverlay.classList.add('hidden');statusEl.textContent='DEFENSE ACTIVE';lastTime=performance.now();}
  }
  $('playBtn').addEventListener('click',()=>{sound(660,.15,'triangle',.04,880);resetGame();});
  $('restartBtn').addEventListener('click',()=>{sound(660,.15,'triangle',.04,880);resetGame();});
  $('resumeBtn').addEventListener('click',togglePause);
  $('pauseBtn').addEventListener('click',togglePause);
  $('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('soundBtn').classList.toggle('active',!soundOn);$('soundBtn').textContent=soundOn?'♫':'♪';if(soundOn)sound(520,.1);});
  window.addEventListener('keydown',e=>{if((e.key==='p'||e.key==='Escape')&&mode!=='ready'&&mode!=='over')togglePause();if(e.key===' '&&mode==='ready'){e.preventDefault();resetGame();}});
  canvas.addEventListener('pointerdown',e=>{
    if(mode!=='playing')return;
    e.preventDefault(); const r=canvas.getBoundingClientRect();
    fire((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H);
  });

  function fire(tx,ty){
    if(ty>GROUND-3)ty=GROUND-3;
    if(ammo<1){announce('BATTERIES RECHARGING');sound(180,.07,'square',.018);return;}
    const sx=silos.reduce((a,b)=>Math.abs(b-tx)<Math.abs(a-tx)?b:a), sy=GROUND-2;
    const dx=tx-sx,dy=ty-sy,dist=Math.hypot(dx,dy),speed=700;
    shots.push({x:sx,y:sy,sx,sy,tx,ty,vx:dx/dist*speed,vy:dy/dist*speed,life:dist/speed,age:0});
    ammo--;renderAmmo();sound(260,.16,'triangle',.05,740);
  }

  function spawnEnemy(){
    const targets=cities.filter(c=>c.alive); if(!targets.length)return;
    const from=Math.random()*W, target=targets[Math.floor(Math.random()*targets.length)];
    const startY=23+Math.random()*47;
    const speed=38+Math.min(wave*5,78)+Math.random()*17;
    const dx=target.x-from,dy=GROUND-startY,dist=Math.hypot(dx,dy);
    enemies.push({x:from,y:startY,vx:dx/dist*speed,vy:dy/dist*speed,target,speed,trail:[],phase:Math.random()*6.28,hp:1});
  }
  function explode(x,y,player=true){
    const max=player?83:42;
    blasts.push({x,y,r:2,max,age:0,duration:player?1.15:.57,player,hit:new Set()});
    const count=player?34:18;
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,sp=(player?45:30)+Math.random()*(player?190:110),life=.38+Math.random()*.55;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life,maxLife:life,r:1+Math.random()*(player?3:2),hue:player?[174,187,198,320,45][Math.floor(Math.random()*5)]:[16,28,44][Math.floor(Math.random()*3)]});
    }
    if(player)sound(320+Math.random()*160,.23,'sine',.045,90);
  }

  function update(dt){
    elapsed+=dt;
    if(ammo<3){ammoTimer+=dt;if(ammoTimer>=1.15){ammo=Math.min(3,ammo+1);ammoTimer=0;renderAmmo();}}else ammoTimer=0;
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toastEl.classList.remove('show');}
    if(spawnLeft>0){spawnTimer-=dt;if(spawnTimer<=0){spawnEnemy();spawnLeft--;spawnTimer=Math.max(.44,1.05-wave*.035)+Math.random()*.5;}}
    for(const s of shots){s.age+=dt;s.x=s.sx+s.vx*s.age;s.y=s.sy+s.vy*s.age;if(s.age>=s.life){s.dead=true;explode(s.tx,s.ty,true);}}
    shots=shots.filter(s=>!s.dead);
    for(const e of enemies){
      e.trail.push({x:e.x,y:e.y});if(e.trail.length>12)e.trail.shift();
      e.x+=e.vx*dt;e.y+=e.vy*dt;e.phase+=dt*5;
      if(e.y>=GROUND-5){e.dead=true;const c=e.target;if(c.alive){c.alive=false;renderLives();explode(c.x,GROUND-18,false);setScore(score);announce('CITY LOST — KEEP FIGHTING');sound(140,.33,'sawtooth',.04,45);}}
    }
    for(const b of blasts){
      b.age+=dt;const t=Math.min(1,b.age/b.duration);b.r=b.max*(t<.22?(t/.22):1-Math.pow((t-.22)/.78,2)*.22);
      if(b.player){for(const e of enemies){if(!e.dead&&!b.hit.has(e)&&Math.hypot(e.x-b.x,e.y-b.y)<b.r+7){e.dead=true;b.hit.add(e);setScore(score+100);explode(e.x,e.y,false);}}}
      if(b.age>=b.duration)b.dead=true;
    }
    enemies=enemies.filter(e=>!e.dead);blasts=blasts.filter(b=>!b.dead);
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy=p.vy*Math.pow(.15,dt)+22*dt;}
    particles=particles.filter(p=>p.life>0);
    if(spawnLeft===0&&enemies.length===0&&mode==='playing'){
      if(!waveDelay){waveDelay=2.1;announce('WAVE CLEARED  +  BONUS');setScore(score+250);}
      waveDelay-=dt;
      if(waveDelay<=0){wave++;waveEl.textContent=String(wave).padStart(2,'0');waveNameEl.textContent=wave<3?'GETTING WARMER':wave<6?'METEOR SHOWER':'STARSTORM';spawnLeft=7+wave*2;spawnTimer=.8;waveDelay=0;if(wave%2===0){const lost=cities.find(c=>!c.alive);if(lost){lost.alive=true;renderLives();announce('A CITY IS BACK ONLINE');}}}
    }
    if(cities.every(c=>!c.alive)){gameOver();}
  }
  function gameOver(){mode='over';statusEl.textContent='SIGNAL LOST';$('finalScore').textContent=format(score);overOverlay.classList.remove('hidden');}

  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function drawBackground(t){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#171a43');sky.addColorStop(.55,'#25234f');sky.addColorStop(1,'#47305d');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const haze=ctx.createRadialGradient(510,330,10,510,330,450);haze.addColorStop(0,'#ff73b322');haze.addColorStop(.48,'#8972d017');haze.addColorStop(1,'#13183d00');ctx.fillStyle=haze;ctx.fillRect(0,0,W,H);
    // Soft moon and its halo
    const halo=ctx.createRadialGradient(790,115,8,790,115,115);halo.addColorStop(0,'#ffe7bb2a');halo.addColorStop(1,'#ffe7bb00');ctx.fillStyle=halo;ctx.fillRect(675,0,230,240);
    ctx.fillStyle='#ffe9c9';ctx.globalAlpha=.83;ctx.beginPath();ctx.arc(790,115,23,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle='#f8b8d477';ctx.beginPath();ctx.arc(782,108,23,0,Math.PI*2);ctx.fill();
    for(const s of stars){const tw=.45+.55*Math.sin(t*s.speed+s.p);ctx.globalAlpha=tw;ctx.fillStyle=s.hue===185?'#84f2ee':'#fff4e6';ctx.beginPath();ctx.arc(s.x,s.y,s.r*(.75+.3*tw),0,Math.PI*2);ctx.fill();if(s.r>1.7){ctx.fillRect(s.x-4,s.y-.5,8,1);ctx.fillRect(s.x-.5,s.y-4,1,8);}}
    ctx.globalAlpha=1;
    // distant rounded hills
    ctx.fillStyle='#333052';ctx.beginPath();ctx.moveTo(0,GROUND);ctx.lineTo(0,385);ctx.quadraticCurveTo(150,335,300,386);ctx.quadraticCurveTo(470,427,630,374);ctx.quadraticCurveTo(820,326,1000,390);ctx.lineTo(1000,GROUND);ctx.fill();
    for(const b of skyline){const bh=b.h*.72;ctx.fillStyle=b.style===0?'#373052':b.style===1?'#332f53':'#3b3155';ctx.fillRect(b.x,GROUND-bh,b.w,bh);ctx.fillStyle='#eabf7655';for(let wx=b.x+7;wx<b.x+b.w-4;wx+=11)for(let wy=GROUND-bh+10;wy<GROUND-6;wy+=13){if(Math.sin(wx*1.7+wy*2+b.seed)>-.1)ctx.fillRect(wx,wy,3,5);}}
    // low city glow
    const groundGlow=ctx.createLinearGradient(0,GROUND-25,0,H);groundGlow.addColorStop(0,'#ff7fb326');groundGlow.addColorStop(1,'#ff7fb300');ctx.fillStyle=groundGlow;ctx.fillRect(0,GROUND-25,W,H-GROUND+25);
    ctx.fillStyle='#201d3d';ctx.fillRect(0,GROUND,W,H-GROUND);
    ctx.fillStyle='#49436a';ctx.fillRect(0,GROUND,W,2);ctx.fillStyle='#f691c2';ctx.globalAlpha=.65;ctx.fillRect(0,GROUND,W,1);ctx.globalAlpha=1;
    // tiny runway lights
    for(let x=14;x<W;x+=30){ctx.fillStyle='#fb8db3';ctx.globalAlpha=.35+.2*Math.sin(t*2+x);ctx.fillRect(x,GROUND+11,3,2);}ctx.globalAlpha=1;
  }
  function drawCity(c,i,t){
    const x=c.x;if(!c.alive)return;
    const base=GROUND-1, col=['#7b6f9d','#92739b','#647c9d','#a077a1'][c.type];
    // shadow platform
    ctx.fillStyle='#111631';ctx.beginPath();ctx.ellipse(x,base+2,46,8,0,0,Math.PI*2);ctx.fill();
    if(c.type===0){
      rounded(x-25,base-55,50,55,5,'#3b385f','#77739a');rounded(x-18,base-71,36,19,4,'#50476f','#8b7ca2');rounded(x-10,base-86,20,17,5,'#554872','#a386a7');
      rounded(x-7,base-103,14,19,6,'#ffb9d1','#ffe5d4');ctx.fillStyle='#fff0d3';ctx.beginPath();ctx.arc(x,base-105,5,0,Math.PI*2);ctx.fill();
      for(let y=base-46;y<base-9;y+=12)for(let xx=x-17;xx<x+18;xx+=13){rounded(xx,y,5,7,2,'#ffd678','#fff0ad');}
    }else if(c.type===1){
      rounded(x-34,base-47,68,47,5,'#413a68','#84749a');rounded(x-25,base-61,50,16,5,'#5e4d7b','#a585aa');rounded(x-13,base-79,26,19,5,'#756087','#bf91a9');
      ctx.fillStyle='#78edf0';ctx.beginPath();ctx.arc(x,base-87,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e9ffff';ctx.beginPath();ctx.arc(x-2,base-89,3,0,Math.PI*2);ctx.fill();
      for(let xx=x-23;xx<x+25;xx+=15)rounded(xx,base-35,7,11,2,'#ffd678','#fff0ad');
    }else if(c.type===2){
      rounded(x-37,base-38,74,38,5,'#41385f','#84749a');rounded(x-28,base-54,56,18,4,'#55446f','#9a7e9c');
      for(let xx=x-21;xx<x+22;xx+=14)rounded(xx,base-45,6,8,2,'#80e5df','#d4fff0');
      rounded(x-17,base-76,34,23,5,'#6a527e','#ad80a1');ctx.fillStyle='#ffd779';ctx.beginPath();ctx.arc(x,base-80,6,0,Math.PI*2);ctx.fill();
    }else{
      rounded(x-34,base-42,68,42,6,'#43395f','#827292');rounded(x-23,base-59,46,18,5,'#655075','#a17d9b');
      ctx.fillStyle='#e7a9c5';ctx.beginPath();ctx.moveTo(x-17,base-59);ctx.lineTo(x,base-79);ctx.lineTo(x+17,base-59);ctx.fill();
      for(let xx=x-22;xx<x+24;xx+=15)rounded(xx,base-32,7,10,2,'#ffd678','#fff0ad');
    }
    // roof pennant and glowing door
    ctx.fillStyle=col;ctx.fillRect(x-2,base-111,2,9);ctx.fillStyle='#ff83b7';ctx.beginPath();ctx.moveTo(x,base-111);ctx.lineTo(x+12,base-107);ctx.lineTo(x,base-103);ctx.fill();
    rounded(x-5,base-14,10,14,4,'#fa78b2','#ffb8d7');ctx.fillStyle='#ffe8a6';ctx.fillRect(x+1,base-9,2,2);
    ctx.globalAlpha=.45+.22*Math.sin(t*2+c.twinkle);ctx.fillStyle='#ff85bb';ctx.beginPath();ctx.ellipse(x,base+1,42,5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  function drawSilo(x,selected,t){
    const y=GROUND-2;
    ctx.fillStyle='#151934';ctx.beginPath();ctx.ellipse(x,y+3,32,8,0,0,Math.PI*2);ctx.fill();
    rounded(x-25,y-17,50,18,7,'#3b426c','#737da5');rounded(x-18,y-25,36,11,5,'#656c96','#9da6c2');
    rounded(x-11,y-39,22,18,8,'#8087ad','#c4c6d9');rounded(x-7,y-45,14,12,5,'#a4acc8','#eff1ee');
    ctx.fillStyle='#52edf0';ctx.globalAlpha=.7+.3*Math.sin(t*4+x);ctx.beginPath();ctx.arc(x,y-38,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle='#202547';ctx.fillRect(x-21,y-10,42,4);ctx.fillStyle='#ff8cbf';ctx.fillRect(x-13,y-9,26,2);
    if(selected){ctx.strokeStyle='#76f1ed88';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y+2,38,10,0,0,Math.PI*2);ctx.stroke();}
  }
  function drawEnemy(e){
    ctx.save();ctx.lineCap='round';
    for(let i=1;i<e.trail.length;i++){const a=i/e.trail.length;ctx.strokeStyle=`rgba(255,${Math.floor(90+70*a)},${Math.floor(100+45*a)},${a*.22})`;ctx.lineWidth=1+3*a;ctx.beginPath();ctx.moveTo(e.trail[i-1].x,e.trail[i-1].y);ctx.lineTo(e.trail[i].x,e.trail[i].y);ctx.stroke();}
    const glow=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,18);glow.addColorStop(0,'#ffb56f99');glow.addColorStop(1,'#ff5e7c00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(e.x,e.y,18,0,Math.PI*2);ctx.fill();
    ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(e.vy,e.vx)+Math.PI/2);
    ctx.fillStyle='#f85871';ctx.beginPath();ctx.moveTo(0,-8);ctx.quadraticCurveTo(6,-1,4,7);ctx.lineTo(0,10);ctx.lineTo(-4,7);ctx.quadraticCurveTo(-6,-1,0,-8);ctx.fill();
    ctx.fillStyle='#ffe29a';ctx.beginPath();ctx.ellipse(0,1,2.1,4.5,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#ffca75';ctx.globalAlpha=.6+.4*Math.sin(e.phase);ctx.beginPath();ctx.arc(e.x,e.y,2.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  function drawBlast(b){
    const t=Math.min(1,b.age/b.duration),fade=Math.max(0,1-t);
    const g=ctx.createRadialGradient(b.x,b.y,Math.max(1,b.r*.08),b.x,b.y,b.r);
    if(b.player){g.addColorStop(0,`rgba(255,244,198,${.86*fade})`);g.addColorStop(.24,`rgba(255,191,213,${.63*fade})`);g.addColorStop(.66,`rgba(88,234,244,${.25*fade})`);g.addColorStop(1,'rgba(87,230,245,0)');}
    else{g.addColorStop(0,`rgba(255,227,151,${.72*fade})`);g.addColorStop(.4,`rgba(255,114,104,${.42*fade})`);g.addColorStop(1,'rgba(255,98,124,0)');}
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=b.player?`rgba(128,255,248,${fade*.75})`:`rgba(255,191,110,${fade*.65})`;ctx.lineWidth=2.2*fade;ctx.beginPath();ctx.arc(b.x,b.y,b.r*(.81+.08*Math.sin(b.age*17)),0,Math.PI*2);ctx.stroke();
  }
  function draw(){
    const t=performance.now()/1000;
    ctx.setTransform(scaleX,0,0,scaleY,0,0);drawBackground(t);
    for(let i=0;i<cities.length;i++)drawCity(cities[i],i,t);
    for(const x of silos)drawSilo(x,true,t);
    // Incoming missiles are drawn behind the friendly launch trails.
    for(const e of enemies)drawEnemy(e);
    ctx.save();ctx.lineCap='round';
    for(const s of shots){
      const tailX=s.x-s.vx*.028,tailY=s.y-s.vy*.028;
      const trail=ctx.createLinearGradient(tailX,tailY,s.x,s.y);trail.addColorStop(0,'rgba(84,237,245,0)');trail.addColorStop(1,'rgba(154,255,246,.9)');
      ctx.strokeStyle=trail;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(s.x,s.y);ctx.stroke();
      ctx.shadowColor='#86fff5';ctx.shadowBlur=12;ctx.fillStyle='#f5fff0';ctx.beginPath();ctx.arc(s.x,s.y,3.4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }ctx.restore();
    for(const b of blasts)drawBlast(b);
    for(const p of particles){const a=Math.max(0,p.life/p.maxLife);ctx.globalAlpha=a;ctx.fillStyle=`hsl(${p.hue} 100% ${p.hue===45?76:69}%)`;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=7;ctx.beginPath();ctx.arc(p.x,p.y,p.r*a,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    // subtle scan-line / colored pixel glints to keep the toy-like finish
    ctx.globalAlpha=.045;ctx.fillStyle='#dae5ff';for(let y=5;y<H;y+=5)ctx.fillRect(0,y,W,.5);ctx.globalAlpha=1;
  }
  function frame(now){
    if(mode==='playing'){
      const dt=Math.min(.04,Math.max(0,(now-lastTime)/1000));lastTime=now;update(dt);
    }else lastTime=now;
    draw();requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
