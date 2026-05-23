const views=[...document.querySelectorAll('.view')];
let manifest={games:[]};
let selectedGame=null;
function show(id){views.forEach(v=>v.classList.toggle('active',v.id===id));scrollTo({top:0,behavior:'smooth'});}
function moneySafe(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
async function boot(){
  const res=await fetch('games-manifest.json',{cache:'no-store'}); manifest=await res.json(); renderGames();
}
function renderGames(filter='All'){
  const list=document.getElementById('gameList');
  const games=manifest.games.filter(g=>filter==='All'||g.difficulty===filter);
  list.innerHTML=games.map(g=>`<article class="game-card"><figure><img src="${moneySafe(g.graphic)}" alt="${moneySafe(g.title)}"></figure><div class="game-body"><p class="eyebrow">${moneySafe(g.difficulty)} Mystery</p><h3>${moneySafe(g.shortTitle)}</h3><p>${moneySafe(g.venue)}</p><div class="meta"><span class="pill">${g.runtime} min</span><span class="pill">${moneySafe(g.dateLabel)}</span><span class="pill">${moneySafe(g.timeLabel)}</span></div><button class="primary" data-game="${moneySafe(g.id)}">Reserve this mystery</button></div></article>`).join('');
  list.querySelectorAll('[data-game]').forEach(btn=>btn.onclick=()=>openDetail(btn.dataset.game));
}
async function openDetail(id){
  selectedGame=manifest.games.find(g=>g.id===id);
  const data=await (await fetch(selectedGame.file,{cache:'no-store'})).json();
  const mount=document.getElementById('detailMount');
  mount.innerHTML=`<article class="detail-card"><div class="detail-layout"><img src="${moneySafe(selectedGame.graphic)}" alt="${moneySafe(selectedGame.title)}"><div class="detail-copy"><p class="eyebrow">${moneySafe(selectedGame.series)}</p><h2>${moneySafe(selectedGame.title)}</h2><p>${moneySafe(data?.briefing?.host_read || data?.briefing?.intro || 'A live detective mystery experience at El Paso Mexican Restaurant in Denham Springs.')}</p><div class="meta"><span class="pill">Difficulty: ${moneySafe(selectedGame.difficulty)}</span><span class="pill">Investigation: ${selectedGame.runtime} min</span><span class="pill">Briefing: ${selectedGame.briefing} min</span></div><form id="reserveForm" class="rsvp-form"><label>First name<input name="first" required placeholder="First name"></label><label>Phone<input name="phone" required inputmode="numeric" placeholder="10-digit phone"></label><label class="full">Session<select name="session"><option>Next available host session</option><option>Tonight — Host scheduled</option><option>Private event / manual code</option></select></label><button class="primary">Confirm RSVP</button></form><div id="reserveResult" class="notice"></div></div></div></article>`;
  document.getElementById('reserveForm').onsubmit=(e)=>{e.preventDefault(); const fd=new FormData(e.target); const code=Math.floor(10000+Math.random()*89999); localStorage.setItem('barfly-rsvp',JSON.stringify({game:selectedGame.title,first:fd.get('first'),phone:fd.get('phone'),code})); document.getElementById('reserveResult').classList.add('confirmation'); document.getElementById('reserveResult').innerHTML=`RSVP saved for <strong>${moneySafe(selectedGame.shortTitle)}</strong>. Demo access code: <strong>${code}</strong>. In paid mode, the host can withhold this code and give it manually.`;};
  show('detailView');
}
document.getElementById('openRsvp').onclick=()=>show('rsvpView');
document.getElementById('openMyRsvp').onclick=()=>show('myRsvpView');
document.getElementById('openAccess').onclick=()=>show('accessView');
document.getElementById('homeBtn').onclick=()=>show('homeView');
document.getElementById('backToRsvp').onclick=()=>show('rsvpView');
document.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>{document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));ch.classList.add('active');renderGames(ch.textContent.trim());});
document.getElementById('lookupBtn').onclick=()=>{const saved=JSON.parse(localStorage.getItem('barfly-rsvp')||'null');document.getElementById('lookupResult').innerHTML=saved?`Found RSVP for <strong>${moneySafe(saved.first)}</strong>: ${moneySafe(saved.game)}. Code: <strong>${saved.code}</strong>.`:'No local demo RSVP found on this device.'};
document.getElementById('accessBtn').onclick=()=>{const val=document.getElementById('accessCode').value.trim();document.getElementById('accessResult').innerHTML=/^\d{5}$/.test(val)?`Code accepted for demo flow. This is where the player check-in/lobby opens in the full live engine.`:'Enter a 5-digit access code.'};
boot().catch(err=>{document.body.insertAdjacentHTML('beforeend',`<pre style="color:white">${moneySafe(err.message)}</pre>`)});
