const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  const pages=[
    {id:'page-home',name:'home'},
    {id:'page-delegate',name:'delegate'},
    {id:'page-dashboard',name:'dashboard'},
    {id:'page-docs',name:'docs'},
    {id:'page-my',name:'my'},
  ];
  for(const {id,name} of pages){
    await pg.evaluate(n=>{ document.querySelectorAll('.pw').forEach(p=>p.style.display='none'); const el=document.getElementById(n); if(el) el.style.display='block'; },id);
    await new Promise(r=>setTimeout(r,600));
    await pg.screenshot({path:`/tmp/pg2-${name}.png`,fullPage:false});
    console.log('shot:',name);
  }
  await b.close();
})().catch(e=>console.error(e.message));
