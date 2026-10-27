'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const KEY='sky-hop-progress-v3';
const source=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<6;i++)await tick();}
function environment(options={}){
  const nodes={},events={},deviceEvents={},memory={...options.memory},calls=[];
  const context=new Proxy({globalAlpha:1},{get:(object,key)=>key in object?object[key]:(...args)=>{calls.push([key,...args]);}});
  function node(id){return nodes[id]??={textContent:'',hidden:false,disabled:false,innerHTML:'',className:'',style:{setProperty(){}},dataset:{},tagName:['play','revive','pause','menu','fullscreen'].includes(id)?'BUTTON':'DIV',clientWidth:366,clientHeight:560,
    addEventListener(name,fn){events[id+':'+name]=fn;},getContext(){return context;},focus(){},setAttribute(k,v){this[k]=v;}};}
  const document={hidden:false,body:{dataset:{}},documentElement:node('root'),getElementById:node,createElement:()=>node('sprite'+Math.random()),addEventListener(name,fn){events['document:'+name]=fn;}};
  const box={console,document,innerHeight:844,innerWidth:390,Event:class{constructor(type){this.type=type;}},requestAnimationFrame(){},
    addEventListener(name,fn){events['window:'+name]=fn;},dispatchEvent(e){events['window:'+e.type]?.(e);},
    setTimeout:(fn,ms)=>setTimeout(fn,ms===3500?30:ms),clearTimeout,
    localStorage:{getItem(k){if(options.blockRead)throw Error('denied');return memory[k]??null;},setItem(k,v){if(options.blockWrite)throw Error('quota');memory[k]=v;}}};
  if(options.telegram || options.device){box.Telegram={WebApp:{viewportHeight:844,isActive:true,isVersionAtLeast:()=>true,ready(){},expand(){},setHeaderColor(){},lockOrientation(){},onEvent(n,fn){deviceEvents[n]=fn;},DeviceStorage:options.device}};}
  if(options.telegram)Object.defineProperties(box.Telegram.WebApp,Object.getOwnPropertyDescriptors(options.telegram));
  box.window=box;vm.createContext(box);
  for(const name of ['storage.js','wallet.js','rules.js','telegram.js'])vm.runInContext(source(name),box,{filename:name});
  if(options.game!==false){
    let game=source('game.js');
    game=game.replace('  fitField();requestAnimationFrame(frame);',`  globalThis.inspect={start,pause,resume,showMenu,end,revive,action,update,addPoint,frame,draw,advanceNotices,deathBag,queue:()=>coinQueue,get:()=>({state,y,velocity,score,angle,shield,death,flapClock,pipes,particles,scroll,noticeAge,notice,noticeQueue,ready}),set:v=>{if(v.y!==undefined)y=v.y;if(v.velocity!==undefined)velocity=v.velocity;if(v.score!==undefined)score=v.score;if(v.pipes)pipes=v.pipes;}};\n  fitField();requestAnimationFrame(frame);`);
    vm.runInContext(game,box,{filename:'game.js'});
  }
  return {box,nodes,events,deviceEvents,memory,calls,t:box.inspect,storage:box.SkyStorage,wallet:box.SkyWallet};
}
function deviceStore(memory={},options={}){
  return {getItem(key,cb){if(options.never)return;setTimeout(()=>cb(options.readError||null,memory[key]??null),options.delay||0);},setItem(key,value,cb){if(options.writeError){cb('denied');return;}memory[key]=value;setTimeout(()=>cb(null,true),options.delay||0);}};
}
const snapshot=value=>JSON.parse(JSON.stringify(value));
test('main menu waits for async restore; DeviceStorage is preferred and identity is never accessed',async()=>{
  const saved={[KEY]:JSON.stringify({balance:31,best:123,revision:2})};
  const e=environment({device:deviceStore(saved,{delay:3}),telegram:{get initData(){throw Error('must not access identity');}},memory:{[KEY]:JSON.stringify({balance:999,best:999})}});
  assert.equal(e.nodes.play.disabled,true);assert.equal(e.t.get().state,'menu');await e.storage.init();await settle();
  assert.equal(e.nodes.play.disabled,false);assert.equal(e.nodes.coins.textContent,31);assert.equal(e.nodes.best.textContent,'123');assert.equal(e.storage.mode,'device');
  e.t.action();assert.equal(e.t.get().state,'menu');await e.t.start();assert.equal(e.t.get().state,'playing');
});
test('pause freezes physics, coins, particles, angle, notifications and parallax; resume preserves velocity',async()=>{
  const e=environment();await e.storage.init();await settle();await e.t.start();
  e.t.set({y:250,velocity:83,pipes:[{x:300,top:150,id:1,collected:false,passed:false}]});e.t.addPoint();e.t.frame(100);e.t.frame(116);e.t.pause();
  const before=snapshot(e.t.get());e.t.frame(200);e.t.frame(800);assert.deepEqual(snapshot(e.t.get()),before);
  e.t.action();assert.deepEqual(snapshot(e.t.get()),before);e.t.resume();assert.equal(e.t.get().velocity,before.velocity);assert.equal(e.t.get().y,before.y);assert.equal(e.t.get().score,before.score);
  e.t.frame(1000);assert.equal(e.t.get().y,before.y);e.t.frame(1017);assert.notEqual(e.t.get().y,before.y);
});
test('Escape, Telegram minimize, blur and visibility pause without automatic resume',async()=>{
  const e=environment({telegram:{}});await e.storage.init();await settle();await e.t.start();
  const key={code:'Escape',preventDefault(){}};e.events['document:keydown'](key);assert.equal(e.t.get().state,'paused');e.events['document:keydown'](key);assert.equal(e.t.get().state,'playing');
  e.deviceEvents.deactivated();assert.equal(e.t.get().state,'paused');e.deviceEvents.activated();assert.equal(e.t.get().state,'paused');e.t.resume();
  e.box.document.hidden=true;e.events['document:visibilitychange']();assert.equal(e.t.get().state,'paused');e.box.document.hidden=false;e.events['document:visibilitychange']();e.t.resume();assert.equal(e.t.get().state,'playing');
  e.events['window:blur']();assert.equal(e.t.get().state,'paused');
});
test('pause to main menu closes attempt and keeps coins/record; controls do not flap',async()=>{
  const e=environment({memory:{[KEY]:JSON.stringify({balance:25,best:3})}});await e.storage.init();await settle();await e.t.start();
  e.t.set({score:12,velocity:80});e.events['pause:click']({stopPropagation(){}});assert.equal(e.t.get().velocity,80);await e.t.showMenu();
  assert.equal(e.t.get().state,'menu');assert.equal(e.wallet.balance,25);assert.equal(e.wallet.best,12);assert.equal(e.t.get().pipes.length,0);await e.t.start();assert.equal(e.t.get().score,0);
});
test('100/200/300 and arbitrary thresholds are universal and record notification fires once per attempt',async()=>{
  const e=environment({game:false});const M=e.box.SkyRules.Milestones,m=new M(99);
  assert.equal(m.advance(99).length,0);assert.deepEqual(snapshot(m.advance(100)),[{kind:'record',text:'НОВЫЙ РЕКОРД!'},{kind:'score',text:'100 ОЧКОВ!'}]);
  assert.equal(m.advance(100).length,0);assert.deepEqual(snapshot(m.advance(300)).map(v=>v.text),['200 ОЧКОВ!','300 ОЧКОВ!']);
  assert.equal(m.advance(1000).at(-1).text,'1000 ОЧКОВ!');assert.equal(m.advance(1000).length,0);
});
test('notification expires after 1.8 seconds and new record is saved before death',async()=>{
  const e=environment();await e.storage.init();await settle();await e.t.start();e.t.addPoint();await e.t.queue();assert.equal(e.wallet.best,1);
  e.t.advanceNotices(.2);assert.equal(e.nodes.toast.hidden,false);assert.equal(e.nodes['toast-text'].textContent,'НОВЫЙ РЕКОРД!');e.t.advanceNotices(1.61);assert.equal(e.nodes.toast.hidden,true);
  const reopened=environment({memory:e.memory,game:false});await reopened.storage.init();assert.equal(reopened.wallet.best,1);
});
test('shuffle bag uses every phrase once and protects last two at bag boundaries',()=>{
  const e=environment({game:false}),items=['a','b','c','d','e','f'];
  for(const random of [()=>0,()=>.999,Math.random]){
    const bag=new e.box.SkyRules.ShuffleBag(items,random);let previous=[];
    for(let group=0;group<100;group++){
      const values=Array.from({length:6},()=>bag.next());assert.equal(new Set(values).size,6);
      if(previous.length)for(const value of values.slice(0,2))assert.ok(!previous.slice(-2).includes(value));previous=values;
    }
  }
});
test('collect, collision, safe revive for 20, double-click protection, shield and restart',async()=>{
  const e=environment({memory:{[KEY]:JSON.stringify({balance:20,best:2})}});await e.storage.init();await settle();await e.t.start();
  e.t.set({y:265,pipes:[{x:78,top:177.5,id:1,collected:false,passed:false}]});e.t.update(1/120);await e.t.queue();assert.equal(e.wallet.balance,21);e.t.update(1/120);await e.t.queue();assert.equal(e.wallet.balance,21);
  e.t.set({score:7,y:100,pipes:[{x:100,top:180,id:2,collected:true,passed:false}]});e.t.update(1/120);assert.equal(e.t.get().state,'dying');await e.t.queue();e.t.frame(100);for(let t=150;t<850;t+=50)e.t.frame(t);assert.equal(e.t.get().state,'over');
  await Promise.all([e.t.revive(),e.t.revive()]);assert.equal(e.wallet.balance,1);assert.equal(e.t.get().score,7);assert.equal(e.t.get().y,267.5);assert.equal(e.t.get().shield,2);
  e.t.set({y:550});e.t.update(1/120);assert.equal(e.t.get().state,'playing');await e.t.start();assert.equal(e.wallet.balance,1);assert.equal(e.t.get().score,0);
});
test('DeviceStorage survives reopen; legacy local saves migrate only in browser fallback',async()=>{
  const deviceMemory={},device=deviceStore(deviceMemory),e=environment({device,game:false});await e.storage.init();await e.wallet.start();await e.wallet.collect(1);await e.wallet.record(44);
  const next=environment({device,game:false});await next.storage.init();assert.equal(next.wallet.balance,1);assert.equal(next.wallet.best,44);
  const local=environment({game:false,memory:{'sky-hop-wallet-v2':JSON.stringify({balance:27,best:8}),'sky-hop-best':'9'}});await local.storage.init();assert.equal(local.wallet.balance,27);assert.equal(local.wallet.best,9);
});
test('unsupported/failed DeviceStorage falls back, and storage errors keep gameplay with a visible warning',async()=>{
  const failed=environment({game:false,device:deviceStore({},{readError:'unavailable'})});await failed.storage.init();assert.equal(failed.storage.mode,'local');assert.ok(failed.storage.warning);
  const timeout=environment({game:false,device:deviceStore({},{never:true})});await timeout.storage.init();assert.equal(timeout.storage.mode,'local');
  const blocked=environment({blockRead:true,blockWrite:true});await blocked.storage.init();await settle();assert.equal(blocked.nodes.play.disabled,false);assert.equal(blocked.nodes['save-warning'].hidden,false);await blocked.t.start();await blocked.wallet.collect(1);assert.equal(blocked.wallet.balance,1);
  const failWrite=environment({game:false,device:deviceStore({},{writeError:true})});await failWrite.storage.init();await failWrite.wallet.start();await failWrite.wallet.collect(1);assert.equal(failWrite.wallet.balance,1);assert.ok(failWrite.storage.warning);
});
test('wallet serializes concurrent coin/record writes and refuses insufficient or repeated revival',async()=>{
  const e=environment({game:false});await e.storage.init();await e.wallet.start();await Promise.all(Array.from({length:25},(_,i)=>e.wallet.collect(i+1)));await e.wallet.collect(1);assert.equal(e.wallet.balance,25);
  await e.wallet.die(3,1);const results=await Promise.allSettled([e.wallet.revive(1),e.wallet.revive(1)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(e.wallet.balance,5);
  await e.wallet.die(4,2);await assert.rejects(e.wallet.revive(2));assert.equal(e.wallet.balance,5);await e.wallet.record(2);assert.equal(e.wallet.best,4);
});
test('bird tilt eases rather than snapping, and touch ignores extra fingers/right clicks',async()=>{
  const e=environment();await e.storage.init();await settle();await e.t.start();e.t.set({y:265,velocity:300});e.t.update(1/120);assert.ok(e.t.get().angle>0&&e.t.get().angle<.1);
  const before=e.t.get().angle;e.t.action();e.t.update(1/120);assert.ok(Math.abs(e.t.get().angle-before)<.1);
  e.t.set({velocity:0});e.events['game:pointerdown']({preventDefault(){},isPrimary:false,button:0});assert.equal(e.t.get().velocity,0);e.events['game:pointerdown']({preventDefault(){},isPrimary:true,button:0});assert.equal(e.t.get().velocity,-390);e.t.draw();
});
test('static build has relative assets and no server, identity, cloud or API dependency',()=>{
  const html=source('index.html');for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(!match[1].startsWith('https:'))assert.ok(fs.existsSync(path.join(__dirname,match[1])));}
  for(const file of ['game.js','wallet.js','storage.js','telegram.js','rules.js'])assert.doesNotMatch(source(file),/initData|CloudStorage|fetch\s*\(|BOT_TOKEN|\/api\//);
  assert.equal(fs.existsSync(path.join(__dirname,'server.cjs')),false);
});


test('safe-area updates, stale viewport height and fullscreen remain optional',async()=>{
  let full=false,locked=0;
  const e=environment({game:false,telegram:{viewportHeight:2000,safeAreaInset:{top:10,bottom:8},contentSafeAreaInset:{top:12,bottom:4},lockOrientation(){locked++;},requestFullscreen(){full=true;},exitFullscreen(){full=false;}}});
  const values={};e.box.document.documentElement.style.setProperty=(k,v)=>values[k]=v;e.box.SkyTelegram.fit();
  assert.equal(values['--app-height'],'844px');assert.equal(values['--safe-top'],'22px');assert.equal(values['--safe-bottom'],'12px');assert.ok(locked>0);
  assert.equal(e.box.SkyTelegram.canFullscreen,true);e.box.SkyTelegram.fullscreen();assert.equal(full,true);
  e.box.Telegram.WebApp.isFullscreen=true;e.box.SkyTelegram.fullscreen();assert.equal(full,false);
});
