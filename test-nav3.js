const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();

  var errors = [];
  pg.on('pageerror', err => errors.push(err.message));

  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));

  console.log('JS errors:', errors.length);
  errors.forEach(function(e){ console.log(' ERR:', e.substring(0,200)); });

  await b.close();
})().catch(function(e){console.error(e.message);});
