/* STUDY SPACE - each "service" is a separate module. Today they use localStorage.
   To go real, replace each function body with fetch() calls to /api/... routes. */
const DB={get(k,d){try{return JSON.parse(localStorage.getItem('ss_'+k))??d}catch{return d}},set(k,v){try{localStorage.setItem('ss_'+k,JSON.stringify(v))}catch{alert('Storage is full. Try smaller attachments.')}}};
const uid=()=>Math.random().toString(36).slice(2,10);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* --- User Service (Google, email, NVSU uConnect) --- */
const UserService={
 all:()=>DB.get('users',[]),
 me:()=>UserService.all().find(u=>u.id===DB.get('session')),
 register({name,email,password,role}){
  if(!name||!email||password.length<6)return{error:'Enter your name, a valid email, and a password of 6+ characters.'};
  if(UserService.all().some(u=>u.email===email))return{error:'That email already has an account. Log in instead.'};
  const u={id:uid(),name,email,password,role,via:'email'};DB.set('users',[...UserService.all(),u]);DB.set('session',u.id);return{u}},
 login(email,password){const u=UserService.all().find(u=>u.email===email&&u.password===password);
  if(!u)return{error:'Email or password is incorrect.'};DB.set('session',u.id);return{u}},
 sso(via,name,email,role){let u=UserService.all().find(u=>u.email===email);
  if(!u){u={id:uid(),name,email,role,via};DB.set('users',[...UserService.all(),u])}DB.set('session',u.id);return u},
 logout:()=>DB.set('session',null)
};

/* --- Task & Activity Service --- */
const TYPES={quiz:{l:'Quiz',pl:'Quizzes',c:'#b388ff'},assignment:{l:'Assignment',pl:'Assignments',c:'#4dc9ff'},activity:{l:'Activity',pl:'Activities',c:'#ffd84a'},personal:{l:'Personal',pl:'Personal',c:'#3ee6a8'}};
const TaskService={
 all:()=>DB.get('tasks',[]),
 forUser:u=>TaskService.all().filter(t=>u.role==='instructor'?t.owner===u.id:(t.type!=='personal'||t.owner===u.id)),
 sorted:l=>[...l].sort((a,b)=>new Date(a.due)-new Date(b.due)),
 save(t){const l=TaskService.all();const i=l.findIndex(x=>x.id===t.id);i>=0?l[i]=t:l.push(t);DB.set('tasks',l)},
 remove(id){DB.set('tasks',TaskService.all().filter(t=>t.id!==id))}
};

/* --- Submission Service --- */
const SubmissionService={
 all:()=>DB.get('subs',{}),
 get:(tid,sid)=>SubmissionService.all()[tid+':'+sid],
 set(tid,sid,v){const s=SubmissionService.all();v?s[tid+':'+sid]=v:delete s[tid+':'+sid];DB.set('subs',s)},
 isDone:(tid,sid)=>!!SubmissionService.get(tid,sid)
};

