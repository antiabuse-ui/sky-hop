/* Optional Telegram UI features; never reads user IDs or authorization data. */
(() => {
  'use strict';
  const tg=window.Telegram?.WebApp,root=document.documentElement;
  const onPause=new Set();let active=!document.hidden && tg?.isActive!==false;
  const supports=v=>Boolean(tg?.isVersionAtLeast?.(v));
  function fit(){
    const available=window.visualViewport?.height || window.innerHeight;
    const height=Math.min(tg?.viewportHeight || available,available);
    root.style.setProperty('--app-height',`${height}px`);
    for(const edge of ['top','bottom','left','right']){
      const safe=Number(tg?.safeAreaInset?.[edge])||0,content=Number(tg?.contentSafeAreaInset?.[edge])||0;
      root.style.setProperty(`--safe-${edge}`,`${Math.max(0,safe+content)}px`);
    }
    if(supports('8.0') && window.innerHeight>=window.innerWidth){try{tg.lockOrientation();}catch{}}
    window.dispatchEvent(new Event('sky:resize'));
  }
  function pause(){active=false;for(const callback of onPause)callback();}
  function activate(){active=!document.hidden && tg?.isActive!==false;}
  try{tg?.ready();tg?.expand();tg?.setHeaderColor?.('#132c3e');}catch{}
  for(const name of ['viewportChanged','safeAreaChanged','contentSafeAreaChanged','fullscreenChanged']){try{tg?.onEvent(name,fit);}catch{}}
  try{tg?.onEvent('deactivated',pause);tg?.onEvent('activated',activate);}catch{}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else activate();});
  window.addEventListener('blur',pause);window.addEventListener('pagehide',pause);window.addEventListener('focus',activate);window.addEventListener('pageshow',activate);
  window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);
  window.SkyTelegram={
    onPause(callback){onPause.add(callback);},get active(){return active;},
    get canFullscreen(){return supports('8.0') && typeof tg?.requestFullscreen==='function';},
    get isFullscreen(){return Boolean(tg?.isFullscreen);},
    fullscreen(){try{if(tg?.isFullscreen)tg.exitFullscreen();else tg?.requestFullscreen();}catch{ return false;}return true;},
    fit
  };
  fit();
})();


