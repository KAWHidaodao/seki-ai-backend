const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  const m = await pg.evaluate(()=>{
    // 找所有直接子元素
    const hero = document.querySelector('.hero-root');
    if(!hero) return {err:'no hero-root'};
    const r = hero.getBoundingClientRect();
    // 找内容块（z-index:2的div）
    const kids = Array.from(hero.children).map(c=>({
      tag:c.tagName, cls:c.className, style:c.style.cssText.slice(0,60),
      rect: c.getBoundingClientRect()
    }));
    return {heroRect:{left:r.left,width:r.width,top:r.top,height:r.height}, kids};
  });
  console.log('hero rect:', JSON.stringify(m.heroRect));
  m.kids && m.kids.forEach((k,i)=>console.log(`kid[${i}]`, k.cls||k.style, 'left:', k.rect.left, 'w:', k.rect.width, 'center:', (k.rect.left+k.rect.width/2).toFixed(0)));
  await b.close();
})().catch(e=>console.error(e));
