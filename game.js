(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const canvas=$('game'),ctx=canvas.getContext('2d'),scoreEl=$('score'),bestEl=$('best');
  const overlay=$('overlay'),title=$('title'),message=$('message'),play=$('play');
  const reviveButton=$('revive'),deathText=$('death-message'),result=$('result'),feedback=$('feedback');
  const coinsEl=$('coins'),status=$('status'),wallet=window.SkyWallet,storage=window.SkyStorage;
  const pauseButton=$('pause'),menuButton=$('menu'),toast=$('toast'),toastText=$('toast-text');
  const W=420,H=600,FLOOR=558,R=15,X=110;
  const GRAVITY=1300,FLAP=-390,SPEED=155,GAP=175,PIPE_W=65;
  const deathMessages=[
    'Эбать ты лох','Безрукий уэбан и то справился бы лучше',
    'По твоей вине Кобилджон упал на лестнице','Коч братан...',
    'Труба сегодня оказалась сильнее','Надеюсь монетки выпали во время полёта.'
  ];
  const deathBag=new window.SkyRules.ShuffleBag(deathMessages);
  let milestones=new window.SkyRules.Milestones();
  let state='menu',y=265,velocity=0,score=0,best=0,pipes=[],spawn=0,last=0,accumulator=0;
  let ready=false,busy=false,death=0,deathAge=0,deathSaved=false,pipeId=0;
  let shield=0,flapClock=0,angle=0,menuClock=0,particles=[],coinQueue=Promise.resolve(),walletError='';
  let noticeQueue=[],notice=null,noticeAge=0;
  const scroll={clouds:0,hills:0,ground:0};
  ctx.imageSmoothingEnabled=false;
  function setState(value){state=value;document.body.dataset.state=value;pauseButton.hidden=value!=='playing';}
  function sync(){
    best=wallet.best;bestEl.textContent=String(best).padStart(3,'0');coinsEl.textContent=wallet.balance;
    $('flight-best').textContent=state==='menu'?'ТВОЙ СЛЕДУЮЩИЙ РЕКОРД — ВПЕРЕДИ':`Личный рекорд: ${best}`;
    result.textContent=`Счёт: ${score} · Рекорд: ${best}\nБаланс: ${wallet.balance} монет`;
    reviveButton.disabled=busy||!deathSaved||wallet.balance<20||Boolean(walletError);
    const warning=storage.warning;$('save-warning').textContent=warning;$('save-warning').hidden=!warning;
    status.textContent=!storage.persistent?'Прогресс только до закрытия игры':storage.mode==='device'?'Прогресс сохраняется в Telegram на этом устройстве':storage.mode==='local'?'Сохранение в этом браузере · без облака':'Прогресс только до закрытия игры';
  }
  function details(show){deathText.hidden=!show;result.hidden=!show;reviveButton.hidden=!show;}
  function fail(error){feedback.textContent=error?.message||'Не удалось сохранить данные';}
  function resetNotices(){notice=null;noticeQueue=[];noticeAge=0;toast.hidden=true;}
  function advanceNotices(dt){
    if(!notice && noticeQueue.length){notice=noticeQueue.shift();noticeAge=0;toastText.textContent=notice.text;toast.className='toast '+notice.kind;toast.hidden=false;}
    if(!notice)return;
    noticeAge+=dt;toast.style.opacity=String(Math.max(0,Math.min(1,noticeAge/.18,(1.8-noticeAge)/.25)));
    if(noticeAge>=1.8){notice=null;toast.hidden=true;}
  }
  async function start(){
    if(!ready||busy||state==='dying')return;
    busy=true;play.disabled=true;menuButton.disabled=true;feedback.textContent='';
    try{
      await coinQueue;await wallet.start();walletError='';
      y=265;velocity=FLAP;score=0;pipes=[];spawn=.8;pipeId=0;death=0;shield=0;angle=0;
      particles=[];deathSaved=false;flapClock=0;milestones=new window.SkyRules.Milestones(wallet.best);resetNotices();
      scoreEl.textContent='0';setState('playing');overlay.hidden=true;accumulator=0;last=0;details(false);sync();
      canvas.focus({preventScroll:true});if(document.hidden||window.SkyTelegram.active===false)pause();
    }catch(error){fail(error);}finally{busy=false;play.disabled=false;menuButton.disabled=false;sync();}
  }
  function resume(){
    if(state!=='paused'||busy||document.hidden||window.SkyTelegram.active===false)return;
    setState('playing');overlay.hidden=true;last=0;canvas.focus({preventScroll:true});
  }
  function action(){if(!ready||busy||state!=='playing')return;velocity=FLAP;}
  function pause(){
    if(state!=='playing')return;
    setState('paused');last=0;title.textContent='ПАУЗА';message.textContent='Полёт подождёт. Всё осталось на своих местах.';
    $('eyebrow').textContent='ПЕРЕДЫШКА';play.textContent='Продолжить игру';menuButton.hidden=false;details(false);feedback.textContent='';overlay.hidden=false;
  }
  async function showMenu(){
    if(busy||!ready)return;
    busy=true;play.disabled=true;menuButton.disabled=true;
    try{
      await coinQueue;await wallet.abandon(score);
      setState('menu');score=0;scoreEl.textContent='—';pipes=[];particles=[];shield=0;y=265;velocity=0;angle=0;
      accumulator=0;last=0;resetNotices();title.textContent='Выше облаков.';
      $('eyebrow').textContent='ПОЙМАЙ СВОЙ РИТМ';message.innerHTML='Лети между трубами.<br>Собирай монеты. Не сдавайся.';
      play.textContent='НАЧАТЬ ПОЛЁТ';menuButton.hidden=true;details(false);overlay.hidden=false;feedback.textContent='';sync();
    }catch(error){fail(error);}finally{busy=false;play.disabled=false;menuButton.disabled=false;}
  }
  function end(){
    if(state!=='playing')return;
    setState('dying');death++;deathAge=0;deathSaved=false;shield=0;deathText.textContent=deathBag.next();
    burst(X,y,18,'feather');const finalScore=score,currentDeath=death;
    coinQueue=coinQueue.then(()=>wallet.die(finalScore,currentDeath)).then(()=>{deathSaved=true;sync();}).catch(error=>{walletError=error.message;fail(error);sync();});
  }
  function showDeath(){
    setState('over');title.textContent='Полёт окончен';$('eyebrow').textContent='НЕ ПОСЛЕДНИЙ ПОЛЁТ';
    message.textContent='Монеты дают второй шанс.';play.textContent='Начать заново';menuButton.hidden=false;details(true);sync();overlay.hidden=false;
    deathText.style.animation='none';void deathText.offsetWidth;deathText.style.animation='';
    feedback.textContent=walletError||(!deathSaved?'Сохраняем результат…':'');
  }
  async function revive(){
    if(state!=='over'||busy||!deathSaved||wallet.balance<20||walletError)return;
    busy=true;play.disabled=true;menuButton.disabled=true;sync();feedback.textContent='';
    try{
      await wallet.revive(death);
      const nearby=pipes.find(p=>p.x-4<=X+R+24&&p.x+PIPE_W+4>=X-R-24);
      y=nearby?nearby.top+GAP/2:Math.max(80,Math.min(FLOOR-80,y));
      velocity=FLAP*.65;shield=2;particles=[];setState('playing');overlay.hidden=true;accumulator=0;last=0;canvas.focus({preventScroll:true});
      if(document.hidden||window.SkyTelegram.active===false)pause();
    }catch(error){fail(error);}finally{busy=false;play.disabled=false;menuButton.disabled=false;sync();}
  }
  function circleRect(cx,cy,r,left,top,width,height) {
    const nx=Math.max(left,Math.min(cx,left+width)),ny=Math.max(top,Math.min(cy,top+height));
    return (cx-nx)**2+(cy-ny)**2<=r*r;
  }
  function hits(p) {
    // The wider lip and narrower body use their actual visible rectangles.
    return circleRect(X,y,R,p.x,0,PIPE_W,p.top-18) ||
      circleRect(X,y,R,p.x-4,p.top-18,PIPE_W+8,18) ||
      circleRect(X,y,R,p.x-4,p.top+GAP,PIPE_W+8,18) ||
      circleRect(X,y,R,p.x,p.top+GAP+18,PIPE_W,FLOOR-p.top-GAP-18);
  }
  function burst(x,yy,count,kind) {
    for(let i=0;i<count;i++)particles.push({x,y:yy,vx:(Math.random()-.5)*210,vy:-50-Math.random()*160,life:.45+Math.random()*.35,kind});
  }
  function addPoint(){
    score++;scoreEl.textContent=score;noticeQueue.push(...milestones.advance(score));
    if(score>wallet.best){const value=score;coinQueue=coinQueue.then(()=>wallet.record(value)).then(sync).catch(fail);}
  }
  function update(dt){
    shield=Math.max(0,shield-dt);flapClock+=dt;velocity+=GRAVITY*dt;y+=velocity*dt;spawn+=dt;
    const target=Math.max(-.35,Math.min(1.15,velocity/650));angle+=(target-angle)*(1-Math.exp(-10*dt));
    if(spawn>=1.6){spawn-=1.6;pipes.push({x:W+10,top:95+Math.floor(Math.random()*210),passed:false,id:++pipeId,collected:false});}
    for(const p of pipes)p.x-=SPEED*dt;
    if(shield>0)y=Math.max(R+2,Math.min(FLOOR-R-2,y));
    if(shield===0&&(y-R<=0||y+R>=FLOOR||pipes.some(hits))){end();return;}
    for(const p of pipes){
      if(!p.passed&&p.x+PIPE_W+4<X-R){p.passed=true;addPoint();}
      const cx=p.x+PIPE_W/2,cy=p.top+GAP/2;
      if(!p.collected&&(X-cx)**2+(y-cy)**2<(R+11)**2){
        p.collected=true;burst(cx,cy,9,'gold');
        coinQueue=coinQueue.then(()=>wallet.collect(p.id)).then(sync).catch(error=>{walletError=error.message;fail(error);});
      }
    }
    pipes=pipes.filter(p=>p.x+PIPE_W+4>-5);
  }
  function rect(x,yy,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x/2)*2,Math.round(yy/2)*2,Math.ceil(w/2)*2,Math.ceil(h/2)*2);}
  function cloud(x,yy,s=1){
    const shapes=[[0,14,76,16],[12,6,46,24],[26,0,22,28],[60,18,24,12]];
    for(const [a,b,c,d]of shapes)rect(x+a*s,yy+(b+4)*s,c*s,d*s,'#a9d9e5');
    for(const [a,b,c,d]of shapes)rect(x+a*s,yy+b*s,c*s,(d-5)*s,'#f8f6dc');
    rect(x+16*s,yy+8*s,10*s,4*s,'#ffffff');rect(x+30*s,yy+2*s,12*s,4*s,'#ffffff');
  }
  function pipe(p){
    function body(top,height){
      rect(p.x,top,PIPE_W,height,'#153d43');rect(p.x+4,top,PIPE_W-8,height,'#43865b');
      rect(p.x+8,top,10,height,'#b5d96b');rect(p.x+18,top,8,height,'#77ba5f');
      rect(p.x+PIPE_W-16,top,8,height,'#285747');
      for(let yy=top+28;yy<top+height-6;yy+=40){rect(p.x+28,yy,12,4,'#39724e');rect(p.x+38,yy+4,8,4,'#39724e');}
    }
    function lip(top){rect(p.x-4,top,PIPE_W+8,18,'#153d43');rect(p.x,top+4,PIPE_W,10,'#6bab5b');rect(p.x+4,top+4,PIPE_W-12,4,'#c6e180');rect(p.x+PIPE_W-8,top+8,8,6,'#2d5a46');}
    body(0,p.top-18);body(p.top+GAP+18,FLOOR-p.top-GAP-18);lip(p.top-18);lip(p.top+GAP);
  }
  const sprite=[
    '      ooooo       ',
    '    ooyyyyyoo     ',
    '   oyylllllyyo    ',
    '  oyyllllwwwwo    ',
    ' oyyllllwwkwwo    ',
    ' oyllllwwwkwwo    ',
    'oyyllllwwwwwoooo  ',
    'oyyllllyyyorrrrro ',
    'oyyyyyyyyyorrrro  ',
    ' oyyyyyyyoooooo   ',
    '  oyyyyyaaaao     ',
    '   ooaaaaaao      ',
    '     oooooo      '
  ];
  const palette={o:'#19394b',y:'#f4c64e',l:'#ffe887',w:'#fff8dc',k:'#172d40',r:'#ec8052',a:'#d78f3f'};
  const birdFrames=new Map();
  function birdFrame(phase,dead){
    const key=phase+':'+dead;if(birdFrames.has(key))return birdFrames.get(key);
    const image=document.createElement('canvas');image.width=40;image.height=34;const paint=image.getContext('2d');
    const box=(xx,yy,w,h,color)=>{paint.fillStyle=color;paint.fillRect(xx,yy,w,h);};
    sprite.forEach((row,yy)=>[...row].forEach((c,x)=>{if(palette[c])box(x*2,yy*2,2,2,palette[c]);}));
    const wing=[-4,-3,-1,2,4,3,1,-2][phase];
    box(2,12+wing,14,8,'#19394b');box(4,12+wing,10,4,'#df933d');box(4,12+wing,8,2,'#ffe887');
    if(dead){box(22,6,8,8,'#fff8dc');for(let i=0;i<4;i++){box(22+i*2,6+i*2,2,2,'#19394b');box(28-i*2,6+i*2,2,2,'#19394b');}}
    birdFrames.set(key,image);return image;
  }
  function bird(){
    const menu=state==='menu',by=menu?150+Math.sin(menuClock*2.4)*6:y;
    if(shield>0&&(shield>.5||Math.floor(shield*14)%2===0)){
      const alpha=ctx.globalAlpha;ctx.globalAlpha=.6;rect(X-24,by-20,48,4,'#d1fffa');rect(X-24,by+16,48,4,'#d1fffa');rect(X-26,by-16,4,32,'#d1fffa');rect(X+22,by-16,4,32,'#d1fffa');ctx.globalAlpha=alpha;
    }
    ctx.save();ctx.translate(menu?W/2:X,by);ctx.rotate(menu?Math.sin(menuClock*2)*.06:angle);if(menu)ctx.scale(1.5,1.5);
    ctx.drawImage(birdFrame(Math.floor(flapClock*18)%8,state==='dying'||state==='over'),-18,-14);ctx.restore();
  }
  function coin(p){
    if(p.collected)return;
    const widths=[16,12,6,4,6,12],width=widths[Math.floor(flapClock*9+p.id)%6];
    const cx=p.x+PIPE_W/2,cy=p.top+GAP/2;
    rect(cx-width/2-2,cy-12,width+4,24,'#99612f');rect(cx-width/2,cy-14,width,28,'#c68d36');
    rect(cx-width/2,cy-10,width,20,'#ffd657');rect(cx-width/2,cy-8,Math.max(2,width/3),14,'#fff2a3');
    if(width>=12)rect(cx+2,cy-6,2,12,'#d49b37');
    if(Math.floor(flapClock*5+p.id)%5===0){rect(cx+14,cy-18,2,8,'#fff8dc');rect(cx+12,cy-16,6,2,'#fff8dc');}
  }
  function draw(){
    rect(0,0,W,H,'#78c7ec');rect(0,330,W,230,'#a2dfec');
    rect(328,50,40,40,'#f9df83');rect(320,58,56,24,'#f9df83');rect(332,54,28,4,'#fff0b1');
    for(let x=-640;x<W+640;x+=640){cloud(x-scroll.clouds+20,68,1);cloud(x-scroll.clouds+280,160,.75);cloud(x-scroll.clouds+490,110,.5);}
    for(let base=-480;base<W+480;base+=480){
      const xx=base-scroll.hills;
      for(let k=0;k<7;k++)rect(xx+k*16,440-k*10,224-k*32,FLOOR-440+k*10,'#73b9a4');
      for(let k=0;k<5;k++)rect(xx+230+k*18,472-k*12,180-k*36,FLOOR-472+k*12,'#4c9b91');
      rect(xx+94,388,6,8,'#4f8f84');rect(xx+120,396,6,8,'#4f8f84');
    }
    for(const p of pipes){pipe(p);coin(p);}
    rect(0,FLOOR,W,H-FLOOR,'#a56845');rect(0,FLOOR,W,8,'#214b46');rect(0,FLOOR+2,W,4,'#a7d96a');rect(0,FLOOR+8,W,6,'#6e9e51');
    for(let x=-84;x<W+84;x+=28){const xx=x-scroll.ground%28;rect(xx,FLOOR+14,24,2,'#e5ae6c');rect(xx+6,FLOOR+22,6,4,'#d39458');rect(xx+20,FLOOR+32,6,4,'#754f3e');}
    if(state==='dying'){ctx.save();ctx.translate(Math.round(Math.sin(deathAge*80)*(1-deathAge/.55)*3)*2,0);bird();ctx.restore();}else bird();
    for(const p of particles){
      const alpha=ctx.globalAlpha;ctx.globalAlpha=Math.min(1,p.life*3);
      if(p.kind==='gold'){rect(p.x,p.y,4,4,'#fff0a0');rect(p.x-2,p.y+2,8,2,'#ffd657');}
      else {rect(p.x,p.y,6,2,'#fff5d0');rect(p.x+2,p.y-2,2,6,'#f7ce6b');}
      ctx.globalAlpha=alpha;
    }

    if(state==='dying' && deathAge<.12){ctx.fillStyle='#fff4d577';ctx.fillRect(0,0,W,H);}
  }
  function frame(time){
    const elapsed=last?Math.min((time-last)/1000,.05):0;last=time;
    if(!document.hidden){
      if(state==='playing'||state==='menu'){
        scroll.clouds=(scroll.clouds+elapsed*9)%640;scroll.hills=(scroll.hills+elapsed*23)%480;
        if(state==='playing')scroll.ground=(scroll.ground+elapsed*SPEED)%84;
        else {flapClock+=elapsed;menuClock+=elapsed;}
      }
      if(state==='playing'||state==='dying'){
        for(const p of particles){p.life-=elapsed;p.x+=p.vx*elapsed;p.y+=p.vy*elapsed;p.vy+=260*elapsed;}
        particles=particles.filter(p=>p.life>0);
      }
      if(state==='playing'){
        accumulator+=elapsed;
        while(accumulator>=1/120&&state==='playing'){update(1/120);accumulator-=1/120;}
        advanceNotices(elapsed);
      }
      if(state==='dying'){deathAge+=elapsed;angle+=(1.1-angle)*(1-Math.exp(-8*elapsed));if(deathAge>=.55)showDeath();}
      if(state==='over'&&deathSaved&&feedback.textContent==='Сохраняем результат…')feedback.textContent='';
    }
    $('shield').hidden=shield<=0||state!=='playing';if(shield>0)$('shield').textContent=`ЗАЩИТА ${shield.toFixed(1)} с`;
    draw();requestAnimationFrame(frame);
  }
  function fitField(){
    const stage=$('stage'),field=$('field');
    const width=Math.max(4,Math.min(stage.clientWidth-12,(stage.clientHeight-12)*W/H));
    field.style.width=(width+8)+'px';field.style.height=(width*H/W+8)+'px';
  }
  play.addEventListener('click',e=>{e.stopPropagation();if(state==='paused')resume();else if(state==='menu'||state==='over')void start();});
  reviveButton.addEventListener('click',e=>{e.stopPropagation();void revive();});
  pauseButton.addEventListener('click',e=>{e.stopPropagation();pause();});
  menuButton.addEventListener('click',e=>{e.stopPropagation();void showMenu();});
  overlay.addEventListener('pointerdown',e=>e.stopPropagation());
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();if(e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;action();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(e.repeat)return;
    if(e.code==='Escape'){e.preventDefault();if(state==='paused')resume();else pause();return;}
    if(e.code==='Space'&&e.target?.tagName!=='BUTTON'){e.preventDefault();action();}
  });
  window.SkyTelegram.onPause(pause);
  $('fullscreen').hidden=!window.SkyTelegram.canFullscreen;
  $('fullscreen').addEventListener('click',()=>window.SkyTelegram.fullscreen());
  window.addEventListener('sky:resize',()=>{fitField();$('fullscreen').setAttribute('aria-label',window.SkyTelegram.isFullscreen?'Выйти из полноэкранного режима':'На весь экран');});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitField).observe($('stage'));
  play.disabled=true;
  wallet.subscribe(sync);
  wallet.init().then(()=>{ready=true;play.disabled=false;play.textContent='НАЧАТЬ ПОЛЁТ';setState('menu');sync();fitField();})
    .catch(error=>{fail(error);title.textContent='Не удалось открыть игру';});
  fitField();requestAnimationFrame(frame);
})();



