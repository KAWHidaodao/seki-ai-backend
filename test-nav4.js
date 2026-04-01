const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();

  var errors = [];
  pg.on('pageerror', err => errors.push({msg:err.message, stack:err.stack}));

  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));

  errors.forEach(function(e){
    console.log('ERR:', e.msg);
    // 找行号
    var lines = (e.stack||'').split('\n');
    lines.forEach(function(l){ if(l.includes('seki-ai.com')) console.log('  AT:', l); });
  });

  await b.close();
})().catch(function(e){console.error(e.message);});
