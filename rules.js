(() => {
  'use strict';
  class ShuffleBag{
    constructor(items,random=Math.random){if(!items.length)throw Error('Empty bag');this.items=[...items];this.random=random;this.bag=[];this.recent=[];}
    next(){
      if(!this.bag.length){
        this.bag=[...this.items];
        for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
        const blocked=new Set(this.recent);
        const protect=Math.min(2,Math.max(0,this.items.length-blocked.size));
        for(let i=0;i<protect;i++){
          const j=this.bag.findIndex((item,index)=>index>=i && !blocked.has(item));
          if(j>=0)[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];
        }
      }
      const value=this.bag.shift();this.recent.push(value);if(this.recent.length>2)this.recent.shift();return value;
    }
  }
  class Milestones{
    constructor(best=0){this.best=best;this.recordShown=false;this.threshold=0;}
    advance(score){
      const events=[];
      if(score>this.best && !this.recordShown){this.recordShown=true;events.push({kind:'record',text:'НОВЫЙ РЕКОРД!'});}
      const reached=Math.floor(score/100);
      while(this.threshold<reached){this.threshold++;events.push({kind:'score',text:`${this.threshold*100} ОЧКОВ!`});}
      return events;
    }
  }
  window.SkyRules={ShuffleBag,Milestones};
})();
