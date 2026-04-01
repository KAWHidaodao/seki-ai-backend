const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  
  const m = await pg.evaluate(()=>{
    const hero = document.querySelector('.hero-root');
    const content = document.querySelector('.hero-root .hero-content, .hero-root > div[style*="z-index:2"]');
    const left = document.querySelector('.hero-root h1');
    const right = document.querySelector('#hero-dashboard-card, .hero-root [style*="background:rgba(10"]');
    const vp = {w: window.innerWidth, h: window.innerHeight};
    return {
      vp,
      hero: hero ? hero.getBoundingClientRect() : null,
      content: content ? content.getBoundingClientRect() : null,
      left: left ? left.getBoundingClientRect() : null,
      right: right ? right.getBoundingClientRect() : null,
    };
  });
  console.log('viewport:', m.vp);
  console.log('hero:', JSON.stringify(m.hero));
  console.log('content:', JSON.stringify(m.content));
  console.log('left(h1):', JSON.stringify(m.left));
  console.log('right(card):', JSON.stringify(m.right));
  
  if(m.hero && m.content){
    const heroCenter = m.hero.left + m.hero.width/2;
    const contentCenter = m.content ? m.content.left + m.content.width/2 : 0;
    console.log('hero center x:', heroCenter.toFixed(0));
    console.log('content center x:', contentCenter.toFixed(0));
    console.log('offset:', (contentCenter - heroCenter).toFixed(0), 'px');
  }
  await b.close();
})().catch(e=>console.error(e));