/* --- Progress & Reward Service (3 tasks per level + rank tiers) --- */
const PETS={plant:['🌰','🌱','🌿','🪴','🌳'],pet:['🥚','🦎','🐊','🐲','🐉']};
const MAXLV=5;
const TIERS=['Codex Master','Wizard','Architect','Hacker'];
const RANKS={'Newbie':{i:'⌨️',c:'#9a97c9'},'Coder':{i:'💻',c:'#3ee6a8'},'Hacker':{i:'🕹️',c:'#b388ff'},'Architect':{i:'🧱',c:'#ff8a5c'},'Wizard':{i:'🧙',c:'#ffd84a'},'Codex Master':{i:'👾',c:'#4dc9ff'}};
const RewardService={
 doneList(sid,assignedOnly){const T=Object.fromEntries(TaskService.all().map(t=>[t.id,t]));
  return Object.entries(SubmissionService.all()).filter(([k])=>k.endsWith(':'+sid)).map(([k,v])=>[T[k.split(':')[0]],v]).filter(([t])=>t&&(!assignedOnly||t.type!=='personal'))},
 done:sid=>RewardService.doneList(sid).length,
 level:n=>Math.min(MAXLV,Math.floor(n/3)+1),
 toNext:n=>n>=(MAXLV-1)*3?0:3-(n%3),
 choice:sid=>DB.get('pet_'+sid,'plant'),setChoice:(sid,c)=>DB.set('pet_'+sid,c),
 ranks(){
  const rows=DashboardService.students().map(s=>{const l=RewardService.doneList(s.id,true);return{s,n:l.length,last:Math.max(0,...l.map(([,v])=>v.at))}})
   .sort((a,b)=>b.n-a.n||a.last-b.last);
  let p=0;
  rows.forEach(r=>{if(r.n===0)r.rank='Newbie';else{r.rank=TIERS[Math.floor(p/3)]||'Coder';p++}});return rows},
 rankOf:sid=>RewardService.ranks().find(r=>r.s.id===sid)
};
const badge=r=>`<span class="rank" style="--r:${RANKS[r].c}">${RANKS[r].i} ${r}</span>`;

/* --- Notification Service (notification bar + history) --- */
const NotificationService={
 log:sid=>DB.get('notes_'+sid,[]),
 beep(){try{const c=new(window.AudioContext||window.webkitAudioContext)();[0,.22,.44].forEach(t=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.value=.08;o.connect(g);g.connect(c.destination);o.start(c.currentTime+t);o.stop(c.currentTime+t+.12)})}catch{}},
 active(u){return TaskService.sorted(TaskService.forUser(u).filter(t=>!SubmissionService.isDone(t.id,u.id)&&new Date(t.due)-Date.now()<=864e5))},
 tick(u){
  if(u.role!=='student')return;
  const seen=DB.get('fired_'+u.id,{}),log=NotificationService.log(u.id);let fired=false;
  TaskService.forUser(u).filter(t=>!SubmissionService.isDone(t.id,u.id)).forEach(t=>{
   const ms=new Date(t.due)-Date.now();
   [['before',ms<=864e5&&ms>0,'Due within 24 hours'],['due',ms<=0&&ms>-36e5,'Deadline reached']].forEach(([k,hit,msg])=>{
    const key=t.id+k;if(hit&&!seen[key]){seen[key]=1;fired=true;log.unshift({title:t.title,msg,at:Date.now(),k});
     try{if(Notification.permission==='granted')new Notification('Study Space: '+t.title,{body:msg})}catch{}}})});
  if(fired){DB.set('fired_'+u.id,seen);DB.set('notes_'+u.id,log.slice(0,40));S.barOff=false;NotificationService.beep();render()}
 }
};
function barHTML(u){if(u.role!=='student'||S.barOff)return'';const a=NotificationService.active(u);if(!a.length)return'';
 const late=a.some(t=>new Date(t.due)<=Date.now());
 return`<div class="nbar ${late?'due':''}" role="alert"><b>⏰</b><span><b>${a.length} task${a.length>1?'s':''} need${a.length>1?'':'s'} attention:</b> ${esc(a[0].title)} (${rel(a[0].due)})${a.length>1?' and '+(a.length-1)+' more':''}</span><button onclick="S.barOff=true;render()" aria-label="Dismiss">✕</button></div>`}

/* --- Dashboard Service --- */
const DashboardService={
 student(u){const l=TaskService.forUser(u),p=l.filter(t=>!SubmissionService.isDone(t.id,u.id));
  return{done:l.length-p.length,pending:p.length,today:p.filter(t=>new Date(t.due).toDateString()===new Date().toDateString()).length,late:p.filter(t=>new Date(t.due)<Date.now()).length,next:TaskService.sorted(p).slice(0,3)}},
 students:()=>UserService.all().filter(u=>u.role==='student')
};

