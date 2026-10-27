/* Local saves only. No identity, authentication, cloud storage or network calls. */
(() => {
  'use strict';
  const KEY='sky-hop-progress-v3',LEGACY='sky-hop-wallet-v2';
  let data={version:3,balance:0,best:0,revision:0},mode='memory',warning='',writable=false;
  let initialized=null,tail=Promise.resolve(),bridge=null;
  const listeners=new Set();
  const valid=v=>Number.isSafeInteger(v) && v>=0;
  function decode(raw){
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(!value || !valid(value.balance) || !valid(value.best))throw Error('Некорректное сохранение');
    return {version:3,balance:value.balance,best:value.best,revision:valid(value.revision)?value.revision:0};
  }
  function emit(){for(const listener of listeners){try{listener({...data},{mode,warning,writable});}catch{}}}
  function device(method,...args){
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(Error(String(error))):resolve(value);};
      const timer=setTimeout(()=>finish('Хранилище не ответило'),3500);
      try{bridge[method](...args,(error,value)=>finish(error,method==='setItem' && value!==true?'WRITE_FAILED':value));}
      catch(error){finish(error);}
    });
  }
  async function persist(){
    if(mode==='device'){
      const result=await device('setItem',KEY,JSON.stringify(data));
      if(result!==true)throw Error('Запись отклонена');
    }else if(mode==='local')window.localStorage.setItem(KEY,JSON.stringify(data));
  }
  async function boot(){
    const tg=window.Telegram?.WebApp;
    const supported=tg?.DeviceStorage && typeof tg.DeviceStorage.getItem==='function' && typeof tg.DeviceStorage.setItem==='function' && tg.isVersionAtLeast?.('9.0');
    if(supported){
      bridge=tg.DeviceStorage;
      try{
        const raw=await device('getItem',KEY);data=decode(raw)||data;mode='device';writable=true;
        // Do not import browser saves into a user-isolated DeviceStorage bucket.
        emit();return {...data};
      }catch{
        warning='Хранилище Telegram недоступно. Используем сохранение этого браузера.';
      }
    }
    mode='local';
    try{
      const raw=window.localStorage.getItem(KEY);
      data=decode(raw)||decode(window.localStorage.getItem(LEGACY))||data;
      const old=Number(window.localStorage.getItem('sky-hop-best'));
      if(valid(old))data.best=Math.max(data.best,old);
      await persist();writable=true;
    }catch{
      mode='memory';writable=false;warning='Прогресс сейчас хранится только до закрытия игры: запись на устройстве недоступна.';
    }
    emit();return {...data};
  }
  window.SkyStorage={
    init(){return initialized??=(boot());},
    get data(){return {...data};},get mode(){return mode;},get warning(){return warning;},get persistent(){return writable;},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    update(change){
      const task=tail.then(async()=>{
        await this.init();
        const next={...data};change(next);
        if(!valid(next.balance)||!valid(next.best))throw Error('Недопустимый баланс или рекорд');
        if(next.balance===data.balance && next.best===data.best)return {...data};
        next.revision=data.revision+1;data=next;emit();
        if(writable){
          try{await persist();}
          catch{writable=false;warning='Не удалось сохранить прогресс. Последние изменения могут исчезнуть после закрытия игры.';emit();}
        }
        return {...data};
      });
      tail=task.catch(()=>{});return task;
    },
    flush(){return tail;}
  };
})();


