const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:390,height:844}); // iPhone size
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));

  var pages = ['home','dashboard','delegate','launch','docs','my'];
  for(var i=0;i<pages.length;i++){
    var id = pages[i];
    await pg.evaluate(function(id){ G(id,null); }, id);
    await new Promise(r=>setTimeout(r,600));
    await pg.screenshot({path:'/tmp/pg-'+id+'.png', fullPage:false});
    console.log('shot: '+id);
  }
  await b.close();
})().catch(function(e){console.error(e.message);});
