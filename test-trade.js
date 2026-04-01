const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  var errs=[];
  pg.on('pageerror',e=>errs.push(e.message));
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  
  // 进入委托 Agent 页
  await pg.evaluate(function(){ G('delegate',null); });
  await new Promise(r=>setTimeout(r,800));
  await pg.screenshot({path:'/tmp/v3-delegate-task.png',fullPage:false});
  
  // 切换到 AI 跟单交易 tab
  await pg.evaluate(function(){ dgSwitchMode('trade'); });
  await new Promise(r=>setTimeout(r,500));
  await pg.screenshot({path:'/tmp/v3-delegate-trade.png',fullPage:false});
  
  console.log('JS errors:', errs.length);
  if(errs.length) errs.forEach(e=>console.log(' ERR:', e.slice(0,100)));
  await b.close();
})().catch(e=>console.error(e.message));
