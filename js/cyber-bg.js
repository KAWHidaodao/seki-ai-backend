/* Seki Cyber Background — animated particles + neural links
   Self-contained. Injects canvas#cyber-bg-canvas if missing. */
(function(){
  if (window.__sekiCyberBg) return; window.__sekiCyberBg = true;

  function init(){
    let c = document.getElementById('cyber-bg-canvas');
    if (!c){
      c = document.createElement('canvas');
      c.id = 'cyber-bg-canvas';
      document.body.insertBefore(c, document.body.firstChild);
    }
    const ctx = c.getContext('2d');
    let W=0,H=0,DPR=Math.min(window.devicePixelRatio||1,2);
    const particles = [];
    const COUNT = (()=>{
      const w = window.innerWidth;
      if (w < 640) return 38;
      if (w < 1200) return 70;
      return 110;
    })();
    const mouse = {x:-9999,y:-9999,active:false};

    function resize(){
      W = window.innerWidth; H = window.innerHeight;
      c.width = W*DPR; c.height = H*DPR;
      c.style.width = W+'px'; c.style.height = H+'px';
      ctx.setTransform(DPR,0,0,DPR,0,0);
    }
    resize();
    window.addEventListener('resize', resize);

    // 粒子
    for (let i=0;i<COUNT;i++){
      particles.push({
        x: Math.random()*W,
        y: Math.random()*H,
        vx: (Math.random()-.5)*0.35,
        vy: (Math.random()-.5)*0.35,
        r: Math.random()*1.6+0.6,
        hue: Math.random() < 0.55 ? 275 : 190, // 紫 or 青
      });
    }

    window.addEventListener('mousemove', e=>{
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    });
    window.addEventListener('mouseleave', ()=>{ mouse.active = false; mouse.x=-9999; mouse.y=-9999; });

    const LINK_DIST = 140;
    const MOUSE_DIST = 180;

    function frame(){
      ctx.clearRect(0,0,W,H);

      // 背景渐变呼吸
      const t = Date.now()*0.0003;
      const gx = W*0.5 + Math.cos(t)*W*0.15;
      const gy = H*0.4 + Math.sin(t*1.3)*H*0.1;
      const g = ctx.createRadialGradient(gx,gy,0,gx,gy,Math.max(W,H)*0.6);
      g.addColorStop(0,'rgba(168,85,247,0.05)');
      g.addColorStop(0.5,'rgba(6,182,212,0.02)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

      // 更新
      for (const p of particles){
        p.x += p.vx; p.y += p.vy;

        if (mouse.active){
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < MOUSE_DIST*MOUSE_DIST){
            const d = Math.sqrt(d2)||1;
            const f = (1 - d/MOUSE_DIST) * 0.6;
            p.vx += (dx/d)*f*0.08;
            p.vy += (dy/d)*f*0.08;
          }
        }
        // 阻尼
        p.vx *= 0.985; p.vy *= 0.985;
        // 最小速度
        if (Math.abs(p.vx) < 0.05) p.vx += (Math.random()-.5)*0.04;
        if (Math.abs(p.vy) < 0.05) p.vy += (Math.random()-.5)*0.04;

        if (p.x < -20) p.x = W+20; else if (p.x > W+20) p.x = -20;
        if (p.y < -20) p.y = H+20; else if (p.y > H+20) p.y = -20;
      }

      // 连线
      for (let i=0;i<particles.length;i++){
        const a = particles[i];
        for (let j=i+1;j<particles.length;j++){
          const b = particles[j];
          const dx = a.x-b.x, dy = a.y-b.y;
          const d2 = dx*dx+dy*dy;
          if (d2 < LINK_DIST*LINK_DIST){
            const d = Math.sqrt(d2);
            const alpha = (1 - d/LINK_DIST) * 0.35;
            const hue = (a.hue + b.hue)/2;
            ctx.strokeStyle = `hsla(${hue},90%,65%,${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x,a.y);
            ctx.lineTo(b.x,b.y);
            ctx.stroke();
          }
        }
      }

      // 画粒子
      for (const p of particles){
        const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*6);
        grad.addColorStop(0, `hsla(${p.hue},95%,70%,0.9)`);
        grad.addColorStop(0.4, `hsla(${p.hue},95%,65%,0.3)`);
        grad.addColorStop(1, `hsla(${p.hue},95%,60%,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r*6,0,Math.PI*2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue},100%,85%,1)`;
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fill();
      }

      // 鼠标光点
      if (mouse.active){
        const mg = ctx.createRadialGradient(mouse.x,mouse.y,0,mouse.x,mouse.y,120);
        mg.addColorStop(0,'rgba(168,85,247,0.25)');
        mg.addColorStop(0.5,'rgba(6,182,212,0.10)');
        mg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mouse.x,mouse.y,120,0,Math.PI*2);
        ctx.fill();
      }

      requestAnimationFrame(frame);
    }
    frame();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