/* ===================== UI ===================== */
let S={view:'dashboard',last:null,filter:'all',hideDone:false,mode:'login',role:'student',err:'',barOff:false};
const fmt=d=>new Date(d).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function rel(d){const ms=new Date(d)-Date.now(),a=Math.abs(ms),m=Math.round(a/6e4),h=Math.round(a/36e5),dd=Math.round(a/864e5);const t=m<60?m+' min':h<48?h+' hr':dd+' days';return ms<0?'overdue by '+t:'due in '+t}
const urg=d=>{const ms=new Date(d)-Date.now();return ms<0?'late':ms<864e5?'soon':''};
const go=v=>{S.view=v;render()};

function render(){
 const u=UserService.me();
 if(!u){S.last=null;$('#root').innerHTML=loginView();return}
 const nav=u.role==='student'?[['dashboard','🏠','Home'],['tasks','📋','Tasks'],['garden','🌱','Garden'],['ranks','🏆','Ranks']]:[['dashboard','🏠','Home'],['tasks','📋','Tasks'],['monitor','📊','Progress'],['ranks','🏆','Ranks']];
 if(!nav.some(n=>n[0]===S.view))S.view='dashboard';
 const v={dashboard:u.role==='student'?studentHome:instructorHome,tasks:tasksView,garden:gardenView,monitor:monitorView,ranks:ranksView}[S.view](u);
 const enter=S.last!==S.view;S.last=S.view;
 const stu=u.role==='student',n=RewardService.done(u.id),me=stu&&RewardService.rankOf(u.id);
 const chips=stu?`<span class="chip2">⭐ Lv ${RewardService.level(n)}</span><span class="chip2">✅ ${n}</span>${badge(me?me.rank:'Newbie')}<button class="bell" onclick="showNotes()" aria-label="Reminders">🔔<em>${NotificationService.log(u.id).length}</em></button>`
  :`<span class="chip2">👩‍🏫 Instructor</span><span class="chip2">📝 ${TaskService.forUser(u).length} tasks</span>`;
 $('#root').innerHTML=`<div class="app"><aside><div class="brand">📚 Study Space</div>
  ${nav.map(x=>`<button class="nav ${S.view===x[0]?'on':''}" onclick="go('${x[0]}')">${x[1]} ${x[2]}</button>`).join('')}
  <div class="who"><b>${esc(u.name)}</b><br>${stu?'Student':'Instructor'}<br><button class="btn ghost sm" style="margin-top:.6rem" onclick="logout()">Log out</button></div></aside>
  <div class="col"><header class="topbar"><div class="tt">${nav.find(x=>x[0]===S.view)[2]}</div><div class="chips">${chips}</div></header>
  <main class="${enter?'enter':''}">${barHTML(u)}${v}</main></div></div>`}
const bellBtn=u=>'';

/* ---- Login ---- */
function loginView(){const reg=S.mode==='register';
 return`<div class="login"><div class="card"><h1>📚 Study Space</h1><p style="color:var(--mute);margin:.8rem 0 0">Know what's due next. Level up while you do it.</p>
 <div class="seg"><button class="tab ${S.role==='student'?'on':''}" onclick="S.role='student';render()">Student</button><button class="tab ${S.role==='instructor'?'on':''}" onclick="S.role='instructor';render()">Instructor</button></div>
 <div class="sso" style="margin-top:.8rem"><button class="btn ghost" onclick="ssoLogin('google')">Continue with Google</button><button class="btn ghost" onclick="ssoLogin('uconnect')">Continue with NVSU uConnect</button></div><div class="or">or use email</div>
 ${reg?`<label for="nm">Full name</label><input id="nm" autocomplete="name">`:''}
 <label for="em">Email</label><input id="em" type="email" autocomplete="email"><label for="pw">Password</label><input id="pw" type="password" autocomplete="${reg?'new':'current'}-password">
 <div class="err">${esc(S.err)}</div>
 <button class="btn" style="width:100%" onclick="${reg?'doRegister()':'doLogin()'}">${reg?'Create account':'Log in'}</button>
 <p style="text-align:center;margin:1rem 0 0"><button class="tab" onclick="S.mode='${reg?'login':'register'}';S.err='';render()">${reg?'I have an account':'Create account'}</button> <button class="tab" onclick="loadDemo()">Try demo</button></p></div></div>`}
