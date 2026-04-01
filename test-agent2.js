const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  await pg.evaluate(()=>{ document.querySelectorAll('.pw').forEach(p=>p.style.display='none'); document.getElementById('page-dashboard').style.display='block'; });
  await new Promise(r=>setTimeout(r,500));
  await pg.screenshot({path:'/tmp/pg-agent2.png',fullPage:true});
  console.log('done');
  await b.close();
})().catch(e=>console.error(e));
