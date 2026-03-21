/* ═══════════════════════════════════════════════════
   PROJECT SOVEREIGN — APP CORE v3
   app.js · Supabase client · Auth · API · UI helpers
   ═══════════════════════════════════════════════════ */
'use strict';

const SB_URL  = 'https://kicdjdxxdqtmetphipnn.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpY2RqZHh4ZHF0bWV0cGhpcG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTQ2ODksImV4cCI6MjA4OTQzMDY4OX0.UukZihDkA1nwZe0MZewya3Is_7vCoVt4cVIKSrdjFKE';
const FN_URL  = `${SB_URL}/functions/v1`;

/* ── LOAD SUPABASE SDK ── */
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  s.onload = () => {
    window._sb = supabase.createClient(SB_URL, SB_ANON, {
      auth: { autoRefreshToken:true, persistSession:true, detectSessionInUrl:true, flowType:'pkce' }
    });
    window.dispatchEvent(new Event('sb:ready'));
    _Auth.init();
  };
  document.head.appendChild(s);
})();

/* ══════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════ */
const Toast = {
  _root: null,
  _get() {
    if(!this._root){
      this._root = document.createElement('div');
      this._root.style.cssText='position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:340px;width:calc(100% - 40px)';
      document.body.appendChild(this._root);
    }
    return this._root;
  },
  show(msg, type='info', ms=3500) {
    const colors = {ok:'var(--green)',err:'var(--red)',warn:'var(--amber)',info:'var(--gold)'};
    const icons  = {ok:'✓',err:'✕',warn:'⚠',info:'◆'};
    const el = document.createElement('div');
    el.style.cssText='background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:11px 14px;font-size:13px;color:var(--text);display:flex;align-items:center;gap:9px;pointer-events:all;cursor:pointer;animation:fadeUp .2s ease;box-shadow:0 4px 24px rgba(0,0,0,.5);border-left:3px solid '+(colors[type]||colors.info);
    el.innerHTML=`<span style="color:${colors[type]||colors.info};font-size:12px;flex-shrink:0">${icons[type]||icons.info}</span><span style="flex:1;line-height:1.5">${msg}</span>`;
    el.onclick=()=>el.remove();
    this._get().appendChild(el);
    setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(20px)';el.style.transition='all .25s';setTimeout(()=>el.remove(),260)}, ms);
  }
};
window.Toast = Toast;

/* ══════════════════════════════════════
   AUTH MODULE
   ══════════════════════════════════════ */
const _Auth = {
  user: null, session: null,

  async init() {
    const {data:{session}} = await window._sb.auth.getSession();
    this.session = session; this.user = session?.user ?? null;
    window.dispatchEvent(new CustomEvent('auth:ready', {detail:{user:this.user}}));
    window._sb.auth.onAuthStateChange((_e, sess) => {
      this.session = sess; this.user = sess?.user ?? null;
      window.dispatchEvent(new CustomEvent('auth:changed', {detail:{user:this.user}}));
    });
  },

  token() { return this.session?.access_token ?? null; },

  guard(redirect='login.html') {
    if(!this.user) {
      const dest = redirect + '?next=' + encodeURIComponent(location.pathname.split('/').pop());
      location.href = dest;
      return false;
    }
    return true;
  },

  async signInGoogle() {
    const {error} = await window._sb.auth.signInWithOAuth({
      provider:'google',
      options:{
        scopes:'email profile https://www.googleapis.com/auth/gmail.modify',
        redirectTo: location.origin + '/command.html',
        queryParams:{access_type:'offline',prompt:'consent'}
      }
    });
    if(error) Toast.show(error.message,'err');
  },

  async signInEmail(email, pass) {
    const {data,error} = await window._sb.auth.signInWithPassword({email,password:pass});
    if(error){Toast.show(error.message,'err');return null;}
    Toast.show('Signed in','ok',2000);
    return data;
  },

  async signUp(email, pass, name) {
    const {data,error} = await window._sb.auth.signUp({email,password:pass,options:{data:{full_name:name},emailRedirectTo:location.origin+'/login.html'}});
    if(error){Toast.show(error.message,'err');return null;}
    Toast.show('Account created — check your email','ok',6000);
    return data;
  },

  async signOut() {
    await window._sb.auth.signOut();
    location.href = 'index.html';
  },

  async resetPw(email) {
    const {error} = await window._sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/login.html?mode=reset'});
    if(error){Toast.show(error.message,'err');return false;}
    Toast.show('Reset link sent','ok');
    return true;
  }
};
window.Auth = _Auth;