function doLogin(){const r=UserService.login($('#em').value.trim(),$('#pw').value);r.error?(S.err=r.error,render()):afterLogin()}
function doRegister(){const r=UserService.register({name:$('#nm').value.trim(),email:$('#em').value.trim(),password:$('#pw').value,role:S.role});r.error?(S.err=r.error,render()):afterLogin()}
function ssoLogin(via){const label=via==='google'?'Google':'NVSU uConnect';
 const name=prompt(`Demo ${label} sign-in. Your name:`);if(!name)return;const email=prompt(`Your ${label} email:`);if(!email)return;
 UserService.sso(via,name,email.trim(),S.role);afterLogin()}
function afterLogin(){S.err='';S.view='dashboard';S.last=null;try{Notification.requestPermission()}catch{}render();NotificationService.tick(UserService.me())}
function logout(){UserService.logout();render()}

/* ---- Student home ---- */
function studentHome(u){const s=DashboardService.student(u),n=RewardService.done(u.id),lv=RewardService.level(n),c=RewardService.choice(u.id),nx=RewardService.toNext(n),rk=(RewardService.rankOf(u.id)||{}).rank||'Newbie';
 return`<div class="hero"><div class="emblem" style="--r:${RANKS[rk].c}"><span>${RANKS[rk].i}</span></div>
 <div class="hinfo"><small>Welcome back</small><h2>${esc(u.name)}</h2>${badge(rk)}
 <div class="xp"><div class="bar"><i style="width:${nx?Math.round((3-nx)/3*100):100}%"></i></div><small>Level ${lv} · ${nx?`${nx} task${nx>1?'s':''} to next level`:'Max level'}</small></div></div>
 <div class="pethero">${PETS[c][lv-1]}</div></div>
 <div class="grid g3"><div class="card stat"><i class="ico">📌</i><b>${s.pending}</b><span>To do</span></div><div class="card stat"><i class="ico">🔥</i><b style="color:var(--hot)">${s.late}</b><span>Overdue</span></div><div class="card stat"><i class="ico">🏅</i><b>${s.done}</b><span>Completed</span></div></div>
 <div class="grid g2" style="margin-top:1rem"><div class="card pet"><div class="big">${PETS[c][lv-1]}</div><div><h3>Your ${c==='plant'?'plant':'pet'}</h3><p style="margin:.5rem 0 .6rem;color:var(--mute)">${s.today?`${s.today} task${s.today>1?'s':''} due today.`:'Nothing due today.'}</p><button class="btn sm" onclick="go('garden')">Open garden</button></div></div>
 <div class="card"><h3 style="margin-bottom:.8rem">Leaderboard</h3><p style="color:var(--mute);margin:0 0 .6rem">Complete assigned tasks to climb the ranks.</p><button class="btn sm" onclick="go('ranks')">See ranks</button></div></div>
 <div class="card" style="margin-top:1rem"><h3 style="margin-bottom:.8rem">Up next</h3>${s.next.length?s.next.map(t=>`<div style="display:flex;justify-content:space-between;gap:.6rem;padding:.45rem 0;border-bottom:2px dashed var(--line)"><span><span class="chip" style="--c:${TYPES[t.type].c}">${TYPES[t.type].l}</span> ${esc(t.title)}</span><span class="due ${urg(t.due)}">${rel(t.due)}</span></div>`).join(''):'<div class="empty"><div class="e">🎉</div>Nothing pending.</div>'}</div>`}

