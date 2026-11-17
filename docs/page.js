/* ---- Setup: replace the placeholders (see worker/SETUP.md). While either is a placeholder the form shows only the GitHub link. ---- */
var TELLTALE_CONFIG={
  FEEDBACK_ENDPOINT:'/api/feedback', // same-origin Pages Function (functions/api/feedback.js); no CORS needed
  TURNSTILE_SITE_KEY:'0x4AAAAAAGAkESdd8G3tJB0M', // PLACEHOLDER: the Turnstile widget's site key
  CF_ANALYTICS_TOKEN:'CF_ANALYTICS_TOKEN' // PLACEHOLDER: only if you add the Web Analytics snippet by hand; leave as is if you turn on Pages' automatic Web Analytics
};
(function(){
  var REL='https://github.com/ryanStark24/telltale-releases/releases';
  var API='https://api.github.com/repos/ryanStark24/telltale-releases/releases?per_page=5';
  var KEY='telltale-releases-v2';
  var $=function(id){return document.getElementById(id)};
  /* The current release, rewritten by scripts/update-latest.mjs on every release (a JSON block, not code). The download never depends on the network. */
  function readBaked(){
    try{var b=$('baked-release'),j=b&&JSON.parse(b.textContent);if(j&&typeof j==='object'&&!Array.isArray(j))return j}catch(e){}
    return null;
  }
  /* Only links into this repo are ever put in an href; anything else becomes the releases page. */
  function safeUrl(u){return typeof u==='string'&&u.indexOf(REL.slice(0,-'releases'.length))===0?u:REL}
  var BAKED=readBaked();
  var state={arch:'arm',rel:BAKED,sure:false};
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- public stats: one lazy fetch; any failure leaves the section hidden ---------- */
  (function(){
    var sec=$('stats');if(!sec||!window.IntersectionObserver||!window.fetch)return;
    var started=false;
    var fmt=function(n){return n.toLocaleString('en-US')};
    var flag=function(c){return c!=='ZZ'&&/^[A-Z]{2}$/.test(c)?String.fromCodePoint(c.charCodeAt(0)+127397,c.charCodeAt(1)+127397):'\uD83C\uDF10'};
    var names=null;try{names=new Intl.DisplayNames(['en'],{type:'region'})}catch(e){}
    var nameOf=function(c){if(c==='ZZ')return'Unknown location';try{return(names&&names.of(c))||c}catch(e){return c}};
    var el=function(t,cls,txt){var e=document.createElement(t);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
    function countUp(node,to){
      node.textContent=fmt(to);
      if(reduce||to<2)return;
      var t0=performance.now(),dur=Math.min(1400,500+to*8);
      (function f(now){var p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);node.textContent=fmt(Math.round(to*e));if(p<1)requestAnimationFrame(f)})(t0);
    }
    function render(d){
      var total=Math.max(0,Math.floor(Number(d.totalDownloads)||0));
      var cc=Array.isArray(d.clicksByCountry)?d.clicksByCountry.filter(function(r){return r&&r.clicks>0&&typeof r.country==='string'}):[];
      var n=Math.max(0,Math.floor(Number(d.countries)||0));
      if(!total&&!cc.length)return false;
      var big=$('st-big');big.setAttribute('aria-label',fmt(total));
      $('st-sub').textContent=(total===1?'download':'downloads')+(n>0?' from '+n+(n===1?' country':' countries'):' so far');
      big.removeAttribute('aria-hidden');big.setAttribute('role','img');
      var vs=(Array.isArray(d.byVersion)?d.byVersion:[]).slice(0,3),ul=$('st-ver');
      vs.forEach(function(v){var a=+v.arm64||0,x=+v.x64||0;if(a+x<1)return;
        var li=el('li');li.appendChild(el('b',null,v.version));
        li.appendChild(document.createTextNode(fmt(a)+' Apple silicon · '+fmt(x)+' Intel'));ul.appendChild(li)});
      ul.hidden=!ul.children.length;
      if(cc.length){
        var oth=cc.filter(function(r){return r.country==='ZZ'}),top=cc.filter(function(r){return r.country!=='ZZ'}).slice(0,oth.length?7:8).concat(oth),max=Math.max.apply(null,top.map(function(r){return r.clicks})),list=$('st-list');
        top.forEach(function(r){
          var li=el('li','st-row'),nm=el('span','st-name');
          var f=el('span',null,flag(r.country));f.setAttribute('aria-hidden','true');
          nm.appendChild(f);nm.appendChild(el('span',null,nameOf(r.country)));
          li.appendChild(nm);li.appendChild(el('span','st-n',fmt(r.clicks)+(r.clicks===1?' download':' downloads')));
          var bar=el('span','st-bar');bar.setAttribute('aria-hidden','true');
          var i=el('i');i.style.width=Math.max(6,Math.round(r.clicks/max*100))+'%';bar.appendChild(i);
          li.appendChild(bar);list.appendChild(li)});
        $('st-panel').hidden=false;
      }
      sec.hidden=false;
      countUp(big,total);
      return true;
    }
    new IntersectionObserver(function(es,io){
      if(started||!es.some(function(e){return e.isIntersecting}))return;
      started=true;io.disconnect();
      fetch('/api/stats',{headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(render).catch(function(){});
    },{rootMargin:'300px 0px'}).observe($('feedback'));
  })();

  /* ---------- window: replay + tilt ---------- */
  var win=$('win');
  if(!reduce&&matchMedia('(hover:hover)').matches){
    var st=$('stage');
    st.addEventListener('pointermove',function(e){var r=st.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;win.style.setProperty('--ry',(x*5).toFixed(2)+'deg');win.style.setProperty('--rx',(-y*4).toFixed(2)+'deg')});
    st.addEventListener('pointerleave',function(){win.style.setProperty('--ry','0deg');win.style.setProperty('--rx','0deg')});
  }


  /* ---------- hero: slideshow (pauses on hover and focus; static first screen with reduced motion) ---------- */
  (function(){
    var slides=[].slice.call(document.querySelectorAll('.slide')),tabs=[].slice.call(document.querySelectorAll('.tab')),cap=$('cap'),st=$('stage');
    var cur=0,timer=null,user=false,DUR=6500;
    function go(i){
      cur=(i+slides.length)%slides.length;
      slides.forEach(function(s,k){s.classList.toggle('on',k===cur);if(k===cur)s.removeAttribute('aria-hidden');else s.setAttribute('aria-hidden','true')});
      tabs.forEach(function(t,k){t.setAttribute('aria-pressed',k===cur?'true':'false');var b=t.querySelector('i');b.style.animation='none';void b.offsetWidth;b.style.animation=''});
      cap.textContent=slides[cur].getAttribute('data-cap');
    }
    function stop(){clearTimeout(timer);timer=null}
    function tick(){stop();if(reduce||user)return;timer=setTimeout(function(){go(cur+1);tick()},DUR)}
    tabs.forEach(function(t){t.addEventListener('click',function(){user=true;stop();st.classList.add('paused');go(+t.getAttribute('data-i'))})});
    if(reduce){tabs.forEach(function(t){t.querySelector('i').style.display='none'});return}
    st.style.setProperty('--dur',DUR+'ms');
    st.addEventListener('pointerenter',function(){stop();st.classList.add('paused')});
    st.addEventListener('pointerleave',function(){if(!user){st.classList.remove('paused');go(cur);tick()}});
    st.addEventListener('focusin',function(){stop();st.classList.add('paused')});
    st.addEventListener('focusout',function(){if(!user){st.classList.remove('paused');go(cur);tick()}});
    if('IntersectionObserver' in window)new IntersectionObserver(function(e){if(e[0].isIntersecting){if(!user&&!st.classList.contains('paused'))tick()}else stop()},{threshold:.1}).observe(st);
    else tick();
  })();

  /* ---------- helpers ---------- */
  function mb(n){return n>0?(n/1048576).toFixed(n>=1.05e8?0:1)+' MB':''}
  function cleanHeadline(s){
    s=s.replace(/`/g,'').replace(/\s+/g,' ').trim().replace(/[.:]$/,'');
    s=s.replace(/^Grace(’s|'s)\b/,'Your lead’s').replace(/^Grace\b/,'Your lead');
    s=s.replace(/\bGrace(’s|'s)\b/g,'your lead’s').replace(/\bGrace\b/g,'your lead');
    if(/your lead/i.test(s))s=s.replace(/\bshe\b/g,'it').replace(/\bherself\b/g,'itself');
    return s;
  }
  function headlines(body){
    var out=[],on=false,lines=String(body||'').split(/\r?\n/);
    for(var i=0;i<lines.length&&out.length<6;i++){
      var l=lines[i],h=/^#{1,4}\s*(.+)$/.exec(l);
      if(h){on=/^(new in|fixed in)\b/i.test(h[1].trim());continue}
      if(!on)continue;
      var m=/^\s*[-*]\s+\*\*(.+?)\*\*/.exec(l);
      if(m)out.push(cleanHeadline(m[1]));
    }
    return out;
  }
  function verLabel(tag){
    var v=String(tag||'').replace(/^v/i,''),m=/^(\d+\.\d+\.\d+)-beta\.?(\d+)?/i.exec(v);
    if(m)return m[1]+' beta'+(m[2]&&m[2]!=='1'?' '+m[2]:'');
    return v;
  }
  function find(rel,pat){var a=(rel.assets||[]);for(var i=0;i<a.length;i++)if(a[i].name&&a[i].name.indexOf(pat)>-1&&a[i].browser_download_url)return a[i];return null}

  /* ---------- render download ---------- */
  function setBtn(id,asset,kind,desc,primary,sure){
    var b=$(id);if(!b)return;
    if(!asset){b.hidden=true;return}
    b.hidden=false;b.href=safeUrl(asset.browser_download_url);b.setAttribute('data-dl',kind);b.setAttribute('data-ver',verLabel(state.rel.tag_name).replace(/\s+/g,'-'));
    b.classList.toggle('sec',!primary);
    b.querySelector('small').textContent=desc+(asset.size?' · '+mb(asset.size):'')+(sure?' · Looks like your Mac':'');
  }
  /* SHA-256 of each zip, from GitHub's asset digest. Hidden when none is known. */
  function renderSums(arm,intel){
    var box=$('dl-sums');if(!box)return;
    box.textContent='';
    [['Apple Silicon',arm],['Intel',intel]].forEach(function(r){
      var h=r[1]&&/^sha256:([0-9a-f]{64})$/.exec(String(r[1].digest||''));
      if(!h)return;
      var p=document.createElement('p'),c=document.createElement('code');
      c.textContent=h[1];p.appendChild(document.createTextNode('SHA-256 ('+r[0]+'): '));p.appendChild(c);box.appendChild(p);
    });
    box.hidden=!box.children.length;
  }
  function render(){
    var rel=state.rel,arm=rel&&find(rel,'AppleSilicon-arm64.zip'),intel=rel&&find(rel,'Intel-x64.zip');
    if(!rel)return; // baked data missing or malformed: keep the baked buttons as they are
    if(!arm&&!intel){$('dls').hidden=true;$('dl-all').hidden=false;return} // only when no download URL is known at all
    $('dls').hidden=false;$('dl-all').hidden=true;
    var want=state.arch==='intel'&&intel?'intel':(arm?'arm':'intel');
    setBtn('dl-arm',arm,'arm64','M1 or later',want==='arm',state.sure&&want==='arm');
    setBtn('dl-intel',intel,'x64','Intel Mac',want==='intel',state.sure&&want==='intel');
    renderSums(arm,intel);
    var lat=$('dl-latest');
    if(lat&&rel.tag_name){
      lat.textContent='';
      var p=document.createElement('span');p.className='pill';p.textContent='Latest';
      var v=document.createElement('b');v.textContent='v'+verLabel(rel.tag_name);
      lat.appendChild(p);lat.appendChild(v);
      if(rel.published_at){try{var d=new Date(rel.published_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});var sp=document.createElement('span');sp.className='sep';sp.textContent='·';lat.appendChild(sp);lat.appendChild(document.createTextNode(d))}catch(e){}}
    }
  }
  function renderNews(){
    var rel=state.rel;if(!rel)return;
    $("notes-link").href=safeUrl(rel.html_url);
    var h=headlines(rel.body),ul=$('news');
    if(!h.length)return;
    ul.textContent='';
    h.forEach(function(t){var li=document.createElement('li');li.textContent=t;ul.appendChild(li)});
    ul.hidden=false;$('notes-link').textContent='Full release notes';
    var v=$('new-ver');v.textContent='In '+verLabel(rel.tag_name);v.hidden=false;
  }

  /* ---------- Mac type ---------- */
  function detect(){
    try{
      var u=navigator.userAgentData;
      if(u&&u.getHighEntropyValues){
        u.getHighEntropyValues(['architecture']).then(function(r){
          if(r.architecture==='arm'){state.arch='arm';state.sure=true;render()}
          else if(r.architecture==='x86'&&/mac/i.test(u.platform||'')){state.arch='intel';state.sure=true;render()}
        }).catch(function(){});
        return;
      }
    }catch(e){}
    try{ // Safari and others: the graphics chip name is the only hint
      var c=document.createElement('canvas'),gl=c.getContext('webgl'),x=gl&&gl.getExtension('WEBGL_debug_renderer_info');
      var r=x?String(gl.getParameter(x.UNMASKED_RENDERER_WEBGL)):'';
      if(/Apple M|Apple GPU/i.test(r)){state.arch='arm';render()}
      else if(/Intel/i.test(r)&&/Mac/.test(navigator.platform||'')){state.arch='intel';state.sure=true;render()}
    }catch(e){}
  }

  /* ---------- data: one fetch per visit ---------- */
  function hasZips(r){return !!(r&&!r.draft&&(find(r,'AppleSilicon-arm64.zip')||find(r,'Intel-x64.zip')))}
  function pick(list){
    if(!Array.isArray(list))return null;
    for(var i=0;i<list.length;i++)if(list[i]&&!list[i].draft&&hasZips(list[i]))return list[i];
    return null;
  }
  function trim(x){return {tag_name:x.tag_name,name:x.name,draft:x.draft,prerelease:x.prerelease,published_at:x.published_at,html_url:x.html_url,body:x.body,assets:(x.assets||[]).map(function(a){return {name:a.name,size:a.size,browser_download_url:a.browser_download_url,digest:a.digest}})}}
  /* A newer release replaces the known one; anything without zip assets is ignored, so the state never gets worse. */
  function take(r){if(!hasZips(r))return false;state.rel=r;render();renderNews();fbLink();return true}
  function getJSON(url,ms,opts){
    var ctl=window.AbortController?new AbortController():null,t=setTimeout(function(){ctl&&ctl.abort()},ms);
    opts=opts||{};if(ctl)opts.signal=ctl.signal;
    return fetch(url,opts).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){clearTimeout(t);return j},function(e){clearTimeout(t);throw e});
  }
  function load(){
    render();renderNews();fbLink(); // paint from the baked release first
    try{var c=sessionStorage.getItem(KEY);if(c){var cr=JSON.parse(c);if(take(Array.isArray(cr)?pick(cr):cr))return}}catch(e){}
    // 1) same-origin latest.json, 2) the GitHub API, 3) what is baked in
    getJSON('latest.json',6000,{cache:'no-cache'}).then(function(j){
      if(!take(j))throw new Error('none');
      try{sessionStorage.setItem(KEY,JSON.stringify(j))}catch(e){}
    }).catch(function(){
      return getJSON(API,8000,{headers:{Accept:'application/vnd.github+json'}}).then(function(list){
        var r=pick(list);if(!r)throw new Error('none');
        take(trim(r));
        try{sessionStorage.setItem(KEY,JSON.stringify(trim(r)))}catch(e){}
      });
    }).catch(function(){});
  }

  /* ---------- download click counting: a tiny same-origin beacon (never blocks the link) ---------- */
  document.addEventListener('click',function(e){
    try{
      var a=e.target.closest&&e.target.closest('a[data-dl]');if(!a)return;
      var k='download-'+a.getAttribute('data-dl')+'-'+(a.getAttribute('data-ver')||'unknown');
      if(navigator.sendBeacon)navigator.sendBeacon('/api/hit?k='+encodeURIComponent(k));
    }catch(err){}
  },true);
  /* ---------- Cloudflare Web Analytics: only when a token is set here. Pages' automatic Web Analytics needs no code. ---------- */
  (function(){var t=TELLTALE_CONFIG.CF_ANALYTICS_TOKEN;if(!t||t.indexOf('CF_')===0)return;var s=document.createElement('script');s.defer=true;s.src='https://static.cloudflareinsights.com/beacon.min.js';s.setAttribute('data-cf-beacon',JSON.stringify({token:t}));document.head.appendChild(s)})();

  /* ---------- feedback: rating row prefills the GitHub issue form ---------- */
  var RATES=[['1 - It did not work for me','Not for me'],['2 - Hard going','Hard going'],['3 - Okay','Okay'],['4 - Good','Good'],['5 - Great','Great']];
  var KINDS=[
    {k:'feedback',name:'Feedback',tpl:'feedback.yml',cmt:'Comments',ph:'What worked, what didn’t, what you wish it did.',send:'Send feedback',done:'Your feedback was sent.'},
    {k:'bug',name:'Bug',tpl:'bug_report.yml',cmt:'What happened, and what did you expect?',ph:'What happened, what you expected, and the steps to get there.',send:'Send bug report',done:'Your bug report was sent.'},
    {k:'feature',name:'Feature idea',tpl:'feature_request.yml',cmt:'What is the idea?',ph:'The problem you have, your idea, and how you would use it.',send:'Send idea',done:'Your idea was sent.'},
    {k:'question',name:'Question',tpl:'question.yml',cmt:'What would you like to know?',ph:'Ask anything about how Telltale works.',send:'Send question',done:'Your question was sent.'}
  ];
  var kind=KINDS[0];
  var FB='https://github.com/ryanStark24/telltale-releases/issues/new?template=';
  var rating='';
  function fbLink(){
    var u=FB+kind.tpl;
    if(state.rel)u+='&version='+encodeURIComponent(String(state.rel.tag_name).replace(/^v/i,''));
    if(rating&&kind.k==='feedback')u+='&rating='+encodeURIComponent(rating);
    $('fb-link').href=u;
    var v=$('fb-ver');if(v&&!v.dataset.touched&&state.rel)v.value=verLabel(state.rel.tag_name).replace(/ beta ?(\d*)/,function(m,n){return '-beta.'+(n||'1')});
  }
  (function(){
    var kr=$('kind-row');
    KINDS.forEach(function(kd,i){
      var l=document.createElement('label'),inp=document.createElement('input'),sp=document.createElement('span');
      inp.type='radio';inp.name='kind';inp.value=kd.k;inp.checked=i===0;
      sp.textContent=kd.name;
      inp.addEventListener('change',function(){
        kind=kd;$('rate-fs').hidden=kd.k!=='feedback';
        $('fb-msg-l').textContent=kd.cmt;$('fb-msg').placeholder=kd.ph;
        $('fb-use-l').textContent='What do you use Telltale for?'+(kd.k==='feedback'?'':' (optional)');
        $('fb-use').options[0].textContent=kd.k==='feedback'?'Choose one':'Skip';
        $('fb-send').textContent=kd.send;$('fb-thanks-text').textContent=kd.done;
        $('fb-status').textContent='';$('fb-status').className='status';
        fbLink();
      });
      l.appendChild(inp);l.appendChild(sp);kr.appendChild(l);
    });
    var row=$('rate-row');
    RATES.forEach(function(r,i){
      var l=document.createElement('label'),inp=document.createElement('input'),sp=document.createElement('span'),b=document.createElement('b');
      inp.type='radio';inp.name='rating';inp.value=r[0];
      b.textContent=String(i+1);sp.appendChild(b);sp.appendChild(document.createTextNode(r[1]));
      inp.addEventListener('change',function(){rating=r[0];fbLink()});
      l.appendChild(inp);l.appendChild(sp);row.appendChild(l);
    });
  })();

  (function(){
    var C=TELLTALE_CONFIG,ok=/^\//.test(C.FEEDBACK_ENDPOINT)&&C.TURNSTILE_SITE_KEY&&C.TURNSTILE_SITE_KEY!=='TURNSTILE_SITE_KEY';
    if(!ok)return; // page works before setup: GitHub link only
    var form=$('fb-form'),st=$('fb-status'),tok='',wid=null,send=$('fb-send');
    $('fb-fields').hidden=false;$('fb-gh').hidden=true;
    $('fb-ver').addEventListener('input',function(){this.dataset.touched='1'});
    $('fb-msg').addEventListener('input',function(){$('fb-count').textContent=this.value.length+' / 2000'});
    var sc=document.createElement('script');sc.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';sc.async=true;
    sc.onload=function(){try{wid=window.turnstile.render('#ts-box',{sitekey:C.TURNSTILE_SITE_KEY,callback:function(t){tok=t},'expired-callback':function(){tok=''}})}catch(e){}};
    document.head.appendChild(sc);
    function msg(t,err){st.textContent=t;st.className='status'+(err?' err':'')}
    function fail(t){msg(t,true);$('fb-gh').hidden=false;send.disabled=false;try{window.turnstile&&window.turnstile.reset(wid)}catch(e){};tok=''}
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var fbk=kind.k==='feedback',r=parseInt(rating,10),use=$('fb-use').value,com=$('fb-msg').value.trim();
      if(fbk&&!r){msg('Pick a rating first.',true);return}
      if(fbk&&!use){msg('Choose what you use Telltale for.',true);return}
      if(!com){msg('Add a few words in Comments.',true);return}
      if(!tok){msg('Please complete the check below first.',true);return}
      send.disabled=true;msg('Sending…');
      var ctl=new AbortController(),t=setTimeout(function(){ctl.abort()},15000);
      fetch(C.FEEDBACK_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
        body:JSON.stringify({kind:kind.k,rating:fbk?r:undefined,use:use,version:$('fb-ver').value.trim(),comments:com,website:$('fb-hp').value,turnstile:tok})})
      .then(function(x){return x.json().catch(function(){return {}}).then(function(j){if(!x.ok||!j.ok)throw new Error(j.error||x.status);return j})})
      .then(function(j){
        form.hidden=true;$('fb-gh').hidden=true;var th=$('fb-thanks');th.hidden=false;
        if(j.url&&/^https:\/\/github\.com\//.test(j.url)){var a=$('fb-issue');a.href=j.url;a.hidden=false}
        th.focus();
      })
      .catch(function(){fail('That didn’t go through. You can try again, or open an issue on GitHub instead.')})
      .then(function(){clearTimeout(t)});
    });
  })();
  detect();load();
})();
