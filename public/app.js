/* ═══════════════════════════════════════════════════
   PROJECT SOVEREIGN — APP CORE v3
   app.js · Supabase client · Auth · API · UI helpers
   ═══════════════════════════════════════════════════ */
'use strict';

/* ── AUTH GATE: hide protected pages before auth resolves ── */
function _removeAuthOverlay(){ var o=document.getElementById('_authOverlay'); if(o) o.remove(); }
(function(){
  const _p = location.pathname.split('/').pop() || 'index.html';
  const _PUBLIC = new Set(['index.html','login.html','upgrade.html','legal.html','mediakit.html','resources.html','','login','upgrade','legal','mediakit','resources']);
  if(!_PUBLIC.has(_p)){
    document.documentElement.style.visibility = 'hidden';
    // Show loading overlay so users see a spinner instead of a blank page
    var _style = document.createElement('style');
    _style.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(_style);
    var _ol = document.createElement('div');
    _ol.id = '_authOverlay';
    _ol.style.cssText = 'position:fixed;inset:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;z-index:99999;visibility:visible;';
    _ol.innerHTML = '<div style="width:36px;height:36px;border:2px solid #2a2a3a;border-top-color:#c9a84c;border-radius:50%;animation:_spin .7s linear infinite"></div>';
    document.body.appendChild(_ol);
    // Safety fallback: reveal after 4s in case auth never fires
    window._authRevealTimer = setTimeout(function(){
      document.documentElement.style.visibility = '';
      _removeAuthOverlay();
    }, 4000);
  }
})();

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
    el.innerHTML=`<span style="color:${colors[type]||colors.info};font-size:12px;flex-shrink:0">${icons[type]||icons.info}</span><span style="flex:1;line-height:1.5"></span>`;
    el.querySelector('span:last-child').textContent=msg;
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
    let readyFired = false;
    // Listener registered before getSession so INITIAL_SESSION / SIGNED_IN are never missed
    window._sb.auth.onAuthStateChange((event, sess) => {
      this.session = sess; this.user = sess?.user ?? null;
      window.dispatchEvent(new CustomEvent('auth:changed', {detail:{user:this.user}}));
      // INITIAL_SESSION fires after PKCE code exchange completes — prevents premature redirect
      // when getSession() returns null before the exchange finishes
      if (!readyFired && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        readyFired = true;
        window.dispatchEvent(new CustomEvent('auth:ready', {detail:{user:this.user}}));
      }
    });
    const {data:{session}} = await window._sb.auth.getSession();
    this.session = session; this.user = session?.user ?? null;
    if (!readyFired) {
      const p = new URLSearchParams(location.search);
      const hasPendingAuth = p.has('code') || location.hash.includes('access_token=');
      if (!hasPendingAuth) {
        readyFired = true;
        window.dispatchEvent(new CustomEvent('auth:ready', {detail:{user:this.user}}));
      }
    }
  },

  token() { return this.session?.access_token ?? null; },

  guard(redirect='/login') {
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
        redirectTo: location.origin + '/command',
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
    const {data,error} = await window._sb.auth.signUp({email,password:pass,options:{data:{full_name:name},emailRedirectTo:location.origin+'/login'}});
    if(error){Toast.show(error.message,'err');return null;}
    Toast.show('Account created — check your email','ok',6000);
    // Track referral if someone signed up via a referral link
    const refCode = localStorage.getItem('sv_ref');
    if(refCode && data?.user) {
      setTimeout(async()=>{
        try { await API.referral.track(refCode); localStorage.removeItem('sv_ref'); } catch(_){}
      }, 2000);
    }
    return data;
  },

  async signOut() {
    document.cookie = 'sv_auth=; path=/; max-age=0';
    await window._sb.auth.signOut();
    location.href = '/';
  },

  async resetPw(email) {
    const {error} = await window._sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/login?mode=reset'});
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
  _refreshLock: null,

  async _call(fn, body) {
    const _req = async (tok) => fetch(`${FN_URL}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}`, 'apikey': SB_ANON },
      body: JSON.stringify(body)
    });

    let token = _Auth.token();
    if (!token) { Toast.show('Please sign in', 'warn'); return null; }

    try {
      let r = await _req(token);

      // 401 = stale/invalid token — force a server-side refresh and retry
      if (r.status === 401) {
        // Coalesce concurrent refresh attempts to avoid thundering herd
        if (!this._refreshLock) {
          this._refreshLock = (async () => {
            // Always call refreshSession() — contacts the server directly for a new token
            // (getSession() only reads localStorage, so it may return the same bad token)
            const { data: { session: refreshed } } = await window._sb.auth.refreshSession();
            return refreshed;
          })();
        }
        let currentSession;
        try { currentSession = await this._refreshLock; } finally { this._refreshLock = null; }

        if (!currentSession?.access_token) {
          // Refresh token also invalid — session is dead; sign out cleanly
          await window._sb.auth.signOut();
          Toast.show('Session expired — please sign in again', 'warn', 4000);
          setTimeout(() => location.href = '/login', 2000);
          return null;
        }
        _Auth.session = currentSession;
        _Auth.user = currentSession.user;
        r = await _req(currentSession.access_token);
        if (r.status === 401) {
          // Fresh token still rejected — session unrecoverable, sign out
          await window._sb.auth.signOut();
          Toast.show('Session invalid — please sign in again', 'warn', 4000);
          setTimeout(() => location.href = '/login', 2000);
          return null;
        }
      }

      const data = await r.json().catch(() => ({}));
      if (!r.ok) { Toast.show(data.error || `Error ${r.status}`, 'err'); return null; }
      return data;
    } catch(e) { Toast.show('Network error', 'err'); return null; }
  },

  /* AI — streaming via ai-proxy (default) or personaplex-proxy (use_persona:true) */
  async chat(opts) {
    let token = _Auth.token();
    if(!token){Toast.show('Sign in to use AI agents','warn');return null;}
    // use_persona:true routes to personaplex-proxy for persona-consistent dialogue.
    // Default false so all existing calls are unaffected.
    const endpoint = opts.use_persona ? 'personaplex-proxy' : 'ai-proxy';
    const _req = (tok) => fetch(`${FN_URL}/${endpoint}`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${tok}`,'apikey':SB_ANON},
      body: JSON.stringify({system:opts.system||'',messages:opts.messages||[],max_tokens:opts.max_tokens||1200,stream:!!opts.onToken,model:'claude-sonnet-4-20250514',agent_name:opts.agent_name||'unknown'})
    });
    let r = await _req(token);
    // 401 = possibly stale token — refresh once and retry (reuse coalesced refresh from _call)
    if(r.status === 401) {
      await new Promise(ok => setTimeout(ok, 800));
      let { data: { session: currentSession } } = await window._sb.auth.getSession();
      if(!currentSession?.access_token || currentSession.access_token === token) {
        const { data: { session: refreshed } } = await window._sb.auth.refreshSession();
        if(!refreshed?.access_token) {
          if(opts.onError) opts.onError('Session expired — please sign in again');
          Toast.show('Session expired — please sign in again','warn',4000);
          setTimeout(()=>location.href='/login',2500);
          return null;
        }
        currentSession = refreshed;
      }
      _Auth.session = currentSession; _Auth.user = currentSession.user;
      r = await _req(currentSession.access_token);
      if(r.status === 401) {
        // One more retry — covers auth propagation lag on fresh sign-in
        await new Promise(ok => setTimeout(ok, 1500));
        const { data: { session: s2 } } = await window._sb.auth.getSession();
        if(s2?.access_token) { _Auth.session = s2; _Auth.user = s2.user; r = await _req(s2.access_token); }
        if(r.status === 401) {
          if(opts.onError) opts.onError('Authentication error — please try again');
          Toast.show('Authentication error — please try again','warn',3000);
          return null;
        }
      }
    }
    if(!r.ok){
      const e = await r.json().catch(()=>({error:'Unknown'}));
      if(opts.onError) opts.onError(e.error||`AI error ${r.status}`);
      Toast.show(e.error||`AI error ${r.status}`,'err');
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
    const d=await r.json().catch(()=>({}));
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
    list: ()         => API._call('sovereign-api',{action:'conv:list'}),
    load: id         => API._call('sovereign-api',{action:'conv:load',payload:{id}}),
    save: (conv,msgs)=> API._call('sovereign-api',{action:'conv:save',payload:{conversation:conv,messages:msgs}}),
  },
  gmail: {
    threads: q       => API._call('gmail-comms',{action:'gmail:threads',payload:{query:q},provider_token:_Auth.session?.provider_token}),
    send:    p       => API._call('gmail-comms',{action:'gmail:send',payload:p,provider_token:_Auth.session?.provider_token}),
    aiDraft: p       => API._call('gmail-comms',{action:'gmail:ai_draft',payload:p,provider_token:_Auth.session?.provider_token}),
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
  const PUBLIC_PAGES = new Set(['index.html','login.html','upgrade.html','legal.html','mediakit.html','resources.html','','login','upgrade','legal','mediakit','resources']);
  const isPublicPage = PUBLIC_PAGES.has(page);

  const PUBLIC_LINKS = [
    {href:'/',           label:'Home',    icon:'⌂'},
    {href:'/upgrade',    label:'Pricing', icon:'◈'},
    {href:'/resources',  label:'Guide',   icon:'◉'},
    {href:'/legal',      label:'Legal',   icon:'⚖'},
  ];
  const APP_LINKS = [
    {href:'/scout',        label:'Scout',     icon:'◉'},
    {href:'/command',      label:'Command',   icon:'⌘'},
    {href:'/pipeline',     label:'Pipeline',  icon:'▤'},
    {href:'/intelligence', label:'Intel',     icon:'◎'},
    {href:'/mail',         label:'Mail',      icon:'✉'},
    {href:'/comms',        label:'Comms',     icon:'☎'},
    {href:'/analytics',    label:'Analytics', icon:'◈'},
    {href:'/vault',        label:'Vault',     icon:'◆'},
    {href:'/campaigns',    label:'Campaigns', icon:'◈'},
    {href:'/agents',       label:'Agents',    icon:'⚡'},
  ];
  const ADMIN_LINK = {href:'/admin', label:'Admin', icon:'⚙'};

  function isActive(h){const s=h.replace(/^\/|\.html$/g,'');return s===page||(s===''&&(page===''||page==='index.html'));}
  function renderLinks(links){
    return {
      nav: links.map(l=>`<a href="${l.href}" class="nav-link${isActive(l.href)?' active':''}">${l.label}</a>`).join(''),
      mob: links.map(l=>`<a href="${l.href}" class="mob-link${isActive(l.href)?' active':''}"><span class="mob-icon">${l.icon}</span>${l.label}</a>`).join('')
    };
  }

  const initLinks = isPublicPage ? PUBLIC_LINKS : APP_LINKS;
  const {nav: navLinks, mob: mobLinks} = renderLinks(initLinks);

  const html = `
<nav class="nav" id="mainNav">
  <button class="nav-sidebar-btn" id="sidebarToggleBtn" aria-label="Toggle sidebar" style="display:none">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="1.5" rx=".75" fill="currentColor"/><rect x="2" y="8.25" width="14" height="1.5" rx=".75" fill="currentColor"/><rect x="2" y="12.5" width="14" height="1.5" rx=".75" fill="currentColor"/></svg>
  </button>
  <a href="/" class="nav-logo">
    <div class="nav-logo-icon">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>
    </div>
    <span class="nav-logo-text">SOVEREIGN</span>
  </a>
  <div class="nav-links" id="navLinks">${navLinks}</div>
  <div class="nav-actions" id="navActions">
    <span class="nav-live"><span class="live-dot"></span><span class="live-label">Live</span></span>
    <a href="/command" class="btn btn-primary btn-sm nav-cta">Command ⌘</a>
    <button class="nav-ham" id="navHam" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="nav-drawer" id="navDrawer">
  <div class="mob-links">${mobLinks}</div>
  <div style="padding:0 12px 16px">
    <a href="/command" class="btn btn-primary w-full" style="justify-content:center">Command ⌘</a>
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
  backdrop?.addEventListener('click', ()=>{
    toggleDrawer(false);
    toggleSidebarPanel(false); // also close sidebar if open
  });

  // Close on nav link click
  drawer?.querySelectorAll('.mob-link').forEach(a=>a.addEventListener('click',()=>toggleDrawer(false)));

  // ── Sidebar toggle (app-shell pages: command.html, scout.html) ───────────
  // Finds the page sidebar (.sidebar or .cmd-sidebar) and toggles .open on mobile.
  // The nav button is CSS-shown at ≤768px via display:flex !important.
  function getSidebar() {
    return document.querySelector('.sidebar') || document.querySelector('.cmd-sidebar');
  }
  function toggleSidebarPanel(open) {
    const sb = getSidebar();
    if (!sb) return;
    const isOpen = open !== undefined ? open : !sb.classList.contains('open');
    sb.classList.toggle('open', isOpen);
    backdrop?.classList.toggle('show', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
  const sidebarBtn = document.getElementById('sidebarToggleBtn');
  if (sidebarBtn) {
    // Wait for DOMContentLoaded so page content (including sidebars) is in the DOM
    const activateSidebarBtn = () => {
      if (getSidebar()) {
        sidebarBtn.removeAttribute('style'); // remove hardcoded display:none; CSS now controls visibility
        sidebarBtn.addEventListener('click', () => toggleSidebarPanel());
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', activateSidebarBtn);
    } else {
      activateSidebarBtn();
    }
  }

  // Inject auth button after supabase loads
  window.addEventListener('auth:ready', async e=>{
    const user = e.detail?.user;
    const actions = document.getElementById('navActions');
    if(!actions) return;
    const existingWrap = actions.querySelector('.nav-user-wrap');
    if(existingWrap) existingWrap.remove();
    const existingBtn = actions.querySelector('.nav-user-btn');
    if(existingBtn) existingBtn.remove();

    if(user){
      // Fetch role from profile
      let isAdmin = false, hasActiveSub = false;
      try {
        const {data:p} = await window._sb.from('user_profiles').select('role,subscription_status,stripe_customer_id').eq('id',user.id).single();
        isAdmin = p?.role === 'admin' || p?.role === 'superadmin';
        window._userRole = p?.role || 'user';
        hasActiveSub = !!p?.stripe_customer_id && ['active','past_due'].includes(p?.subscription_status);
      } catch(_){}

      // Admin page guard — redirect non-admins away from admin-only pages
      const ADMIN_ONLY_PAGES = new Set(['admin.html','is-policy.html','asset-register.html','ir-playbook.html','bcp.html','agents.html','video-generator.html','admin','is-policy','asset-register','ir-playbook','bcp','agents','video-generator','video']);
      if(ADMIN_ONLY_PAGES.has(page) && !isAdmin){
        window.location.href = '/command';
        return;
      }

      // Auth confirmed — set session cookie for Edge Middleware, reveal page
      document.cookie = 'sv_auth=' + (isAdmin ? 'admin' : '1') + '; path=/; secure; samesite=lax; max-age=604800';
      clearTimeout(window._authRevealTimer);
      document.documentElement.style.visibility = '';
      _removeAuthOverlay();

      // Fire auth:admin so admin.html can safely load — only after role is confirmed
      if(isAdmin) window.dispatchEvent(new CustomEvent('auth:admin', {detail: e.detail}));

      // Update nav with role-appropriate links
      if(!isPublicPage){
        const roleLinks = [...APP_LINKS, ...(isAdmin ? [ADMIN_LINK] : [])];
        const {nav,mob} = renderLinks(roleLinks);
        const nl = document.getElementById('navLinks');
        const ml = document.querySelector('.mob-links');
        if(nl) nl.innerHTML = nav;
        if(ml) ml.innerHTML = mob;
      }

      const initial = (user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase();
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
      const wrap = document.createElement('div');
      wrap.className = 'nav-user-wrap';
      const eInitial = escHtml(initial), eName = escHtml(name), eEmail = escHtml(user.email || '');
      wrap.innerHTML = `<button class="nav-user-btn" title="${eEmail}">${eInitial}</button>`
        +`<div class="nav-user-dd" id="userDropdown">`
        +`<div class="udd-header">`
        +`<div class="udd-avatar">${eInitial}</div>`
        +`<div class="udd-info"><div class="udd-name">${eName}</div>`
        +`<div class="udd-email">${eEmail}</div></div>`
        +`</div>`
        +`<div class="udd-sep"></div>`
        +(isAdmin ? `<a class="udd-item" href="/admin"><span class="udd-icon">⚙</span>Admin Dashboard</a>` : '')
        +`<a class="udd-item" href="/security"><span class="udd-icon">⬡</span>Security & Privacy</a>`
        +`<a class="udd-item" href="/resources"><span class="udd-icon">◉</span>Help & Support</a>`
        +`<a class="udd-item" href="/upgrade"><span class="udd-icon">◈</span>Upgrade Plan</a>`
        +`<button class="udd-item udd-referral" id="uddReferral"><span class="udd-icon">◆</span>Invite & Earn</button>`
        +`<button class="udd-item" id="uddBilling"><span class="udd-icon">◎</span>${hasActiveSub ? 'Manage Subscription' : 'Subscribe Now'}</button>`
        +`<div class="udd-sep"></div>`
        +`<button class="udd-item udd-signout" id="uddSignout"><span class="udd-icon">⏻</span>Sign Out</button>`
        +`</div>`;
      const hamBtn = actions.querySelector('.nav-ham');
      actions.insertBefore(wrap, hamBtn);
      wrap.querySelector('.nav-user-btn').onclick = (e)=>{
        e.stopPropagation();
        document.getElementById('userDropdown').classList.toggle('open');
      };
      wrap.querySelector('#uddSignout').onclick = ()=>{ _Auth.signOut(); };
      wrap.querySelector('#uddReferral').onclick = ()=>{ document.getElementById('userDropdown').classList.remove('open'); ReferralModal.open(); };
      wrap.querySelector('#uddBilling').onclick = async ()=>{
        document.getElementById('userDropdown').classList.remove('open');
        try {
          let tok = _Auth.token();
          let r = await fetch('/api/stripe/portal', {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok}
          });
          if (r.status === 401) {
            const { data: { session } } = await window._sb.auth.refreshSession();
            if (session?.access_token) { _Auth.session = session; _Auth.user = session.user; tok = session.access_token; }
            r = await fetch('/api/stripe/portal', {
              method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok}
            });
          }
          if(r.status === 400) { window.location.href = '/upgrade'; return; }
          const d = await r.json();
          if(d.url && d.url.startsWith('https://billing.stripe.com/')) { Toast.show('Opening billing portal…','info',2000); window.location.href = d.url; }
          else { window.location.href = '/upgrade'; }
        } catch(_){ Toast.show('Could not open billing portal','err'); }
      };
      document.addEventListener('click', (e)=>{
        const dd=document.getElementById('userDropdown');
        if(dd && !wrap.contains(e.target)) dd.classList.remove('open');
      });
    } else {
      // Not authenticated — redirect protected pages to login, then reveal public ones
      if(!isPublicPage){
        clearTimeout(window._authRevealTimer);
        window.location.href = '/login' + (page ? '?next=' + encodeURIComponent(page) : '');
        return;
      }
      clearTimeout(window._authRevealTimer);
      document.documentElement.style.visibility = '';
      _removeAuthOverlay();

      // Logged-out: ensure public nav is shown
      const {nav,mob} = renderLinks(PUBLIC_LINKS);
      const nl = document.getElementById('navLinks');
      const ml = document.querySelector('.mob-links');
      if(nl) nl.innerHTML = nav;
      if(ml) ml.innerHTML = mob;
      // Hide Command CTA on public pages, show Sign In
      const cta = actions.querySelector('.nav-cta');
      if(cta && isPublicPage) cta.style.display = 'none';
      if(page !== 'login'){
        const a = document.createElement('a');
        a.href = '/login';
        a.className = 'btn btn-ghost btn-sm';
        a.textContent = 'Sign In';
        actions.insertBefore(a, cta || actions.querySelector('.nav-ham'));
      }
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
    if(localStorage.getItem('cookies') !== 'yes') return;
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
      // Attach user_id if authenticated so RLS passes and rows are attributed
      const sess = await window._sb.auth.getSession?.();
      if(sess?.data?.session?.user?.id) payload.user_id = sess.data.session.user.id;
      window._sb.from('analytics_events').insert(payload)
        .then(() => {}).catch(() => {});
    }
    
    // Fire ad pixels
    this.firePixels(event_name, props);
  },
  
  firePixels(event_name, props={}) {
    if(localStorage.getItem('cookies') !== 'yes') return;
    // Meta Pixel (if configured)
    if(window.fbq) {
      const fbEvents = {page_view:'PageView',sign_up:'Lead',deal_created:'Purchase'};
      window.fbq('track', fbEvents[event_name] || 'CustomEvent', props);
    }
    // Google Analytics (if configured)
    if(window.gtag) {
      window.gtag('event', event_name, props);
    }
    // LinkedIn Insight Tag conversion tracking
    if(window.lintrk) {
      const liConversions = { sign_up: 26764154, deal_created: 26764154, upgrade: 26764154 };
      const convId = props.conversion_id || liConversions[event_name];
      if(convId) window.lintrk('track', { conversion_id: convId });
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

// ── LinkedIn Insight Tag — loaded only after cookie consent ───────────────────
function _loadLinkedIn(){
  if(!window.lintrk){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[];}
  var s=document.getElementsByTagName('script')[0];
  var b=document.createElement('script');
  b.type='text/javascript';b.async=true;
  b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';
  s.parentNode.insertBefore(b,s);
}

// ── Cookie Consent (PECR / UK GDPR) ──────────────────────────────────────────
(function(){
  var CONSENT_KEY = 'sv_cookies';

  function grantConsent(){
    localStorage.setItem(CONSENT_KEY, 'yes');
    // Legacy key used by Analytics.track / firePixels
    localStorage.setItem('cookies', 'yes');
    if(window.gtag) gtag('consent','update',{
      ad_storage:'granted', ad_user_data:'granted',
      ad_personalization:'granted', analytics_storage:'granted'
    });
    _loadLinkedIn();
  }

  function denyConsent(){
    localStorage.setItem(CONSENT_KEY, 'no');
    localStorage.setItem('cookies', 'no');
  }

  function hideBanner(){
    var el=document.getElementById('sv-cookie-banner');
    if(el) el.remove();
  }

  // Already decided — apply grant and hide
  var stored = localStorage.getItem(CONSENT_KEY);
  if(stored === 'yes'){ grantConsent(); return; }
  if(stored === 'no'){ return; }

  // Show banner on DOMContentLoaded
  function showBanner(){
    var b=document.createElement('div');
    b.id='sv-cookie-banner';
    b.innerHTML='<div style="max-width:780px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">'
      +'<span style="flex:1;min-width:220px;font-size:13px;color:#a1a1aa;line-height:1.5">'
      +'We use cookies and pixels for analytics and advertising. See our <a href="/privacy" style="color:#c9a84c">Privacy Policy</a>.'
      +'</span>'
      +'<div style="display:flex;gap:8px;flex-shrink:0">'
      +'<button id="sv-ck-deny" style="padding:8px 16px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#71717a;font-size:13px;cursor:pointer">Decline</button>'
      +'<button id="sv-ck-accept" style="padding:8px 20px;border-radius:7px;border:none;background:#c9a84c;color:#0a0a0f;font-size:13px;font-weight:700;cursor:pointer">Accept</button>'
      +'</div></div>';
    b.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#111118;border-top:1px solid rgba(255,255,255,.08);padding:14px 20px;display:flex;justify-content:center';
    document.body.appendChild(b);
    document.getElementById('sv-ck-accept').onclick=function(){ grantConsent(); hideBanner(); };
    document.getElementById('sv-ck-deny').onclick=function(){ denyConsent(); hideBanner(); };
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();

/* ══════════════════════════════════════
   EXTENDED API — NEW EDGE FUNCTIONS
   ══════════════════════════════════════ */
// Extend existing API object
Object.assign(API, {
  milestones: {
    list:      (deal_id)        => API._call('sovereign-api',{action:'milestones:list', deal_id}),
    update:    (id, payload)    => API._call('sovereign-api',{action:'milestones:update', payload:{id,...payload}}),
    init:      (deal_id, tpl)   => API._call('sovereign-api',{action:'milestones:init', deal_id, payload:{template:tpl||'nmd_standard'}}),
    templates: ()               => API._call('sovereign-api',{action:'milestones:templates'}),
  },
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
  },

  // ── automation-engine: AI workflow execution ───────────────────
  engine: {
    run:              (workflow_id, deal_id, context) => API._call('automation-engine',{action:'engine:run',      payload:{workflow_id,deal_id,context}}),
    task:             (agent_seat, task, deal_id)     => API._call('automation-engine',{action:'engine:task',     payload:{agent_seat,task,deal_id}}),
    pipelineAnalysis: ()                              => API._call('automation-engine',{action:'engine:pipeline_analysis'}),
  },

  // ── cron-jobs: cron management ────────────────────────────────
  crons: {
    list:    ()         => API._call('cron-jobs',{action:'crons:list'}),
    history: (cron_id)  => API._call('cron-jobs',{action:'crons:history',  payload:{cron_id}}),
    trigger: (cron_id)  => API._call('cron-jobs',{action:'crons:trigger',  payload:{cron_id}}),
    metrics: ()         => API._call('cron-jobs',{action:'crons:metrics'}),
  },

  // ── notify-commander: smart notifications ─────────────────────
  commander: {
    dispatch:  (title,message,priority,agent,deal_id) => API._call('notify-commander',{action:'commander:dispatch',   payload:{title,message,priority,agent_name:agent,deal_id}}),
    dealAlert: (deal_id,alert_type,message,agent)     => API._call('notify-commander',{action:'commander:deal_alert', payload:{deal_id,alert_type,message,agent_name:agent}}),
    history:   (limit)                                => API._call('notify-commander',{action:'commander:history',    payload:{limit}}),
  },

  // ── sovereign-ops: platform operations ────────────────────────
  ops: {
    kpis:             ()                          => API._call('sovereign-ops',{action:'ops:kpis'}),
    health:           ()                          => API._call('sovereign-ops',{action:'ops:health'}),
    agentPerformance: (days)                      => API._call('sovereign-ops',{action:'ops:agent_performance', payload:{days}}),
    recordMetric:     (metric_name,metric_value,metric_unit,tags) => API._call('sovereign-ops',{action:'ops:record_metric',payload:{metric_name,metric_value,metric_unit,tags}}),
    metrics:          (metric_name,limit)         => API._call('sovereign-ops',{action:'ops:metrics',          payload:{metric_name,limit}}),
    auditSummary:     (days)                      => API._call('sovereign-ops',{action:'ops:audit_summary',    payload:{days}}),
  },

  // ── sovereign-api intel + scrape queue ────────────────────────
  intel: {
    get:      (deal_id) => API._call('sovereign-api',{action:'intel:get',         deal_id}),
    list:     ()        => API._call('sovereign-api',{action:'intel:list'}),
    queueAdd: (deal_id, company_name, website_url) => API._call('sovereign-api',{action:'scrape:queue:add', deal_id, payload:{company_name,website_url}}),
  },

  // ── billing ──────────────────────────────────────────────────
  billing: {
    status: () => API._call('sovereign-api', {action:'billing:status'}),
  },

  // ── referrals ────────────────────────────────────────────────
  referral: {
    get:   ()     => API._call('sovereign-api',{action:'referral:get'}),
    track: (code) => API._call('sovereign-api',{action:'referral:track', payload:{code}}),
  },

  // ── email system ────────────────────────────────────────────
  mail: {
    list:      (folder,category,search,limit,offset) => API._call('email-send',{action:'list',    payload:{folder,category,search,limit,offset}}),
    get:       (id)                                   => API._call('email-send',{action:'get',     payload:{id}}),
    thread:    (thread_id)                             => API._call('email-send',{action:'thread',  payload:{thread_id}}),
    send:      (p)                                     => API._call('email-send',{action:'send',    payload:p}),
    update:    (ids,updates)                           => API._call('email-send',{action:'update',  payload:{ids,...updates}}),
    delete:    (ids,permanent)                         => API._call('email-send',{action:'delete',  payload:{ids,permanent}}),
    counts:    ()                                      => API._call('email-send',{action:'counts'}),
    draftSave: (p)                                     => API._call('email-send',{action:'draft:save', payload:p}),
    rules:     ()                                      => API._call('email-send',{action:'rules:list'}),
    ruleCreate:(p)                                     => API._call('email-send',{action:'rules:create',payload:p}),
    ruleDelete:(id)                                    => API._call('email-send',{action:'rules:delete',payload:{id}}),
  },
  aliases: {
    list:     ()  => API._call('email-alias',{action:'alias:list'}),
    create:   (p) => API._call('email-alias',{action:'alias:create', payload:p}),
    update:   (p) => API._call('email-alias',{action:'alias:update', payload:p}),
    delete:   (id)=> API._call('email-alias',{action:'alias:delete', payload:{id}}),
    domains:  ()  => API._call('email-alias',{action:'domains:list'}),
    dnsCheck: (d) => API._call('email-alias',{action:'domain:check', payload:{domain:d}}),
  },
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

/* ══════════════════════════════════════
   REFERRAL CAPTURE — ?ref= on page load
   ══════════════════════════════════════ */
(function captureRef(){
  const p = new URLSearchParams(location.search);
  const ref = p.get('ref');
  if(ref && /^[A-Z0-9]{6,12}$/i.test(ref)) {
    localStorage.setItem('sv_ref', ref.toUpperCase());
  }
})();

/* ══════════════════════════════════════
   REFERRAL MODAL
   ══════════════════════════════════════ */
const ReferralModal = {
  _loaded: false,

  open() {
    if(!_Auth.user){ Toast.show('Sign in to view your referral link','warn'); return; }
    this._inject();
    const modal = document.getElementById('referral-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this._load();
  },

  close() {
    const modal = document.getElementById('referral-modal');
    if(modal){ modal.style.display = 'none'; document.body.style.overflow = ''; }
  },

  _inject() {
    if(document.getElementById('referral-modal')) return;
    const el = document.createElement('div');
    el.id = 'referral-modal';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;align-items:center;justify-content:center;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);padding:20px';
    el.innerHTML = `
<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:520px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.6)">
  <div style="padding:24px 24px 0;display:flex;align-items:flex-start;justify-content:space-between">
    <div>
      <div style="font-size:10px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">Referral Programme</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Invite & Earn</div>
      <div style="font-size:13px;color:var(--text2);margin-top:4px;line-height:1.5">Refer another dealmaker. When they subscribe, you both get <strong style="color:var(--gold2)">30 days free</strong>.</div>
    </div>
    <button id="ref-modal-close" style="background:var(--surface);border:1px solid var(--border2);border-radius:8px;width:32px;height:32px;cursor:pointer;color:var(--text2);font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:12px">✕</button>
  </div>

  <div style="padding:20px 24px">
    <!-- Referral link -->
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Your referral link</div>
      <div style="display:flex;gap:8px;align-items:center">
        <div id="ref-link-display" style="flex:1;font-family:var(--mono);font-size:12px;color:var(--gold2);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Loading…</div>
        <button id="ref-copy-btn" style="background:var(--gold-dim);border:1px solid rgba(201,168,76,.3);color:var(--gold);border-radius:7px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s">Copy</button>
      </div>
    </div>

    <!-- Stats row -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px" id="ref-stats">
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:14px;text-align:center">
        <div id="ref-stat-signups" style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--teal)">—</div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px;text-transform:uppercase;letter-spacing:.08em">Signed Up</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:14px;text-align:center">
        <div id="ref-stat-subscribed" style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--gold2)">—</div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px;text-transform:uppercase;letter-spacing:.08em">Subscribed</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:14px;text-align:center">
        <div id="ref-stat-credits" style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--gold)">—</div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px;text-transform:uppercase;letter-spacing:.08em">Days Credit</div>
      </div>
    </div>

    <!-- Share buttons -->
    <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Share via</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="ref-share-twitter" style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='rgba(29,161,242,.5)';this.style.color='#1da1f2'" onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text)'">𝕏 Twitter</button>
      <button id="ref-share-linkedin" style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='rgba(0,119,181,.5)';this.style.color='#0077b5'" onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text)'">LinkedIn</button>
      <button id="ref-share-whatsapp" style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='rgba(37,211,102,.5)';this.style.color='#25d366'" onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text)'">WhatsApp</button>
      <button id="ref-share-email" style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--border3)';this.style.color='var(--gold)'" onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text)'">Email</button>
    </div>

    <div style="margin-top:14px;padding:12px;background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.15);border-radius:8px;font-size:12px;color:var(--text2);line-height:1.5">
      <strong style="color:var(--gold2)">How it works:</strong> Share your link. When someone signs up and subscribes, you both receive 30 days of free access. Credits are applied automatically to your next billing cycle.
    </div>
  </div>
</div>`;
    document.body.appendChild(el);

    document.getElementById('ref-modal-close').onclick = ()=>this.close();
    el.addEventListener('click', e=>{ if(e.target===el) this.close(); });

    document.getElementById('ref-copy-btn').onclick = ()=>{
      const link = document.getElementById('ref-link-display').textContent;
      if(link && link !== 'Loading…') {
        navigator.clipboard.writeText(link).then(()=>{ Toast.show('Referral link copied!','ok',2000); }).catch(()=>{
          const ta = document.createElement('textarea');
          ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          Toast.show('Referral link copied!','ok',2000);
        });
      }
    };

    document.getElementById('ref-share-twitter').onclick = ()=>{
      const link = document.getElementById('ref-link-display').textContent;
      const text = encodeURIComponent(`I'm using Sovereign — the deal flow command centre built for acquirers. Track targets, score deals, manage broker relationships, and close faster. Join me:`);
      const url = encodeURIComponent(link);
      window.open(`https://twitter.com/intent/tweet?text=${text}%20${url}`, '_blank', 'width=600,height=400');
    };

    document.getElementById('ref-share-linkedin').onclick = ()=>{
      const link = encodeURIComponent(document.getElementById('ref-link-display').textContent);
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${link}`, '_blank', 'width=600,height=500');
    };

    document.getElementById('ref-share-whatsapp').onclick = ()=>{
      const link = document.getElementById('ref-link-display').textContent;
      const text = encodeURIComponent(`I'm using Sovereign for acquisition deal flow — AI agents that track targets, score deals, and manage broker relationships. Check it out: ${link}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    document.getElementById('ref-share-email').onclick = ()=>{
      const link = document.getElementById('ref-link-display').textContent;
      const subject = encodeURIComponent('Sovereign — deal flow command centre for acquirers');
      const body = encodeURIComponent(`Hey,\n\nI've been using Sovereign to manage my acquisition pipeline — AI agents that track targets, score deals, manage broker relationships, and keep everything moving from first contact to completion.\n\nThought you'd find it useful. Here's my referral link — you'll get 30 days free when you sign up:\n\n${link}\n\nLet me know what you think.`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };
  },

  async _load() {
    const linkEl = document.getElementById('ref-link-display');
    const signupsEl = document.getElementById('ref-stat-signups');
    const subscribedEl = document.getElementById('ref-stat-subscribed');
    const creditsEl = document.getElementById('ref-stat-credits');
    if(!linkEl) return;

    try {
      const res = await API.referral.get();
      if(!res?.data) { if(linkEl) linkEl.textContent = 'Error loading referral data'; return; }
      const { referral_code, credits, stats } = res.data;
      const baseUrl = location.origin;
      const link = `${baseUrl}/?ref=${referral_code}`;
      linkEl.textContent = link;
      signupsEl.textContent = (stats.signed_up || 0).toString();
      subscribedEl.textContent = (stats.subscribed || 0).toString();
      creditsEl.textContent = (credits || 0).toString();
    } catch(e) {
      if(linkEl) linkEl.textContent = 'Error loading referral data';
    }
  }
};
window.ReferralModal = ReferralModal;

/* ══════════════════════════════════════
   TRIAL BANNER + BILLING GATE
   ══════════════════════════════════════ */
const TrialGuard = {
  _status: null,
  _SKIP_PAGES: new Set(['index.html','login.html','upgrade.html','legal.html','mediakit.html','resources.html','','login','upgrade','legal','mediakit','resources']),

  async init() {
    const page = location.pathname.split('/').pop() || '';
    if(this._SKIP_PAGES.has(page)) return;

    let checked = false;
    const onAuth = (e) => {
      if(!e.detail?.user || checked) return;
      checked = true;
      this._check();
    };
    window.addEventListener('auth:ready', onAuth, {once:true});
    // Fallback: if auth:ready fires with null (OAuth redirect), re-check on auth:changed
    window.addEventListener('auth:changed', onAuth);
  },

  async _check() {
    try {
      const res = await API.billing.status();
      if(!res?.data) return;
      this._status = res.data;
      const { subscription_status, trial_days_left, trial_expired, plan } = res.data;

      // Active subscriber — no banner needed
      if(subscription_status === 'active' || plan === 'enterprise') return;

      // Trial expired → hard gate
      if(trial_expired) {
        this._showExpiredGate();
        return;
      }

      // Trial warning — show banner at ≤7 days
      if(subscription_status === 'trialing' && trial_days_left <= 7) {
        this._showBanner(trial_days_left);
      }

      // Day 14 (7 days left) trigger handled above
      // Day 19 (2 days left) — more urgent styling handled by _showBanner
    } catch(_) {}
  },

  _showBanner(daysLeft) {
    if(document.getElementById('trial-banner')) return;
    const urgent = daysLeft <= 2;
    const banner = document.createElement('div');
    banner.id = 'trial-banner';
    banner.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:9998;padding:10px 20px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:13px;background:${urgent ? 'rgba(220,53,69,.95)' : 'rgba(201,168,76,.12)'};border-top:1px solid ${urgent ? 'rgba(220,53,69,.6)' : 'rgba(201,168,76,.3)'};backdrop-filter:blur(8px)`;
    banner.innerHTML = `
      <span style="color:${urgent ? '#fff' : 'var(--gold2)'}">
        ${urgent
          ? `<strong>⚠ ${daysLeft === 0 ? 'Trial expires today' : `${daysLeft} day${daysLeft===1?'':'s'} left`}</strong> — your deal pipeline will be locked when it ends.`
          : `<strong>${daysLeft} days</strong> remaining on your free trial.`
        }
      </span>
      <a href="/upgrade" style="background:${urgent ? '#fff' : 'var(--gold)'};color:${urgent ? '#dc3545' : '#0a0a0f'};border-radius:6px;padding:6px 16px;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;transition:opacity .15s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Upgrade Now</a>
      <button onclick="document.getElementById('trial-banner').remove()" style="background:none;border:none;color:${urgent ? 'rgba(255,255,255,.6)' : 'var(--text3)'};cursor:pointer;font-size:16px;padding:0 4px;line-height:1">✕</button>`;
    document.body.appendChild(banner);
    // Push nav up if present
    const nav = document.getElementById('mainNav');
    if(nav) nav.style.marginBottom = '0';
  },

  _showExpiredGate() {
    // Dim the page and show a blocking modal
    const gate = document.createElement('div');
    gate.id = 'trial-gate';
    gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,10,15,.96);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px';
    gate.innerHTML = `
<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:480px;padding:36px;text-align:center">
  <div style="width:56px;height:56px;background:rgba(220,53,69,.1);border:1px solid rgba(220,53,69,.3);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 20px">⏳</div>
  <div style="font-size:10px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px">Trial Ended</div>
  <h2 style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px">Your 21-day trial has expired</h2>
  <p style="font-size:14px;color:var(--text2);line-height:1.65;margin-bottom:28px">Your deal pipeline, targets, and all data are safe — upgrade to regain full access. No data will be deleted.</p>
  <a href="/upgrade" style="display:block;background:var(--gold);color:#0a0a0f;border-radius:10px;padding:14px 24px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px;transition:opacity .15s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Choose a Plan — from £149/mo</a>
  <button onclick="document.getElementById('trial-gate').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;text-decoration:underline">Continue in read-only mode</button>
</div>`;
    document.body.appendChild(gate);
  }
};
window.TrialGuard = TrialGuard;

// Auto-init
window.addEventListener('sb:ready', () => TrialGuard.init());

/* ══════════════════════════════════════
   REDDIT PIXEL
   ══════════════════════════════════════ */
(function(w,d){
  if(!w.rdt){
    var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};
    p.callQueue=[];
    var t=d.createElement('script');t.src='https://www.redditstatic.com/ads/pixel.js?pixel_id=a2_itp5sg1ycosw';t.async=true;
    var s=d.getElementsByTagName('script')[0];s.parentNode.insertBefore(t,s);
  }
})(window,document);
rdt('init','a2_itp5sg1ycosw');
rdt('track','PageVisit');

/* ══════════════════════════════════════
   CHECKOUT SUCCESS HANDLER
   ══════════════════════════════════════ */
(function(){
  const p = new URLSearchParams(location.search);
  if(p.get('checkout') !== 'success') return;
  // Save plan/billing/session before cleaning URL — inline page scripts run after this
  window._checkoutData = { plan: p.get('plan'), billing: p.get('billing'), sid: p.get('sid') };
  history.replaceState({}, '', location.pathname);
  window.addEventListener('auth:ready', function handler(){
    setTimeout(function(){
      Toast.show('Payment confirmed — welcome to Sovereign! Your subscription is now active.','ok',6000);
      var cd = window._checkoutData || {};
      var vals = { prospector:{monthly:99,annual:79}, dealmaker:{monthly:299,annual:239}, team:{monthly:799,annual:639}, fund:{monthly:2500,annual:2000} };
      var value = (vals[cd.plan] && vals[cd.plan][cd.billing]) || 0;
      if(typeof gtag === 'function') {
        gtag('event', 'purchase', {
          transaction_id: cd.sid,
          value: value,
          currency: 'GBP',
          items: [{ item_id: cd.plan+'_'+cd.billing, item_name: 'Sovereign '+cd.plan, price: value, quantity: 1 }]
        });
      }
      if(typeof rdt === 'function') rdt('track', 'Purchase', { value: value, currency: 'GBP' });
    }, 800);
  }, {once:true});
})();
