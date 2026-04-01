const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  await pg.evaluate(function(){ G('dashboard',null); });
  await new Promise(r=>setTimeout(r,3000));
  // 截完整页面
  await pg.screenshot({path:'/tmp/v3-signal.png',fullPage:true});
  const signalWall = await pg.evaluate(function(){
    const el = document.getElementById('signal-wall');
    return el ? el.innerHTML.slice(0,200) : 'not found';
  });
  console.log('signal wall:', signalWall.slice(0,100));
  await b.close();
})().catch(e=>console.error(e.message));