/* ---- Instructor home ---- */
function instructorHome(u){const l=TaskService.forUser(u),sts=DashboardService.students(),up=TaskService.sorted(l.filter(t=>new Date(t.due)>Date.now())).slice(0,4);
 const comp=l.reduce((a,t)=>a+sts.filter(s=>SubmissionService.isDone(t.id,s.id)).length,0),tot=l.length*sts.length;
 return`<div class="top"><div><h2>Hello, ${esc(u.name.split(' ')[0])}</h2><p>Here's how your classes are doing.</p></div><button class="btn" onclick="taskDialog()">+ New task</button></div>
 <div class="grid g3"><div class="card stat"><i class="ico">📝</i><b>${l.length}</b><span>Tasks created</span></div><div class="card stat"><i class="ico">🧑‍🎓</i><b>${sts.length}</b><span>Students</span></div><div class="card stat"><i class="ico">📈</i><b>${tot?Math.round(comp/tot*100):0}%</b><span>Completion</span></div></div>
 <div class="card" style="margin-top:1rem"><h3 style="margin-bottom:.8rem">Coming up</h3>${up.length?up.map(t=>`<div style="display:flex;justify-content:space-between;padding:.45rem 0;border-bottom:2px dashed var(--line)"><span><span class="chip" style="--c:${TYPES[t.type].c}">${TYPES[t.type].l}</span> ${esc(t.title)}</span><span class="due">${fmt(t.due)}</span></div>`).join(''):'<div class="empty"><div class="e">📝</div>Create your first quiz or assignment.</div>'}</div>`}

/* ---- Tasks ---- */
function tasksView(u){const stu=u.role==='student';let l=TaskService.sorted(TaskService.forUser(u));
 if(S.filter!=='all')l=l.filter(t=>t.type===S.filter);if(stu&&S.hideDone)l=l.filter(t=>!SubmissionService.isDone(t.id,u.id));
 const tabs=['all',...(stu?Object.keys(TYPES):['quiz','assignment','activity'])];
 return`<div class="top"><div><h2>${stu?'All tasks':'My tasks'}</h2><p>Sorted by nearest deadline.</p></div><button class="btn" onclick="taskDialog()">+ ${stu?'Personal task':'New task'}</button></div>
 <div class="tabs">${tabs.map(f=>`<button class="tab ${S.filter===f?'on':''}" onclick="S.filter='${f}';render()">${f==='all'?'All':TYPES[f].pl}</button>`).join('')}${stu?`<button class="tab ${S.hideDone?'on':''}" onclick="S.hideDone=!S.hideDone;render()">Hide completed</button>`:''}</div>
 ${l.length?l.map(t=>taskCard(t,u)).join(''):'<div class="card empty"><div class="e">📭</div>No tasks here yet.</div>'}`}
function taskCard(t,u){const stu=u.role==='student',sub=stu&&SubmissionService.get(t.id,u.id),own=t.owner===u.id,ty=TYPES[t.type];
 const sts=DashboardService.students(),dn=sts.filter(s=>SubmissionService.isDone(t.id,s.id)).length;let acts='';
 if(stu){acts=sub?`<span class="chip" style="--c:var(--ok)">${sub.kind==='submitted'?'Submitted':'Completed'}</span><button class="btn ghost sm" onclick="undo('${t.id}')">Undo</button>`
  :(t.type==='assignment'?`<button class="btn sm" onclick="submitDialog('${t.id}')">Submit</button><button class="btn ghost sm" onclick="complete('${t.id}')">Mark done</button>`:`<button class="btn sm" onclick="complete('${t.id}')">Mark done</button>`)}
 else acts=`<span class="meta">${dn}/${sts.length} done</span>`;
 if(own)acts+=`<button class="btn ghost sm" onclick="taskDialog('${t.id}')">Edit</button><button class="btn danger sm" onclick="removeTask('${t.id}')">Delete</button>`;
 const files=(t.files||[]).map(f=>f.data?`<a href="${f.data}" download="${esc(f.name)}">📎 ${esc(f.name)}</a>`:`<span>📎 ${esc(f.name)} (too large to store)</span>`).join('');
 return`<div class="card task ${sub?'done':''}" style="--c:${ty.c}"><div class="stripe"></div><div><h3>${esc(t.title)}</h3>
 <div class="meta"><span class="chip" style="--c:${ty.c}">${ty.l}</span>${t.course?`<span>${esc(t.course)}</span>`:''}<span class="due ${sub?'':urg(t.due)}">${sub?fmt(t.due):rel(t.due)+' · '+fmt(t.due)}</span></div>${t.desc?`<div class="meta">${esc(t.desc)}</div>`:''}
 ${files?`<div class="meta">${files}</div>`:''}${sub&&sub.note?`<div class="meta">Your note: ${esc(sub.note)}${sub.file?' · 📎 '+esc(sub.file):''}</div>`:''}</div><div class="acts">${acts}</div></div>`}