/* ══════════════════════════════════════
   API MODULE — Edge Function calls
   ══════════════════════════════════════ */
const API = {
  async _call(fn, body) {
    const _req = async (tok) => fetch(`${FN_URL}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
      body: JSON.stringify(body)
    });

    let token = _Auth.token();
    if (!token) { Toast.show('Please sign in', 'warn'); return null; }

    try {
      let r = await _req(token);

      // 401 = token stale — refresh once and retry
      if (r.status === 401) {
        const { data: { session } } = await window._sb.auth.refreshSession();
        if (session?.access_token) {
          _Auth.session = session;
          _Auth.user = session.user;
          r = await _req(session.access_token);
        } else {
          Toast.show('Session expired — signing you out', 'warn', 4000);
          setTimeout(() => location.href = 'login.html', 2500);
          return null;
        }
      }

      const data = await r.json();
      if (!r.ok) { Toast.show(data.error || `Error ${r.status}`, 'err'); return null; }
      return data;
    } catch(e) { Toast.show('Network error', 'err'); return null; }
  },

  /* AI — streaming via ai-proxy edge function */
  async chat(opts) {
    const token = _Auth.token();
    if(!token){Toast.show('Sign in to use AI agents','warn');return null;}
    const r = await fetch(`${FN_URL}/ai-proxy`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body: JSON.stringify({system:opts.system||'',messages:opts.messages||[],max_tokens:opts.max_tokens||1200,stream:!!opts.onToken,model:'claude-sonnet-4-20250514',agent_name:opts.agent||'unknown'})
    });
    if(!r.ok){
      const e = await r.json().catch(()=>({error:'Unknown'}));
      if(opts.onError) opts.onError(e.error);
      Toast.show(e.error||'AI error','err');
      return null;
    }
    if(opts.onToken) {
      const reader=r.body.getReader(), dec=new TextDecoder();
      let acc='';
      while(true){
        const{done,value}=await reader.read(); if(done)break;
        dec.decode(value).split('\n').forEach(line=>{
          if(!line.startsWith('data: '))return;
          const d=line.slice(6); if(d==='[DONE]')return;
          try{const p=JSON.parse(d);if(p.type==='content_block_delta'&&p.delta?.type==='text_delta'){acc+=p.delta.text;opts.onToken(acc,p.delta.text);}}catch(_){}
        });
      }
      if(opts.onDone) opts.onDone(acc);
      return acc;
    }
    const d=await r.json();
    const txt=d.content?.[0]?.text||'';
    if(opts.onDone) opts.onDone(txt);
    return txt;
  },

  deals: {
    list:   ()       => API._call('sovereign-api',{action:'deals:list'}),
    create: p        => API._call('sovereign-api',{action:'deals:create',payload:p}),
    update: (id,p)   => API._call('sovereign-api',{action:'deals:update',deal_id:id,payload:p}),
    delete: id       => API._call('sovereign-api',{action:'deals:delete',deal_id:id}),
  },
  contacts: {
    list:   deal_id  => API._call('sovereign-api',{action:'contacts:list',deal_id}),
    create: p        => API._call('sovereign-api',{action:'contacts:create',payload:p}),
    update: (id,p)   => API._call('sovereign-api',{action:'contacts:update',contact_id:id,payload:p}),
    logOutreach:(cid,p)=>API._call('sovereign-api',{action:'outreach:log',contact_id:cid,payload:p}),
    getOutreach: ()  => API._call('sovereign-api',{action:'outreach:list'}),
  },
  docs: {
    list: ()         => API._call('sovereign-api',{action:'docs:list'}),
    save: p          => API._call('sovereign-api',{action:'docs:save',payload:p}),
  },
  convs: {
    save: (conv,msgs)=> API._call('sovereign-api',{action:'conv:save',payload:{conversation:conv,messages:msgs}}),
  },
  gmail: {
    threads: q       => API._call('gmail-comms',{action:'gmail:threads',payload:{query:q}}),
    send:    p       => API._call('gmail-comms',{action:'gmail:send',payload:p}),
    aiDraft: p       => API._call('gmail-comms',{action:'gmail:ai_draft',payload:p}),
  },
  audit: {
    log:(event,agent,details,status='ok')=>API._call('sovereign-api',{action:'audit:log',payload:{event,agent,details,status}}),
  },
  profile: {
    get:    ()       => API._call('sovereign-api',{action:'profile:get'}),
    update: p        => API._call('sovereign-api',{action:'profile:update',payload:p}),
  }
};
window.API = API;

/* ══════════════════════════════════════
   NAV INJECTION
   ══════════════════════════════════════ */
(function injectNav(){
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = [
    {href:'index.html',      label:'Home',         icon:'⌂'},
    {href:'command.html',    label:'Command',      icon:'⌘'},
    {href:'intelligence.html',label:'Intel',       icon:'◎'},
    {href:'pipeline.html',   label:'Pipeline',     icon:'▤'},
    {href:'comms.html',      label:'Comms',        icon:'✉'},
    {href:'analytics.html',  label:'Analytics',    icon:'◈'},
    {href:'vault.html',      label:'Vault',        icon:'◆'},
    {href:'security.html',   label:'Security',     icon:'⬡'},
    {href:'resources.html',  label:'Resources',    icon:'◉'},
    {href:'legal.html',      label:'Legal',        icon:'⚖'},
    {href:'admin.html',      label:'Admin',        icon:'⚙'},
  ];
  function isActive(h){return h===page||(h==='index.html'&&(page===''||page==='index.html'));}
  const navLinks = links.map(l=>`<a href="${l.href}" class="nav-link${isActive(l.href)?' active':''}">${l.label}</a>`).join('');
  const mobLinks = links.map(l=>`<a href="${l.href}" class="mob-link${isActive(l.href)?' active':''}"><span class="mob-icon">${l.icon}</span>${l.label}</a>`).join('');

  const html = `
<nav class="nav" id="mainNav">
  <button class="nav-sidebar-btn" id="sidebarToggleBtn" aria-label="Toggle sidebar" style="display:none">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="1.5" rx=".75" fill="currentColor"/><rect x="2" y="8.25" width="14" height="1.5" rx=".75" fill="currentColor"/><rect x="2" y="12.5" width="14" height="1.5" rx=".75" fill="currentColor"/></svg>
  </button>
  <a href="index.html" class="nav-logo">
    <div class="nav-logo-icon">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>
    </div>
    <span class="nav-logo-text">SOVEREIGN</span>
  </a>
  <div class="nav-links" id="navLinks">${navLinks}</div>
  <div class="nav-actions" id="navActions">
    <span class="nav-live"><span class="live-dot"></span><span class="live-label">Live</span></span>
    <a href="command.html" class="btn btn-primary btn-sm nav-cta">Command ⌘</a>
    <button class="nav-ham" id="navHam" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="nav-drawer" id="navDrawer">
  <div class="mob-links">${mobLinks}</div>
  <div style="padding:0 12px 16px">
    <a href="command.html" class="btn btn-primary w-full" style="justify-content:center">Command ⌘</a>
  </div>
</div>
<div class="nav-backdrop" id="navBackdrop"></div>`;

  document.body.insertAdjacentHTML('afterbegin', html);

  // Mobile menu toggle
  const ham = document.getElementById('navHam');
  const drawer = document.getElementById('navDrawer');
  const backdrop = document.getElementById('navBackdrop');
  function toggleDrawer(open){
    drawer.classList.toggle('open', open);
    backdrop.classList.toggle('show', open);
    ham.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  ham?.addEventListener('click', ()=>toggleDrawer(!drawer.classList.contains('open')));
  backdrop?.addEventListener('click', ()=>toggleDrawer(false));

  // Close on nav link click
  drawer?.querySelectorAll('.mob-link').forEach(a=>a.addEventListener('click',()=>toggleDrawer(false)));

  // Inject auth button after supabase loads
  window.addEventListener('auth:ready', e=>{
    const user = e.detail?.user;
    const actions = document.getElementById('navActions');
    if(!actions) return;
    const existing = actions.querySelector('.nav-user-btn');
    if(existing) existing.remove();
    if(user){
      const initial = (user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase();
      const btn = document.createElement('button');
      btn.className = 'nav-user-btn';
      btn.innerHTML = initial;
      btn.title = user.email;
      btn.onclick = ()=>{ if(confirm(`Sign out of Sovereign?\n${user.email}`)) _Auth.signOut(); };
      actions.insertBefore(btn, actions.querySelector('.nav-cta'));
    } else if(page !== 'login.html' && page !== 'index.html'){
      const a = document.createElement('a');
      a.href = 'login.html';
      a.className = 'btn btn-ghost btn-sm';
      a.textContent = 'Sign In';
      actions.insertBefore(a, actions.querySelector('.nav-cta'));
    }
  });
})();

/* ══════════════════════════════════════
   HELPERS
   ══════════════════════════════════════ */
window.fmtGBP = (n)=>{
  if(!n) return '—';
  if(n>=1e6) return '£'+(n/1e6).toFixed(1)+'M';
  if(n>=1e3) return '£'+(n/1e3).toFixed(0)+'k';
  return '£'+n;
};
window.fmtDate = (s)=>{
  if(!s) return '—';
  return new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
};
window.escHtml = (s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
window.renderMd = (t)=>escHtml(t)
  .replace(/^### (.+)$/gm,'<h3>$1</h3>')
  .replace(/^## (.+)$/gm,'<h3>$1</h3>')
  .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  .replace(/`([^`]+)`/g,'<code>$1</code>')
  .replace(/^---$/gm,'<hr>')
  .replace(/^[•\-\*] (.+)$/gm,'<li>$1</li>')
  .replace(/(<li>[\s\S]+?<\/li>)/g,m=>'<ul>'+m+'</ul>')
  .replace(/\n/g,'<br>');

/* Modal */
window.Modal = {
  open(id){const el=document.getElementById(id);if(el){el.style.display='flex';document.body.style.overflow='hidden';}},
  close(id){const el=document.getElementById(id);if(el){el.style.display='none';document.body.style.overflow='';}},
  closeAll(){document.querySelectorAll('.modal-overlay.open, [id$="-modal"]').forEach(el=>{el.style.display='none';});document.body.style.overflow='';}
};

/* ══════════════════════════════════════
   ANALYTICS + AD TRACKING
   ══════════════════════════════════════ */
const _Analytics = {
  sessionId: null,
  queue: [],
  
  init() {
    // Generate session ID
    this.sessionId = sessionStorage.getItem('sv_sid') || 
      ('s_' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    sessionStorage.setItem('sv_sid', this.sessionId);
    
    // Parse UTM params
    const p = new URLSearchParams(location.search);
    this._utm = {
      utm_source: p.get('utm_source'),
      utm_medium: p.get('utm_medium'),
      utm_campaign: p.get('utm_campaign'),
      utm_content: p.get('utm_content'),
      referrer: document.referrer || null
    };
    
    // Track page view
    this.track('page_view', {page: location.pathname.split('/').pop()});
    
    // Track on auth
    window.addEventListener('auth:ready', e => {
      if(e.detail?.user) this.track('user_session', {user_id: e.detail.user.id});
    });
  },
  
  async track(event_name, props={}) {
    const page = location.pathname.split('/').pop() || 'index.html';
    const device = /mobile|android|iphone|ipad/i.test(navigator.userAgent) ? 'mobile' :
                   /tablet|ipad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';
    
    const payload = {
      session_id: this.sessionId,
      event_name,
      event_cat: props.category || 'general',
      page,
      props: JSON.stringify(props),
      ...this._utm,
      device_type: device,
      user_agent: navigator.userAgent.slice(0, 200)
    };
    
    // Fire to Supabase (non-blocking)
    if(window._sb) {
      window._sb.from('analytics_events').insert(payload)
        .then(() => {}).catch(() => {});
    }
    
    // Fire ad pixels
    this.firePixels(event_name, props);
  },
  
  firePixels(event_name, props={}) {
    // Meta Pixel (if configured)
    if(window.fbq) {
      const fbEvents = {page_view:'PageView',sign_up:'Lead',deal_created:'Purchase'};
      window.fbq('track', fbEvents[event_name] || 'CustomEvent', props);
    }
    // Google Analytics (if configured)
    if(window.gtag) {
      window.gtag('event', event_name, props);
    }
    // LinkedIn Insight (if configured)
    if(window._linkedin_partner_id && window.lintrk) {
      window.lintrk('track', {conversion_id: props.conversion_id});
    }
    // Server-side ad tracking log
    if(window._sb && Auth.user) {
      window._sb.from('ad_tracking').insert({
        pixel_name: 'sovereign_first_party',
        pixel_type: 'custom',
        event_name,
        session_id: this.sessionId,
        user_id: Auth.user?.id || null,
        props: JSON.stringify(props),
        conversion: ['sign_up','deal_created','deal_won'].includes(event_name)
      }).then(() => {}).catch(() => {});
    }
  }
};
window.Analytics = _Analytics;
// Auto-init after Supabase loads
window.addEventListener('sb:ready', () => _Analytics.init());

/* ══════════════════════════════════════
   EXTENDED API — NEW EDGE FUNCTIONS
   ══════════════════════════════════════ */
// Extend existing API object
Object.assign(API, {
  scraper: {
    companiesHouse: (company_name, deal_id) => API._call('scraper', {action:'scrape:companies_house', company_name, deal_id}),
    web:            (website_url, deal_id)  => API._call('scraper', {action:'scrape:web',             website_url, deal_id}),
    news:           (company_name, deal_id) => API._call('scraper', {action:'scrape:news',            company_name, deal_id}),
    full:           (p)                     => API._call('scraper', {action:'scrape:full',             ...p}),
    queue:          ()                      => API._call('scraper', {action:'scrape:queue'}),
  },
  notifier: {
    callHoward:    (agent,purpose,msg) => API._call('notifier',{action:'call:howard',    payload:{agent_name:agent,purpose,message:msg}}),
    smsHoward:     (agent,msg)         => API._call('notifier',{action:'sms:howard',     payload:{agent_name:agent,message:msg}}),
    whatsappHoward:(agent,msg)         => API._call('notifier',{action:'whatsapp:howard',payload:{agent_name:agent,message:msg}}),
    smsContact:    (to,msg,cid,did)    => API._call('notifier',{action:'sms:contact',    payload:{to,message:msg,contact_id:cid,deal_id:did}}),
    inApp:         (title,body,prio)   => API._call('notifier',{action:'notify:inapp',   payload:{title,body,priority:prio||'normal'}}),
  },
  automation: {
    runWorkflow:   (workflow_id)       => API._call('automation',{action:'workflow:run',     payload:{workflow_id}}),
    listWorkflows: ()                  => API._call('automation',{action:'workflow:list'}),
    createWorkflow:(p)                 => API._call('automation',{action:'workflow:create',  payload:p}),
    toggleWorkflow:(id,active)         => API._call('automation',{action:'workflow:toggle',  payload:{workflow_id:id,is_active:active}}),
    listPatterns:  ()                  => API._call('automation',{action:'patterns:list'}),
    selfImprove:   ()                  => API._call('automation',{action:'patterns:improve'}),
    agentsStatus:  ()                  => API._call('automation',{action:'agents:status'}),
  },
  admin: {
    overview:      ()                  => API._call('admin-api',{action:'admin:overview'}),
    users:         ()                  => API._call('admin-api',{action:'admin:users'}),
    health:        ()                  => API._call('admin-api',{action:'admin:health'}),
    compliance:    ()                  => API._call('admin-api',{action:'admin:compliance'}),
    addCompliance: (p)                 => API._call('admin-api',{action:'admin:compliance:add',payload:p}),
    pentestRun:    ()                  => API._call('admin-api',{action:'admin:pentest:run'}),
    pentestList:   ()                  => API._call('admin-api',{action:'admin:pentest:list'}),
    analytics:     (days=7)            => API._call('admin-api',{action:'admin:analytics',payload:{days}}),
    keysList:      ()                  => API._call('admin-api',{action:'admin:keys:list'}),
    keyRotate:     (key_id)            => API._call('admin-api',{action:'admin:keys:rotate',payload:{key_id}}),
    metricsRecord: (m,v,u,t)           => API._call('admin-api',{action:'admin:metrics:record',payload:{metric_name:m,metric_value:v,metric_unit:u,tags:t}}),
    metricsList:   ()                  => API._call('admin-api',{action:'admin:metrics:list'}),
    stressTest:    (conc,dur)          => API._call('admin-api',{action:'admin:stress:run',payload:{concurrency:conc||5,duration_ms:dur||2000}}),
  }
});

/* ══════════════════════════════════════
   AES-256-GCM ENCRYPTION LAYER
   ══════════════════════════════════════ */
window.Crypto256 = {
  // Generate a new AES-256-GCM key
  async generateKey() {
    return crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  },
  
  // Export key to base64
  async exportKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  },
  
  // Import key from base64
  async importKey(b64) {
    const raw = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    return crypto.subtle.importKey('raw',raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  },
  
  // Encrypt text → base64(iv + ciphertext)
  async encrypt(text, keyB64) {
    const key = await this.importKey(keyB64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);
    const combined = new Uint8Array(12+ciphertext.byteLength);
    combined.set(iv,0); combined.set(new Uint8Array(ciphertext),12);
    return btoa(String.fromCharCode(...combined));
  },
  
  // Decrypt base64(iv + ciphertext) → text
  async decrypt(b64, keyB64) {
    const key = await this.importKey(keyB64);
    const combined = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const iv = combined.slice(0,12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext);
    return new TextDecoder().decode(plaintext);
  },

  // Hash password with SHA-256
  async hashPassword(password, salt='sovereign_v3') {
    const data = new TextEncoder().encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
};
