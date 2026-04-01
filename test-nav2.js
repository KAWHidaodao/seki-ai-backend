const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();

  // 捕获 console 输出
  pg.on('console', msg => console.log('BROWSER:', msg.text()));
  pg.on('pageerror', err => console.log('PAGE_ERR:', err.message));

  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));

  // 直接调用 G('dashboard', null) 并观察结果
  var result = await pg.evaluate(function(){
    var before = document.getElementById('page-dashboard') ? document.getElementById('page-dashboard').style.display : 'not found';
    try {
      G('dashboard', null);
    } catch(e) {
      return {error: e.message, before: before};
    }
    var after = document.getElementById('page-dashboard') ? document.getElementById('page-dashboard').style.display : 'not found';
    var cssText = document.getElementById('page-dashboard') ? document.getElementById('page-dashboard').style.cssText : '';
    // 找所有 display:none 的 pw/page
    var hidden = [];
    document.querySelectorAll('.pw,.page').forEach(function(el){
      if(el.style.display === 'none' || el.style.display === '') hidden.push(el.id);
    });
    var shown = [];
    document.querySelectorAll('.pw,.page').forEach(function(el){
      if(el.style.display !== 'none' && el.style.display !== '') shown.push({id:el.id, display:el.style.display});
    });
    return {before:before, after:after, cssText:cssText, hidden:hidden, shown:shown};
  });
  console.log('G() result:', JSON.stringify(result, null, 2));

  await b.close();
})().catch(function(e){console.error(e.message);});