/* ---- Garden ---- */
function gardenView(u){const n=RewardService.done(u.id),c=RewardService.choice(u.id),lv=RewardService.level(n),nx=RewardService.toNext(n);
 return`<div class="top"><div><h2>Your garden</h2><p>Every 3 completed tasks = 1 level.</p></div></div>
 <div class="card pet" style="flex-direction:column;text-align:center;padding:2rem"><div class="big" style="font-size:7rem">${PETS[c][lv-1]}</div><h3>Level ${lv} / ${MAXLV}</h3>
 <div style="width:min(320px,100%)"><div class="bar"><i style="width:${nx?Math.round((3-nx)/3*100):100}%"></i></div><p style="margin:.5rem 0 0;color:var(--mute)">${nx?`${nx} more task${nx>1?'s':''} to level up`:'Fully grown!'} · ${n} done</p></div>
 <div class="stages">${PETS[c].map((e,i)=>`<span class="${i<lv?'got':''}">${e}</span>`).join('')}</div></div>
 <div class="card" style="margin-top:1rem"><h3 style="margin-bottom:.8rem">Choose what to grow</h3><div class="pick"><button class="${c==='plant'?'on':''}" onclick="pickPet('plant')">🌳 Plant</button><button class="${c==='pet'?'on':''}" onclick="pickPet('pet')">🐉 Dragon</button></div></div>`}
const pickPet=c=>{RewardService.setChoice(UserService.me().id,c);render()};

