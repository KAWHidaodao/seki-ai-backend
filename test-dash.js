const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  var errs=[];
  pg.on('pageerror',e=>errs.push(e.message));
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  await pg.evaluate(function(){ G('dashboard',null); });
  await new Promise(r=>setTimeout(r,3000));
  await pg.screenshot({path:'/tmp/v3-dashboard.png',fullPage:false});
  console.log('JS errors:', errs.length);
  // 验证价格是否加载
  const bnb = await pg.evaluate(function(){ return document.getElementById('okx-bnb-price').textContent; });
  console.log('BNB price displayed:', bnb);
  await b.close();
})().catch(e=>console.error(e.message));
