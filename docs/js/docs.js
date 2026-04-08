/* ==========================================
   SEKI AGENT DOCS — JS
   Neural canvas + terminal typewriter
   ========================================== */

(function(){
'use strict';

/* ---- Neural Network Canvas ---- */
const canvas = document.getElementById('neural-canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], mouse = {x:-1000, y:-1000};
  const PARTICLE_COUNT = 80;
  const CONNECT_DIST = 150;
  const ACCENT = {r:0, g:255, b:136};

  function resize(){
    W = canvas.width = canvas.parentElement.offsetWidth;
    H = canvas.height = canvas.parentElement.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for(let i=0; i<PARTICLE_COUNT; i++){
    particles.push({
      x: Math.random()*W,
      y: Math.random()*H,
      vx: (Math.random()-0.5)*0.5,
      vy: (Math.random()-0.5)*0.5,
      r: Math.random()*2+1
    });
  }

  canvas.parentElement.addEventListener('mousemove', e=>{
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.parentElement.addEventListener('mouseleave', ()=>{
    mouse.x = -1000; mouse.y = -1000;
  });

  function draw(){
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<particles.length;i++){
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if(p.x<0||p.x>W) p.vx*=-1;
      if(p.y<0||p.y>H) p.vy*=-1;

      // draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.5)`;
      ctx.fill();

      // connect nearby
      for(let j=i+1;j<particles.length;j++){
        const q = particles[j];
        const dx=p.x-q.x, dy=p.y-q.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(dist<CONNECT_DIST){
          const alpha = (1 - dist/CONNECT_DIST)*0.2;
          ctx.beginPath();
          ctx.moveTo(p.x,p.y);
          ctx.lineTo(q.x,q.y);
          ctx.strokeStyle=`rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${alpha})`;
          ctx.lineWidth=0.5;
          ctx.stroke();
        }
      }

      // mouse attraction
      const mdx=mouse.x-p.x, mdy=mouse.y-p.y;
      const mdist=Math.sqrt(mdx*mdx+mdy*mdy);
      if(mdist<200){
        const alpha = (1-mdist/200)*0.4;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(mouse.x,mouse.y);
        ctx.strokeStyle=`rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${alpha})`;
        ctx.lineWidth=0.8;
        ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ---- Terminal Typewriter ---- */
const termBody = document.getElementById('term-body');
if(termBody){
  const lines = [
    {type:'prompt', text:'$ '},
    {type:'cmd', text:'seki init --chain bsc'},
    {type:'out', text:'Initializing Seki Agent v0.8.3...'},
    {type:'out', text:'Loading memory system... '},
    {type:'hl', text:'OK'},
    {type:'out', text:'Loading skill engine... '},
    {type:'hl', text:'OK'},
    {type:'out', text:'Registering tools: [binance, dex_scanner, oracle]'},
    {type:'out', text:'Connecting to BSC mainnet... '},
    {type:'hl', text:'CONNECTED'},
    {type:'br'},
    {type:'prompt', text:'$ '},
    {type:'cmd', text:'seki evolve --cycles 1000'},
    {type:'out', text:'Starting evolution loop...'},
    {type:'out', text:'Cycle 1: observing 14,283 pending txns'},
    {type:'out', text:'Cycle 2: pattern match — whale_accumulation detected'},
    {type:'out', text:'Cycle 3: strategy mutated → momentum_v2'},
    {type:'hl', text:'[EVOLVING] Sharpe: 0.42 → 1.21 → 1.87'},
    {type:'out', text:'New skill acquired: liquidity_depth_analysis'},
    {type:'hl', text:'Agent ready. Continuously evolving.'},
  ];

  let currentLine = 0;
  let currentChar = 0;
  let currentEl = null;

  function createLine(type){
    if(type === 'br'){
      termBody.appendChild(document.createElement('br'));
      return null;
    }
    const span = document.createElement('span');
    span.className = type;
    termBody.appendChild(span);
    return span;
  }

  function typeNext(){
    if(currentLine >= lines.length){
      // add cursor at end
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      termBody.appendChild(cursor);
      return;
    }

    const line = lines[currentLine];

    if(line.type === 'br'){
      createLine('br');
      currentLine++;
      currentChar = 0;
      currentEl = null;
      setTimeout(typeNext, 50);
      return;
    }

    if(!currentEl){
      currentEl = createLine(line.type);
    }

    if(currentChar < line.text.length){
      currentEl.textContent += line.text[currentChar];
      currentChar++;
      const speed = line.type === 'cmd' ? 40 : line.type === 'prompt' ? 10 : 15;
      setTimeout(typeNext, speed);
    } else {
      // line done
      termBody.appendChild(document.createElement('br'));
      currentLine++;
      currentChar = 0;
      currentEl = null;
      const pause = line.type === 'cmd' ? 400 : line.type === 'hl' ? 300 : 100;
      setTimeout(typeNext, pause);
    }
  }

  // Start typewriter when hero is visible
  const observer = new IntersectionObserver(entries=>{
    if(entries[0].isIntersecting){
      observer.disconnect();
      setTimeout(typeNext, 800);
    }
  },{threshold:0.3});
  observer.observe(document.getElementById('hero'));
}

/* ---- Scroll reveal ---- */
const reveals = document.querySelectorAll('.loop-node, .sys-card, .evo-event, .skill-row:not(.head)');
const revealObs = new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      e.target.style.opacity='1';
      e.target.style.transform='translateY(0)';
      revealObs.unobserve(e.target);
    }
  });
},{threshold:0.1, rootMargin:'0px 0px -40px 0px'});

reveals.forEach(el=>{
  el.style.opacity='0';
  el.style.transform='translateY(20px)';
  el.style.transition='opacity 0.6s ease, transform 0.6s ease';
  revealObs.observe(el);
});

/* ---- Mobile nav toggle ---- */
const menuBtn = document.querySelector('.nav-menu');
const navLinks = document.querySelector('.nav-links');
if(menuBtn && navLinks){
  menuBtn.addEventListener('click',()=>{
    navLinks.style.display = navLinks.style.display==='flex' ? 'none' : 'flex';
    navLinks.style.position='absolute';
    navLinks.style.top='var(--nav-h)';
    navLinks.style.left='0';
    navLinks.style.right='0';
    navLinks.style.background='var(--bg)';
    navLinks.style.flexDirection='column';
    navLinks.style.padding='16px 24px';
    navLinks.style.borderBottom='1px solid var(--border)';
  });
}

})();