/* ---- Ranks ---- */
function ranksView(u){const rows=RewardService.ranks(),top=rows.length>=3?[1,0,2].map(i=>[rows[i],i+1]):[];
 return`<div class="top"><div><h2>Leaderboard</h2><p>Ranked by completed tasks. Ties go to whoever finished first.</p></div></div>
 ${top.length?`<div class="podium">${top.map(([r,p])=>`<div class="pd p${p}" style="--r:${RANKS[r.rank].c}"><div class="em">${RANKS[r.rank].i}</div><b>${esc(r.s.name)}</b><small>${r.n} done</small><div class="blk">${p}</div></div>`).join('')}</div>`:''}
 <div class="card">${rows.length?rows.map((r,i)=>`<div class="row ${r.s.id===u.id?'me':''}"><div class="pos">${i+1}</div><b>${esc(r.s.name)}</b><span class="meta cnt">${r.n} done</span>${badge(r.rank)}</div>`).join(''):'<div class="empty"><div class="e">🏆</div>No students yet.</div>'}</div>
 <div class="card" style="margin-top:1rem"><h3 style="margin-bottom:.8rem">How ranks work</h3><div class="meta" style="gap:.5rem">${TIERS.map((r,i)=>`${badge(r)} <span>#${i*3+1}–${i*3+3}</span>`).join('<br>')}<br>${badge('Coder')} <span>everyone else who completed a task</span><br>${badge('Newbie')} <span>no tasks completed yet</span></div></div>`}

/* ---- Instructor monitor ---- */
function monitorView(u){const l=TaskService.sorted(TaskService.forUser(u)),rk=RewardService.ranks();
 return`<div class="top"><div><h2>Student progress</h2><p>See who has finished each task.</p></div></div>
 ${!rk.length?'<div class="card empty"><div class="e">🧑‍🎓</div>No students yet.</div>':`
 <div class="card"><h3 style="margin-bottom:.8rem">By student</h3>${rk.map(({s,rank})=>{const d=l.filter(t=>SubmissionService.isDone(t.id,s.id)).length,p=l.length?Math.round(d/l.length*100):0;return`<div style="margin:.8rem 0"><div style="display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap"><b>${esc(s.name)}</b>${badge(rank)}<span class="meta">${d}/${l.length} · ${p}%</span></div><div class="bar" style="margin-top:.3rem"><i style="width:${p}%"></i></div></div>`}).join('')}</div>
 <div class="card table-wrap" style="margin-top:1rem"><h3 style="margin-bottom:.8rem">By task</h3><table><tr><th>Task</th><th>Due</th>${rk.map(r=>`<th>${esc(r.s.name.split(' ')[0])}</th>`).join('')}</tr>
 ${l.map(t=>`<tr><td>${esc(t.title)}</td><td>${fmt(t.due)}</td>${rk.map(({s})=>{const x=SubmissionService.get(t.id,s.id);return`<td>${x?(x.kind==='submitted'?'📎 Submitted':'✅ Done'):(new Date(t.due)<Date.now()?'⚠️ Missing':'⏳ Pending')}</td>`}).join('')}</tr>`).join('')}</table></div>`}`}

/* ---- Dialogs & actions ---- */
const dlg=()=>$('#dlg');
const toLocal=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,16)};
function taskDialog(id){const u=UserService.me(),stu=u.role==='student',t=id?TaskService.all().find(x=>x.id===id):{type:stu?'personal':'assignment',due:new Date(Date.now()+1728e5).toISOString()};
 dlg().innerHTML=`<h3>${id?'Edit':'New'} ${stu?'personal task':'task'}</h3>
 <label for="tt">Title</label><input id="tt" value="${esc(t.title||'')}">
 ${stu?'':`<label for="ty">Type</label><select id="ty">${['quiz','assignment','activity'].map(k=>`<option value="${k}" ${t.type===k?'selected':''}>${TYPES[k].l}</option>`).join('')}</select><label for="tc">Course</label><input id="tc" value="${esc(t.course||'')}" placeholder="e.g. Biology 101">`}
 <label for="td">Deadline</label><input id="td" type="datetime-local" value="${toLocal(t.due)}">
 <label for="tx">Details (optional)</label><textarea id="tx" rows="3">${esc(t.desc||'')}</textarea>
 ${stu?'':`<label for="tf">Attach files (optional, small files under 300 KB are downloadable)</label><input id="tf" type="file" multiple>${(t.files||[]).length?`<div class="meta">Already attached: ${t.files.map(f=>esc(f.name)).join(', ')}</div>`:''}`}
 <div class="err" id="derr"></div><div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.8rem"><button class="btn ghost" onclick="dlg().close()">Cancel</button><button class="btn" onclick="saveTask('${id||''}')">Save</button></div>`;dlg().showModal()}
const readFile=f=>new Promise(res=>{if(f.size>300*1024)return res({name:f.name,size:f.size});const r=new FileReader();r.onload=()=>res({name:f.name,size:f.size,data:r.result});r.onerror=()=>res({name:f.name,size:f.size});r.readAsDataURL(f)});
async function saveTask(id){const u=UserService.me(),stu=u.role==='student',title=$('#tt').value.trim(),due=$('#td').value;
 if(!title||!due){$('#derr').textContent='Add a title and a deadline.';return}
 const old=id?TaskService.all().find(x=>x.id===id):{},add=stu||!$('#tf')?[]:await Promise.all([...$('#tf').files].map(readFile));
 TaskService.save({...old,id:id||uid(),title,due:new Date(due).toISOString(),desc:$('#tx').value.trim(),owner:u.id,type:stu?'personal':$('#ty').value,course:stu?'':$('#tc').value.trim(),files:[...(old.files||[]),...add]});
 dlg().close();render();NotificationService.tick(u)}
