const p=require('puppeteer');
(async()=>{
  const b=await p.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote']});
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:900});
  await pg.goto('https://seki-ai.com',{waitUntil:'domcontentloaded',timeout:15000});
  await new Promise(r=>setTimeout(r,1500));
  
  const info = await pg.evaluate(function(){
    var nav = document.querySelector('.nav');
    var wrapper = document.querySelector('.nav-wrapper');
    var btn = document.querySelector('.nl');
    var navStyle = nav ? window.getComputedStyle(nav) : {};
    var wrapperStyle = wrapper ? window.getComputedStyle(wrapper) : {};
    var btnStyle = btn ? window.getComputedStyle(btn) : {};
    var btnRect = btn ? btn.getBoundingClientRect() : {};
    return {
      navPE: navStyle.pointerEvents,
      wrapperPE: wrapperStyle.pointerEvents,
      btnPE: btnStyle.pointerEvents,
      navZIndex: navStyle.zIndex,
      wrapperZIndex: wrapperStyle.zIndex,
      btnVisible: btnStyle.visibility,
      btnDisplay: btnStyle.display,
      btnRect: {top: btnRect.top, left: btnRect.left, width: btnRect.width, height: btnRect.height},
      // 检查 btn 上方是否有遮挡元素
      topElem: document.elementFromPoint(btnRect.left + btnRect.width/2, btnRect.top + btnRect.height/2) ? document.elementFromPoint(btnRect.left + btnRect.width/2, btnRect.top + btnRect.height/2).className : 'none',
    };
  });
  console.log(JSON.stringify(info, null, 2));
  
  // 点击 Agent 按钮
  var btns = await pg.evaluate(function(){
    var all = document.querySelectorAll('.nl');
    return all.length;
  });
  console.log('nl count:', btns);
  
  await pg.evaluate(function(){
    var all = document.querySelectorAll('.nl');
    if(all[1]) all[1].click();
  });
  await new Promise(r=>setTimeout(r,500));
  
  var dashVisible = await pg.evaluate(function(){
    var el = document.getElementById('page-dashboard');
    return el ? el.style.display : 'not found';
  });
  console.log('page-dashboard after click:', dashVisible);
  
  await b.close();
})().catch(function(e){console.error(e.message);});
