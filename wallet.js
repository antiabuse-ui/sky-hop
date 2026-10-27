/* Keep the game's wallet interface; all operations now stay on the device. */
(() => {
  'use strict';
  const storage=window.SkyStorage;let run=null;
  window.SkyWallet={
    get balance(){return storage.data.balance;},get best(){return storage.data.best;},
    init:()=>storage.init(),subscribe:listener=>storage.subscribe(listener),
    async start(){await storage.flush();run={coins:new Set(),dead:false,death:0,reviving:false};},
    async collect(id){
      const current=run;
      if(!current || current.dead || current.coins.has(id))return;
      current.coins.add(id);
      try{await storage.update(value=>value.balance++);}catch(error){current.coins.delete(id);throw error;}
    },
    record(score){return storage.update(value=>{value.best=Math.max(value.best,score);});},
    async die(score,death){
      if(!run)throw Error('Начни новую попытку');
      run.dead=true;run.death=death;await this.record(score);
    },
    async abandon(score){await this.record(score);run=null;},
    async revive(death){
      const current=run;
      if(!current?.dead || current.death!==death || current.reviving)throw Error('Это возрождение уже использовано');
      current.reviving=true;
      try{
        await storage.update(value=>{if(value.balance<20)throw Error('Нужно 20 монет');value.balance-=20;});
        current.dead=false;
      }finally{current.reviving=false;}
    }
  };
})();