function removeTask(id){if(confirm('Delete this task? This can\'t be undone.')){TaskService.remove(id);render()}}
function submitDialog(id){const t=TaskService.all().find(x=>x.id===id);
 dlg().innerHTML=`<h3>Submit: ${esc(t.title)}</h3><label for="sf">Attach your file</label><input id="sf" type="file"><label for="sn">Note to instructor (optional)</label><textarea id="sn" rows="3"></textarea>
 <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.8rem"><button class="btn ghost" onclick="dlg().close()">Cancel</button><button class="btn" onclick="submitWork('${id}')">Submit</button></div>`;dlg().showModal()}
function submitWork(id){const u=UserService.me(),f=$('#sf').files[0];
 SubmissionService.set(id,u.id,{kind:'submitted',at:Date.now(),note:$('#sn').value.trim(),file:f?f.name:''});dlg().close();celebrate(u)}
function complete(id){const u=UserService.me();SubmissionService.set(id,u.id,{kind:'done',at:Date.now()});celebrate(u)}
function undo(id){SubmissionService.set(id,UserService.me().id,null);render()}
function celebrate(u){const n=RewardService.done(u.id),up=n>0&&n%3===0&&n<=12;render();
 const el=document.createElement('div');el.className='toast';el.innerHTML=up?`<b>🎉 Level up!</b>Your ${RewardService.choice(u.id)==='pet'?'dragon':'plant'} reached level ${RewardService.level(n)}.`:'<b>✅ Task done</b>Keep the streak going.';$('#toasts').append(el);setTimeout(()=>el.remove(),4000)}
function showNotes(){const u=UserService.me(),l=NotificationService.log(u.id);
 dlg().innerHTML=`<h3>Reminders</h3>${l.length?l.map(n=>`<div style="padding:.5rem 0;border-bottom:2px dashed var(--line)"><b>${esc(n.title)}</b><div class="meta">${esc(n.msg)} · ${new Date(n.at).toLocaleString()}</div></div>`).join(''):'<div class="empty"><div class="e">🔕</div>No reminders yet. You get one 24 hours before a deadline and one when it arrives.</div>'}
 <div style="text-align:right;margin-top:.8rem"><button class="btn" onclick="dlg().close()">Close</button></div>`;dlg().showModal()}

/* ---- Demo data ---- */
function loadDemo(){
 const mk=(id,name,role)=>({id,name,email:id+'@demo.com',password:'demo123',role});
 const ins=mk('demo-i','Ms. Rivera','instructor'),stu=mk('demo-s','Alex Santos','student');
 const others=['Mia Cruz','Ben Lopez','Cara Reyes','Dan Uy','Ella Tan','Finn Go','Gia Lim','Hugo Sy'].map((n,i)=>mk('demo-o'+i,n,'student'));
 DB.set('users',[ins,stu,...others]);const h=36e5,n=Date.now();
 const T=[['d1','Cell Structure Quiz','quiz','Biology 101',5],['d2','Lab Report: Osmosis','assignment','Biology 101',30],['d3','Essay Outline','assignment','English 10',72],['d4','Group Presentation Practice','activity','English 10',120],['d5','Algebra Midterm','quiz','Math 9',-3],['d6','Reading Log','activity','English 10',200],['d7','Chemistry Quiz','quiz','Chem 11',-20]];
 DB.set('tasks',[...T.map(([id,title,type,course,hrs])=>({id,title,type,course,due:new Date(n+hrs*h).toISOString(),owner:ins.id,files:[]})),{id:'p1',title:'Review flashcards',type:'personal',due:new Date(n+20*h).toISOString(),owner:stu.id}]);
 const subs={'d5:demo-s':{kind:'done',at:n-5}};
 others.forEach((o,i)=>T.slice(0,Math.max(0,7-i)).forEach(([id],j)=>subs[id+':'+o.id]={kind:'done',at:n-(i*100+j)}));
 DB.set('subs',subs);DB.set('session',stu.id);DB.set('fired_demo-s',{});DB.set('notes_demo-s',[]);S.view='dashboard';S.last=null;render();NotificationService.tick(stu)}

render();
setInterval(()=>{const u=UserService.me();if(u)render(),NotificationService.tick(u)},30000);
if(UserService.me())NotificationService.tick(UserService.me());
