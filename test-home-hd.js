const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,2000));
  // 截 viewport (首屏)
  await pg.screenshot({path:'/tmp/hero-viewport.png',fullPage:false});
  // 截全页
  await pg.screenshot({path:'/tmp/hero-full.png',fullPage:true});
  console.log('done');
  await b.close();
})().catch(e=>console.error(e));
