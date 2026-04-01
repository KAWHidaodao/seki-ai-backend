const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,5000)); // 等数据加载
  await pg.screenshot({path:'/tmp/hero-market.png',fullPage:false});
  const bnb=await pg.$eval('#hero-bnb-price',e=>e.textContent).catch(()=>'not found');
  console.log('BNB price:', bnb);
  await b.close();
})().catch(e=>console.error(e));
