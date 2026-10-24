'use strict';
let entries=[], token=sessionStorage.getItem('dre_token')||'', user=null;
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n), esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), mobile=()=>matchMedia('(max-width:900px)').matches;
const formatHoursMinutes=m=>{if(m==null||isNaN(m))return'0h 00min';const total=Math.round(Number(m));const isNeg=total<0;const abs=Math.abs(total);const h=Math.floor(abs/60);const min=abs%60;return`${isNeg?'-':''}${h}h ${String(min).padStart(2,'0')}min`;};
// v2.8: apenas chave aleatoria + digest SHA-256 persistem durante a aba.
// Nenhum valor, contrato, descricao ou payload financeiro vai ao sessionStorage.
// A chave e vinculada ao token de sessao, operacao e digest do corpo.
const pendingFinancialRequests = new Map();
const IDEM_PREFIX28='dre_idem_v28_';
async function sha256hex28(message){
  const bytes=new TextEncoder().encode(message);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function clearPendingFinancial28(){
  pendingFinancialRequests.clear();
  for(let i=sessionStorage.length-1;i>=0;i--){
    const k=sessionStorage.key(i);if(k?.startsWith(IDEM_PREFIX28))sessionStorage.removeItem(k);
  }
}
async function api(url,options={}){
  const method=(options.method||'GET').toUpperCase();
  const guarded=method==='POST'&&(url==='/entries'||url==='/bills'||/\/bills\/[^/]+\/settle$/.test(url)||url==='/bank/match'||url==='/finance/close');
  let storageKey=null, idempotencyKey=null;
  if(guarded){
    // crypto.subtle requer contexto seguro (HTTPS ou localhost).
    if(!globalThis.crypto?.subtle||!globalThis.crypto?.randomUUID)throw new Error('Operacoes financeiras exigem HTTPS ou localhost para recuperacao segura.');
    const digest=await sha256hex28(token+'\n'+method+'\n'+url+'\n'+(options.body||''));
    storageKey=IDEM_PREFIX28+digest;
    idempotencyKey=sessionStorage.getItem(storageKey);
    if(!idempotencyKey){idempotencyKey='pwa_'+crypto.randomUUID().replace(/-/g,'');sessionStorage.setItem(storageKey,idempotencyKey);}
    pendingFinancialRequests.set(storageKey,idempotencyKey);
    options={...options,headers:{...(options.headers||{}),'Idempotency-Key':options.headers?.['Idempotency-Key']||idempotencyKey}};
  }
  let response;
  const apiBase = window.DRE_API_BASE || '';
  try {response=await fetch(apiBase+'/api'+url,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})}})}
  catch(error){throw new Error('Falha de conexao. Repita a mesma operacao com os mesmos dados, mesmo apos recarregar esta aba, para verificar o resultado.');}
  // Falhas 5xx/502/504 sao indeterminadas: preservar chave para reenvio seguro.
  if(!response.ok){
    if(storageKey&&response.status>=400&&response.status<500){sessionStorage.removeItem(storageKey);pendingFinancialRequests.delete(storageKey);}
    const j=await response.json().catch(()=>({}));if(response.status===401)showLogin();
    throw new Error(typeof j.detail==='string'?j.detail:'Falha na operacao');
  }
  if(storageKey){sessionStorage.removeItem(storageKey);pendingFinancialRequests.delete(storageKey);}
  return response.json();
}function showLogin(){token='';user=null;sessionStorage.removeItem('dre_token');clearPendingFinancial28();$('#login-layer').hidden=false;$('#workspace').hidden=true}
function canWrite(){return Boolean(user&&user.role!=='viewer')}
function updateMode(){const readonly=mobile()||user?.role==='viewer';document.querySelectorAll('.desktop-only').forEach(e=>e.style.display=readonly?'none':'');$('#mode').textContent=`${mobile()?'Mobile':'Desktop'} · ${readonly?'somente leitura':'gestão'}`;$('#office-label').textContent=user?user.office:'';}
function totals(filterMonth){const selMonth=filterMonth!==undefined?filterMonth:($('#painel-month')?.value||'');const list=selMonth?entries.filter(e=>e.data&&e.data.startsWith(selMonth)):entries;const sum=t=>list.filter(e=>e.tipo===t).reduce((a,e)=>a+Number(e.valor),0);const receita=sum('receita'),custo=sum('custo'),despesa=sum('despesa'),patrimonial=sum('patrimonial');return {receita,custo,despesa,patrimonial,resultado:receita-custo-despesa,margem:receita?(receita-custo-despesa)/receita*100:null,count:list.length,month:selMonth}}
function render(){updateMode();const t=totals();const selMonth=t.month;const mLabel=$('#painel-month-label'),mCount=$('#painel-month-count');if(mLabel&&mCount){if(selMonth){const [y,m]=selMonth.split('-');const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];const name=monthNames[parseInt(m,10)-1]||m;mLabel.textContent=`Mês de referência: ${name} de ${y}`;mCount.textContent=`Exibindo ${t.count} lançamento(s) de ${name}/${y}`;}else{mLabel.textContent='Todos os meses (Visão acumulada)';mCount.textContent=`Exibindo totais consolidados de todos os ${t.count} lançamentos`;}}const cards=[['Receitas',t.receita,selMonth?'Registradas no mês':'Valores registrados'],['Custos diretos',t.custo,selMonth?'Custos do mês':'Custos informados'],['Despesas',t.despesa,selMonth?'Despesas do mês':'Despesas operacionais'],['Resultado',t.resultado,selMonth?'Resultado do mês':'Resultado simplificado'],['Patrimônio',t.patrimonial,selMonth?'Movimentações do mês':'Movimentações Não-DRE']];$('#summary').innerHTML=cards.map(([l,v,m],i)=>`<article class="card"><div class="label">${l}</div><strong class="${i===3?(v>=0?'positive':'negative'):''}">${money(v)}</strong><div class="meta">${m}</div></article>`).join('');const max=Math.max(t.receita,t.custo,t.despesa,t.patrimonial,1);$('#bars').innerHTML=[['Receitas',t.receita,''],['Custos diretos',t.custo,'orange'],['Despesas',t.despesa,'red'],['Patrimônio',t.patrimonial,'purple']].map(([l,v,c])=>`<div class="barline"><span>${l}</span><div class="track"><div class="fill ${c}" style="width:${Math.max(0,v/max*100)}%"></div></div><strong style="text-align:right">${money(v)}</strong></div>`).join('');$('#highlights').innerHTML=`<p><strong>Resultado:</strong> ${money(t.resultado)}</p><p><strong>Margem indicativa:</strong> ${t.margem===null?'Não disponível':t.margem.toFixed(1).replace('.',',')+'%'}</p><p><strong>Patrimônio (Não-DRE):</strong> ${money(t.patrimonial)}</p><p><strong>Lançamentos no período:</strong> ${t.count}</p><div class="hint">Dados cadastrados sem conciliação contábil ou reconhecimento de competência.</div>`;$('#entries').innerHTML=entries.length?entries.slice().sort((a,b)=>b.data.localeCompare(a.data)).map(e=>`<tr data-record-id="${esc(e.id)}"><td>${esc(e.data.split('-').reverse().join('/'))}</td><td>${esc(e.descricao)}</td><td>${esc(e.area)}</td><td><span class="${e.tipo==='patrimonial'?'pill-custom':''}">${{receita:'Receita',custo:'Custo',despesa:'Despesa',patrimonial:'Patrimonial (Não-DRE)'}[e.tipo]||esc(e.tipo)}</span></td><td class="num">${money(e.valor)}</td><td class="desktop-only">${canWrite()?`<div style="display:flex;gap:6px;align-items:center;"><button type="button" class="btn-action edit" data-edit-entry="${esc(e.id)}" title="Editar lançamento" aria-label="Editar lançamento ${esc(e.descricao)}"><span>✏️</span> Editar</button><button type="button" class="btn-action delete" data-delete="${esc(e.id)}" title="Excluir lançamento" aria-label="Excluir lançamento ${esc(e.descricao)}"><span>🗑️</span> Excluir</button></div>`:''}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Nenhum lançamento neste escritório.</td></tr>';const dreRows=$('#dre-rows');if(dreRows){dreRows.innerHTML=[['Receita de honorários',t.receita],['(-) Custos diretos',-t.custo],['(=) Resultado bruto simplificado',t.receita-t.custo],['(-) Despesas operacionais',-t.despesa],['(=) Resultado gerencial simplificado',t.resultado],['(i) Movimentações Patrimoniais (Não-DRE)',t.patrimonial]].map(([k,v],i)=>`<tr ${i===4?'style="font-weight:800;background:#f0f6f8"':(i===5?'style="font-style:italic;color:#475569;background:#f8fafc"':'')}><td>${k}</td><td class="num">${money(v)}</td></tr>`).join('');}$('#diagnostics').innerHTML=`<p>Margem: <strong>${t.margem===null?'Não disponível':t.margem.toFixed(1).replace('.',',')+'%'}</strong></p><p>Custos / receita: <strong>${t.receita?(t.custo/t.receita*100).toFixed(1).replace('.',',')+'%':'Não disponível'}</strong></p><p>Despesas / receita: <strong>${t.receita?(t.despesa/t.receita*100).toFixed(1).replace('.',',')+'%':'Não disponível'}</strong></p><p>Não inclui contas a receber, tributos, repasses nem conciliação.</p>`}
function filterEntries(){
  const q=($('#entries-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
  const kind=$('#entries-kind')?.value||'';
  const month=$('#entries-month')?.value||'';
  const matched=entries.filter(e=>(!q||(String(e.descricao)+' '+String(e.area)).toLocaleLowerCase('pt-BR').includes(q))&&(!kind||e.tipo===kind)&&(!month||e.data.startsWith(month)));
  const ids=new Set(matched.map(e=>String(e.id)));
  const tbody=$('#entries');
  tbody.querySelectorAll('tr[data-record-id]').forEach(tr=>{tr.hidden=!ids.has(tr.dataset.recordId)});
  const total=entries.length;
  $('#entries-filter-count').textContent=`Exibindo ${matched.length} de ${total} lançamentos demonstrativos. Os totais gerais não são alterados pelos filtros.`;
  // A linha de ausência não deve competir com o estado de pesquisa sem correspondência.
  let empty=$('#entries-no-match');
  if(!empty){empty=document.createElement('tr');empty.id='entries-no-match';empty.innerHTML='<td colspan="6" class="empty">Nenhum lançamento corresponde aos filtros.</td>';tbody.append(empty)}
  empty.hidden=matched.length!==0||total===0;
}
for(const id of ['entries-search','entries-kind','entries-month'])document.getElementById(id).addEventListener('input',filterEntries);
$('#entries-clear').addEventListener('click',()=>{for(const id of ['entries-search','entries-kind','entries-month'])$('#'+id).value='';filterEntries()});
$('#painel-month')?.addEventListener('input',()=>render());
$('#painel-month')?.addEventListener('change',()=>render());
$('#painel-month-current')?.addEventListener('click',()=>{const pm=$('#painel-month');if(pm){pm.value=new Date().toISOString().slice(0,7);render();}});
$('#painel-month-clear')?.addEventListener('click',()=>{const pm=$('#painel-month');if(pm){pm.value='';render();}});

async function refresh(){entries=await api('/entries');render();filterEntries();if(typeof loadAreas==='function')await loadAreas();if(typeof refreshCompleteDRE==='function')await refreshCompleteDRE()}
const NATUREZAS_VIEWS = ['naturezas', 'nova-natureza', 'subcategorias', 'areas-juridicas'];
const CADASTROS_VIEWS = ['cadastros', 'cadastrar-cliente', 'novo-contrato'];
const DIAGNOSTICO_VIEWS = ['diagnostico', 'saude-funil', 'horas-custo', 'metas-orcamento', 'etapas-processuais'];
const USUARIOS_VIEWS = ['usuarios', 'acessos-equipe', 'auditoria-logs', 'seguranca-conta'];

function goto(view){
  if(view==='diagnostico') view='saude-funil';
  if(view==='usuarios') view='acessos-equipe';
  document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id===view));
  document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('active',e.dataset.view===view || (e.dataset.view==='diagnostico' && view==='saude-funil')));
  document.querySelectorAll('[data-view]').forEach(e=>{if(e.dataset.view===view || (e.dataset.view==='diagnostico' && view==='saude-funil'))e.setAttribute('aria-current','page');else e.removeAttribute('aria-current')});
  document.querySelectorAll('.ribbon-tab').forEach(t=>t.classList.toggle('active',t.dataset.ribbonTab===view || (t.dataset.ribbonTab==='lancamentos' && view==='movimentacoes') || (t.dataset.ribbonTab==='naturezas' && NATUREZAS_VIEWS.includes(view)) || (t.dataset.ribbonTab==='cadastros' && CADASTROS_VIEWS.includes(view)) || (t.dataset.ribbonTab==='diagnostico' && DIAGNOSTICO_VIEWS.includes(view)) || (t.dataset.ribbonTab==='usuarios' && USUARIOS_VIEWS.includes(view))));
  document.querySelectorAll('.ribbon-pane').forEach(p=>p.classList.toggle('active',p.dataset.ribbonPane===view || (p.dataset.ribbonPane==='lancamentos' && view==='movimentacoes') || (p.dataset.ribbonPane==='naturezas' && NATUREZAS_VIEWS.includes(view)) || (p.dataset.ribbonPane==='cadastros' && CADASTROS_VIEWS.includes(view)) || (p.dataset.ribbonPane==='diagnostico' && DIAGNOSTICO_VIEWS.includes(view)) || (p.dataset.ribbonPane==='usuarios' && USUARIOS_VIEWS.includes(view))));
  $('#page-title').textContent=({
    painel:'Visão geral',
    lancamentos:'Novo Lançamento',
    movimentacoes:'Movimentações Registradas',
    dre:'Demonstração de resultado',
    diagnostico:'Diagnóstico Executivo',
    'saude-funil':'Saúde do Atendimento & Funil',
    'horas-custo':'Horas, Custo & Rentabilidade',
    'metas-orcamento':'Metas & Planejamento Orçamentário',
    'etapas-processuais':'Inteligência por Etapa Processual',
    'acessos-equipe':'Gestão de Acessos & Equipe',
    'auditoria-logs':'Trilha de Auditoria & Compliance',
    'seguranca-conta':'Segurança da Conta & MFA',
    cadastros:'Base de Clientes e Contratos',
    'cadastrar-cliente':'Cadastrar Cliente',
    'novo-contrato':'Novo Contrato de Honorários',
    titulos:'Plano de contas e títulos',
    naturezas:'Catálogo de Naturezas',
    'nova-natureza':'Cadastrar Nova Natureza',
    subcategorias:'Subcategorias Gerenciais (Nível 3)',
    'areas-juridicas':'Áreas Jurídicas e Ramos do Direito'
  })[view]||'Visão geral';
  const pageBadge=$('#page-icon-badge');
  if(pageBadge){
    const ICONS_CONFIG={
      painel:{bg:'rgba(235,181,44,0.14)',color:'#d97706',border:'1px solid rgba(235,181,44,0.35)',shadow:'0 2px 6px rgba(235,181,44,0.18)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>'},
      lancamentos:{bg:'#dcfce7',color:'#16a34a',border:'1px solid #86efac',shadow:'0 2px 6px rgba(22,163,74,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'},
      movimentacoes:{bg:'#e0f2fe',color:'#0284c7',border:'1px solid #7dd3fc',shadow:'0 2px 6px rgba(2,132,199,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>'},
      dre:{bg:'#ffedd5',color:'#ea580c',border:'1px solid #fed7aa',shadow:'0 2px 6px rgba(234,88,12,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'},
      diagnostico:{bg:'rgba(235,181,44,0.18)',color:'var(--brand-navy,#010E38)',border:'1px solid var(--brand-gold,#EBB52C)',shadow:'0 2px 6px rgba(235,181,44,0.18)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'},
      'saude-funil':{bg:'#dcfce7',color:'#059669',border:'1px solid #86efac',shadow:'0 2px 6px rgba(5,150,105,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'},
      'horas-custo':{bg:'#e0f2fe',color:'#0284c7',border:'1px solid #7dd3fc',shadow:'0 2px 6px rgba(2,132,199,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><path d="M12 2v3"/><path d="M9 2h6"/></svg>'},
      'etapas-processuais':{bg:'#ede9fe',color:'#7c3aed',border:'1px solid #ddd6fe',shadow:'0 2px 6px rgba(124,58,237,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><polyline points="2 12 7 12 10 16 14 8 17 12 22 12"/></svg>'},
      'metas-orcamento':{bg:'#fef3c7',color:'#d97706',border:'1px solid #fde68a',shadow:'0 2px 6px rgba(217,119,6,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'},
      'acessos-equipe':{bg:'#ffedd5',color:'#ea580c',border:'1px solid #fed7aa',shadow:'0 2px 6px rgba(234,88,12,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'},
      'auditoria-logs':{bg:'#ede9fe',color:'#7c3aed',border:'1px solid #ddd6fe',shadow:'0 2px 6px rgba(124,58,237,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>'},
      'seguranca-conta':{bg:'#e0f2fe',color:'#0284c7',border:'1px solid #7dd3fc',shadow:'0 2px 6px rgba(2,132,199,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'},
      cadastros:{bg:'#e0f2fe',color:'#0284c7',border:'1px solid #7dd3fc',shadow:'0 2px 6px rgba(2,132,199,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'},
      'cadastrar-cliente':{bg:'#dcfce7',color:'#16a34a',border:'1px solid #86efac',shadow:'0 2px 6px rgba(22,163,74,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>'},
      'novo-contrato':{bg:'#fef3c7',color:'#d97706',border:'1px solid #fde68a',shadow:'0 2px 6px rgba(217,119,6,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'},
      titulos:{bg:'#e0f2fe',color:'#0284c7',border:'1px solid #7dd3fc',shadow:'0 2px 6px rgba(2,132,199,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'},
      naturezas:{bg:'#ede9fe',color:'#7c3aed',border:'1px solid #ddd6fe',shadow:'0 2px 6px rgba(124,58,237,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'},
      'nova-natureza':{bg:'#dcfce7',color:'#16a34a',border:'1px solid #86efac',shadow:'0 2px 6px rgba(22,163,74,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'},
      subcategorias:{bg:'#fef3c7',color:'#d97706',border:'1px solid #fde68a',shadow:'0 2px 6px rgba(217,119,6,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>'},
      'areas-juridicas':{bg:'#ede9fe',color:'#7c3aed',border:'1px solid #ddd6fe',shadow:'0 2px 6px rgba(124,58,237,0.15)',svg:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="m19 8-7-3-7 3"/><path d="M5 16l-3-7h6l-3 7a3 3 0 0 0 6 0"/><path d="M19 16l-3-7h6l-3 7a3 3 0 0 0 6 0"/><path d="M9 21h6"/></svg>'}
    };
    const cfg=ICONS_CONFIG[view]||ICONS_CONFIG.painel;
    pageBadge.style.background=cfg.bg;
    pageBadge.style.color=cfg.color;
    pageBadge.style.border=cfg.border;
    pageBadge.style.boxShadow=cfg.shadow;
    pageBadge.innerHTML=cfg.svg;
  }
  if(view==='dre'&&typeof refreshCompleteDRE==='function')refreshCompleteDRE();
  if(view==='movimentacoes'&&typeof filterEntries==='function')filterEntries();
  if(view==='nova-natureza'&&typeof updateNatureCodeSuggestion==='function')updateNatureCodeSuggestion();
  if(view==='subcategorias'&&typeof renderSubcategoriesTable==='function')renderSubcategoriesTable();
  if(view==='areas-juridicas'&&typeof renderAreasPageTable==='function')renderAreasPageTable();
  if(['diagnostico','saude-funil'].includes(view)&&typeof renderCommercialHealth==='function')renderCommercialHealth();
  if(view==='horas-custo'&&typeof refreshProductivity==='function')refreshProductivity();
  if(view==='etapas-processuais'&&typeof refreshStageIntelligence==='function')refreshStageIntelligence();
  if(view==='metas-orcamento'){if(typeof refreshManagement==='function')refreshManagement();if(typeof refreshPlanning==='function')refreshPlanning();}
  if(['acessos-equipe','auditoria-logs'].includes(view)&&typeof refreshGovernance==='function')refreshGovernance();
  window.scrollTo(0,0);
}
document.addEventListener('click',async ev=>{const rTab=ev.target.closest('.ribbon-tab');if(rTab&&rTab.dataset.ribbonTab){goto(rTab.dataset.ribbonTab==='diagnostico'?'saude-funil':rTab.dataset.ribbonTab);return;}const nav=ev.target.closest('[data-view], [data-goto]');if(nav)goto(nav.dataset.view||nav.dataset.goto);const del=ev.target.closest('[data-delete]');if(del&&canWrite()&&confirm('Excluir lançamento?')){try{await api('/entries/'+encodeURIComponent(del.dataset.delete),{method:'DELETE'});await refresh()}catch(err){alert(err.message)}}});
$('#r-painel-cur-month')?.addEventListener('click',()=>$('#painel-month-current')?.click());
$('#r-painel-all-months')?.addEventListener('click',()=>$('#painel-month-clear')?.click());
$('#r-lanc-new')?.addEventListener('click',()=>{goto('lancamentos');setTimeout(()=>$('#f-data')?.focus(),80);});
$('#r-lanc-entries')?.addEventListener('click',()=>{goto('movimentacoes');});
$('#r-lanc-extrato')?.addEventListener('click',()=>{goto('movimentacoes');});
function exportEntriesJSON(){
  if(!canWrite())return;
  const blob=new Blob([JSON.stringify({version:'0.2',entries},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;
  a.download='dre-juridico-export.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#r-dre-refresh')?.addEventListener('click',()=>$('#dre-complete-refresh')?.click());
$('#r-dre-print')?.addEventListener('click',()=>$('#dre-print-btn')?.click());
$('#r-dre-save')?.addEventListener('click',()=>$('#dre-save-btn')?.click());
$('#r-nat-new')?.addEventListener('click',()=>{goto('nova-natureza');updateNatureCodeSuggestion();setTimeout(()=>$('#nat-name')?.focus(),80);});
$('#r-sub-new')?.addEventListener('click',()=>{goto('subcategorias');setTimeout(()=>$('#sub-name')?.focus(),80);});
$('#r-area-new')?.addEventListener('click',()=>{goto('areas-juridicas');setTimeout(()=>$('#area-page-name')?.focus(),80);});
$('#r-cad-new-client')?.addEventListener('click',()=>{goto('cadastrar-cliente');setTimeout(()=>$('#customer-name')?.focus(),80);});
$('#r-cad-base')?.addEventListener('click',()=>{goto('cadastros');});
$('#r-cad-new-contract')?.addEventListener('click',()=>{goto('novo-contrato');setTimeout(()=>$('#contract-name')?.focus(),80);});
$('#r-cad-all-months')?.addEventListener('click',()=>$('#cadastros-clear-btn')?.click());
$('#r-diag-health')?.addEventListener('click',()=>{goto('saude-funil');});
$('#r-diag-hours')?.addEventListener('click',()=>{goto('horas-custo');});
// Dark Mode Theme Controller
function getSavedTheme(){
  return localStorage.getItem('dre_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function applyTheme(theme){
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  document.documentElement.setAttribute('data-theme', theme);
  const icon = $('#theme-icon');
  const label = $('#theme-label');
  const btn = $('#theme-toggle-btn');
  const mobileIcon = $('#mobile-theme-icon');
  if(mobileIcon) mobileIcon.textContent = isDark ? '☀️' : '🌙';
  if(icon) icon.textContent = isDark ? '☀️' : '🌙';
  if(label) label.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
  if(btn) btn.title = isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro';
  try { localStorage.setItem('dre_theme', theme); } catch(e){}
}
function toggleTheme(){
  const isDark = document.body.classList.contains('dark-mode');
  applyTheme(isDark ? 'light' : 'dark');
}
$('#theme-toggle-btn')?.addEventListener('click', toggleTheme);
$('#mobile-theme-toggle-btn')?.addEventListener('click', toggleTheme);
$('#mobile-logout-btn')?.addEventListener('click', async()=>{try{await api('/logout',{method:'POST'})}catch{}showLogin()});
applyTheme(getSavedTheme());

$('#r-diag-target')?.addEventListener('click',()=>{goto('metas-orcamento');});
$('#r-diag-stages')?.addEventListener('click',()=>{goto('etapas-processuais');});
$('#r-gov-users')?.addEventListener('click',()=>{goto('acessos-equipe');});
$('#r-user-access')?.addEventListener('click',()=>{goto('acessos-equipe');});
$('#r-user-audit')?.addEventListener('click',()=>{goto('auditoria-logs');});
$('#r-user-security')?.addEventListener('click',()=>{goto('seguranca-conta');});
$('#mobile-security-btn')?.addEventListener('click',()=>{goto('seguranca-conta');});
$('#r-gov-audit')?.addEventListener('click',()=>{goto('auditoria-logs');});
$('#entry-form').addEventListener('submit',async ev=>{ev.preventDefault();if(!canWrite())return;const valor=Number($('#f-valor').value);if(!(valor>0&&Number.isFinite(valor)))return;try{await api('/entries',{method:'POST',body:JSON.stringify({data:$('#f-data').value,descricao:$('#f-descricao').value.trim(),tipo:$('#f-tipo').value,area:$('#f-area').value,valor:valor.toFixed(2),nature_id:$('#f-nature')?.value||null,subcategory_id:$('#f-subcategory')?.value||null})});ev.target.reset();$('#f-data').value=new Date().toISOString().slice(0,10);if(typeof renderAreasSelect==='function')renderAreasSelect();$('#msg').innerHTML='Lançamento salvo com sucesso no servidor! <a href="javascript:void(0)" data-goto="movimentacoes" style="color:var(--brand-gold,#EBB52C);font-weight:700;text-decoration:underline;margin-left:8px;">Ver em Movimentações Registradas 📋</a>';await refresh()}catch(err){$('#msg').textContent=err.message}});
$('#reset')?.remove();$('#export')?.addEventListener('click', exportEntriesJSON);
$('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();$('#login-error').textContent='';try{const res=await api('/login',{method:'POST',body:JSON.stringify({email:$('#login-email').value,password:$('#login-password').value,otp:$('#login-otp').value||null})});token=res.token;sessionStorage.setItem('dre_token',token);await start()}catch(err){$('#login-error').textContent=err.message}});
$('#logout').addEventListener('click',async()=>{try{await api('/logout',{method:'POST'})}catch{}showLogin()});
async function start(){try{user=await api('/me');$('#login-layer').hidden=true;$('#workspace').hidden=false;$('#f-data').value=new Date().toISOString().slice(0,10);await refresh();if(typeof refreshFinance==='function')await refreshFinance();if(typeof loadAreas==='function')await loadAreas();if(typeof refreshNatures==='function')await refreshNatures();if(typeof refreshCompleteDRE==='function')await refreshCompleteDRE();if(typeof initCommercialHealth==='function')initCommercialHealth();if(typeof initStageIntelligence==='function')initStageIntelligence();}catch(err){console.error('start error:',err);if(!user)showLogin();}}
window.addEventListener('resize',()=>{if(user){render();filterEntries()}});if(token)start();else showLogin();

// v0.3: separate financial register. Old v0.2 DRE remains an explicitly simplified legacy view.
let customers=[],contracts=[],accounts=[],bills=[];
let billPage=0,bankRowsCache=[];
const billPerPage=()=>Number($('#bills-size')?.value||10);
function renderBills(){
 const q=($('#bills-search')?.value||'').trim().toLocaleLowerCase('pt-BR'),status=$('#bills-status')?.value||'';
 const filtered=bills.filter(b=>(!q||[b.description,b.account,b.competence,b.due_date].join(' ').toLocaleLowerCase('pt-BR').includes(q))&&(!status||(status==='open'?b.cents>b.settled_cents:b.cents<=b.settled_cents)));
 const pages=Math.max(1,Math.ceil(filtered.length/billPerPage()));billPage=Math.min(Math.max(0,billPage),pages-1);
 const chunk=filtered.slice(billPage*billPerPage(),(billPage+1)*billPerPage());
 $('#bills-list').innerHTML=chunk.map(b=>`<tr><td>${esc(b.due_date)}</td><td>${esc(b.description)}</td><td>${esc(b.account)}</td><td>${esc(b.competence)}</td><td>${money(b.cents/100)}</td><td>${money((b.cents-b.settled_cents)/100)}</td><td class="desktop-only">${canWrite()&&b.cents>b.settled_cents?`<button class="btn secondary" data-settle="${esc(b.id)}">Baixar</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7">Nenhum título corresponde aos filtros.</td></tr>';
 $('#bills-count').textContent=`${filtered.length} de ${bills.length} títulos · Página ${billPage+1} de ${pages}. Totais financeiros não são alterados por filtros.`;
 $('#bills-prev').disabled=billPage===0;$('#bills-next').disabled=billPage>=pages-1;
}
for(const id of ['bills-search','bills-status','bills-size'])$('#'+id).addEventListener('input',()=>{billPage=0;renderBills()});
$('#bills-prev').addEventListener('click',()=>{billPage--;renderBills()});$('#bills-next').addEventListener('click',()=>{billPage++;renderBills()});
$('#bills-clear').addEventListener('click',()=>{$('#bills-search').value='';$('#bills-status').value='';$('#bills-size').value='10';billPage=0;renderBills()});
function renderBankRows(){const q=($('#bank-search')?.value||'').trim().toLocaleLowerCase('pt-BR'),filter=$('#bank-filter')?.value||'';const filtered=bankRowsCache.filter(x=>(!q||[x.description,x.date].join(' ').toLocaleLowerCase('pt-BR').includes(q))&&(!filter||(filter==='matched'?!!x.matched_movement:!x.matched_movement)));$('#bank-rows').innerHTML=filtered.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.description||'—')}</td><td>${money(x.cents/100)}</td><td>${x.matched_movement?'Conciliado':'Pendente'}</td></tr>`).join('')||'<tr><td colspan="4">Nenhum movimento corresponde aos filtros.</td></tr>';$('#bank-count').textContent=`${filtered.length} de ${bankRowsCache.length} movimentos. Filtro aplicado apenas à visualização.`}
for(const id of ['bank-search','bank-filter'])$('#'+id).addEventListener('input',renderBankRows);

const opts=(items,label)=>items.map(x=>`<option value="${esc(x.id)}">${esc(label(x))}</option>`).join('');

const CONTRACT_SUBORIGINS = {
  marketing: [
    { value: 'google_ads', label: 'Google Ads (Pesquisa / Tráfego Pago)' },
    { value: 'meta_ads', label: 'Meta Ads (Instagram / Facebook)' },
    { value: 'site_seo', label: 'Site Institucional / Busca Orgânica (SEO)' },
    { value: 'redes_sociais', label: 'Redes Sociais / Conteúdo Digital' },
    { value: 'jusbrasil', label: 'Plataformas Jurídicas (Jusbrasil / Portais)' },
    { value: 'evento_palestra', label: 'Eventos / Webinars / Palestras' },
    { value: 'outros_mkt', label: 'Outro Canal de Marketing' }
  ],
  atendimento: [
    { value: 'indicacao_cliente', label: 'Indicação de Cliente da Banca' },
    { value: 'indicacao_parceiro', label: 'Indicação de Parceiro / Outro Advogado' },
    { value: 'balcao_espontaneo', label: 'Balcão / Procura Espontânea (Presencial/Tel)' },
    { value: 'carteira_antiga', label: 'Carteira Ativa / Demanda Recorrente' },
    { value: 'networking_socios', label: 'Relacionamento Direto / Networking dos Sócios' },
    { value: 'reativacao', label: 'Reativação de Ex-Cliente' },
    { value: 'outros_atendimento', label: 'Outro Canal de Atendimento' }
  ]
};

function updateContractSuborigins() {
  const origin = $('#contract-origin')?.value || 'atendimento';
  const subSelect = $('#contract-suborigin');
  if (!subSelect) return;
  const list = CONTRACT_SUBORIGINS[origin] || CONTRACT_SUBORIGINS.atendimento;
  const currentVal = subSelect.value;
  subSelect.innerHTML = list.map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('');
  if (list.some(s => s.value === currentVal)) {
    subSelect.value = currentVal;
  }
}

function getSuboriginLabel(origin, subVal) {
  if (!subVal) return '';
  const all = [...(CONTRACT_SUBORIGINS.marketing || []), ...(CONTRACT_SUBORIGINS.atendimento || [])];
  const found = all.find(s => s.value === subVal);
  return found ? found.label : subVal;
}

$('#contract-origin')?.addEventListener('change', updateContractSuborigins);

function formatPtDate(iso) {
  if (!iso) return '—';
  const s = iso.slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function renderCustomersAndContracts() {
  const filterMonth = ($('#cadastros-filter-month')?.value || '').trim();
  const q = ($('#cadastros-search')?.value || '').trim().toLowerCase();

  // Active pill
  const pill = $('#cadastros-active-period-pill');
  if (pill) {
    if (filterMonth) {
      const [y, m] = filterMonth.split('-');
      const monthsPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const mIdx = parseInt(m, 10) - 1;
      const mName = monthsPt[mIdx] || m;
      pill.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Competência: ${mName}/${y}</span>`;
      pill.style.background = '#e8eef6';
      pill.style.color = '#010E38';
    } else {
      pill.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Todos os meses (Visão consolidada)</span>`;
      pill.style.background = '#f1f5f9';
      pill.style.color = '#475569';
    }
  }

  // Filter contracts
  const filteredContracts = contracts.filter(c => {
    const sDate = c.signed_date || (c.created_at ? c.created_at.slice(0, 10) : '');
    const cMonth = sDate ? sDate.slice(0, 7) : '';
    const matchMonth = !filterMonth || cMonth === filterMonth;
    if (!matchMonth) return false;
    if (!q) return true;
    const txt = [c.label, c.fee_type, c.customer_name, c.origin, c.suborigin, getSuboriginLabel(c.origin, c.suborigin)].join(' ').toLowerCase();
    return txt.includes(q);
  });

  // Filter customers: registered in filterMonth OR having a contract in filterMonth (or all if no filterMonth)
  const filteredCustomers = customers.filter(cust => {
    const custDate = cust.created_at ? cust.created_at.slice(0, 10) : '';
    const custMonth = custDate ? custDate.slice(0, 7) : '';
    const custContracts = contracts.filter(c => c.customer_id === cust.id);
    const hasContractInMonth = filterMonth ? custContracts.some(c => {
      const d = c.signed_date || (c.created_at ? c.created_at.slice(0, 10) : '');
      return d.slice(0, 7) === filterMonth;
    }) : true;
    const createdInMonth = !filterMonth || custMonth === filterMonth;
    const matchMonth = createdInMonth || hasContractInMonth;
    if (!matchMonth) return false;
    if (!q) return true;
    const txt = [cust.name, ...custContracts.map(c => c.label)].join(' ').toLowerCase();
    return txt.includes(q);
  });

  // Update badges
  if ($('#customers-badge')) $('#customers-badge').textContent = `${filteredCustomers.length} cliente(s)`;
  if ($('#contracts-badge')) $('#contracts-badge').textContent = `${filteredContracts.length} contrato(s)`;

  // Metrics cards
  const mktCount = filteredContracts.filter(c => c.origin === 'marketing' || c.origin === 'mkt').length;
  const deskCount = filteredContracts.length - mktCount;
  const totalClosedVal = filteredContracts.reduce((sum, c) => sum + (c.contract_value || 0), 0);
  const ticketMedio = filteredContracts.length > 0 ? (totalClosedVal / filteredContracts.length) : 0;
  const metricsEl = $('#cadastros-metrics-cards');
  if (metricsEl) {
    metricsEl.innerHTML = `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Clientes no Período</div>
        <div style="font-size:22px;font-weight:800;color:#010E38;margin-top:2px;">${filteredCustomers.length}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">Cadastrados / ativos</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Contratos Assinados</div>
        <div style="font-size:22px;font-weight:800;color:#010E38;margin-top:2px;">${filteredContracts.length}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">Honorários vigentes</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">Vol. Fechado (Info)</span>
          <span style="font-size:9.5px;font-weight:700;background:#dcfce7;color:#15803d;padding:1px 5px;border-radius:8px;">Informativo</span>
        </div>
        <div style="font-size:20px;font-weight:800;color:#059669;margin-top:2px;">${money(totalClosedVal)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Ticket Médio: <strong>${money(ticketMedio)}</strong></div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">Marketing (G06)</div>
        <div style="font-size:22px;font-weight:800;color:#0369a1;margin-top:2px;">${mktCount}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Captação digital/anúncios</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="font-size:11px;font-weight:700;color:#925d00;text-transform:uppercase;letter-spacing:0.5px;">Atendimento Escritório</div>
        <div style="font-size:22px;font-weight:800;color:#925d00;margin-top:2px;">${deskCount}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Indicação / Balcão</div>
      </div>
    `;
  }

  // Render customers list
  const custEl = $('#customers-list');
  if (custEl) {
    if (filteredCustomers.length === 0) {
      custEl.innerHTML = '<p class="muted" style="padding:12px 0;">Nenhum cliente cadastrado para o período selecionado.</p>';
    } else {
      custEl.innerHTML = filteredCustomers.map(x => {
        const custContracts = contracts.filter(c => c.customer_id === x.id);
        const dt = x.created_at ? formatPtDate(x.created_at) : '20/10/2026';
        const contractsBadges = custContracts.length ? custContracts.map(c => 
          `<span style="background:#f1f5f9;color:#334155;font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid #e2e8f0;display:inline-flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${esc(c.label)}</span>`
        ).join(' ') : '<span style="color:#94a3b8;font-size:11px;">Nenhum contrato vinculado</span>';

        return `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding:10px 0;flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="color:#010E38;font-size:14px;display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#0284c7;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${esc(x.name)}</strong>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
              <span style="font-size:11px;color:#64748b;display:inline-flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Cadastro: <strong>${dt}</strong></span>
              <span style="color:#cbd5e1;">·</span>
              ${contractsBadges}
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Render contracts list
  const contEl = $('#contracts-list');
  if (contEl) {
    if (filteredContracts.length === 0) {
      contEl.innerHTML = '<p class="muted" style="padding:12px 0;">Nenhum contrato assinado para o período selecionado.</p>';
    } else {
      contEl.innerHTML = filteredContracts.map(x => {
        const isMkt = (x.origin === 'marketing' || x.origin === 'mkt');
        const badge = isMkt ? '<span style="background:#e8eef6;color:#010E38;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:700;">Marketing (G06)</span>' : '<span style="background:#fff8e6;color:#925d00;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:700;">Atendimento Escritório</span>';
        const subLabel = getSuboriginLabel(x.origin, x.suborigin);
        const subBadge = subLabel ? `<span style="background:#f1f5f9;color:#334155;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;" title="Suborigem do cliente">📍 ${esc(subLabel)}</span>` : '';
        const sDate = x.signed_date ? formatPtDate(x.signed_date) : (x.created_at ? formatPtDate(x.created_at) : '20/10/2026');
        const custName = x.customer_name || (customers.find(c => c.id === x.customer_id)?.name) || 'Cliente';
        const valBadge = (x.contract_value && x.contract_value > 0)
          ? `<span style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:700;" title="Valor do Contrato (Modo Informativo)">💰 ${money(x.contract_value)}</span>`
          : `<span style="background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0;font-size:10.5px;padding:2px 6px;border-radius:4px;" title="Sem valor contratual informado">💰 R$ 0,00</span>`;

        return `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding:10px 0;flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="color:#010E38;font-size:14px;display:block;">${esc(x.label)} <small style="color:#64748b;font-weight:normal;">(${esc(x.fee_type)})</small></strong>
            <div style="font-size:12px;color:#475569;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span>👤 <strong>${esc(custName)}</strong></span>
              <span style="color:#cbd5e1;">·</span>
              <span>✍️ Assinado em: <strong>${sDate}</strong></span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${valBadge}${subBadge}${badge}</div>
        </div>`;
      }).join('');
    }
  }
}

$('#cadastros-filter-month')?.addEventListener('change', renderCustomersAndContracts);
$('#cadastros-search')?.addEventListener('input', renderCustomersAndContracts);
$('#cadastros-clear-btn')?.addEventListener('click', () => {
  if ($('#cadastros-filter-month')) $('#cadastros-filter-month').value = '';
  if ($('#cadastros-search')) $('#cadastros-search').value = '';
  renderCustomersAndContracts();
});

async function refreshFinance(){if(!user)return;[customers,contracts,accounts,bills]=await Promise.all(['/customers','/contracts','/accounts','/bills'].map(api));
 updateContractSuborigins();
 renderCustomersAndContracts();
 $('#contract-customer').innerHTML=opts(customers,x=>x.name);$('#bill-contract').innerHTML='<option value="">Sem contrato</option>'+opts(contracts,x=>x.label);
 $('#bill-account').innerHTML=opts(accounts,x=>x.code+' · '+x.name);
 renderBills();
 const report=await api('/financial-report');$('#competence-report').innerHTML=Object.entries(report.competencias).map(([month,r])=>`<p><strong>${esc(month)}</strong> · Receitas ${money(r.receita||0)} · Custos ${money(r.custo||0)} · Despesas ${money(r.despesa||0)} · Resultado indicativo ${money(r.resultado_indicativo||0)}</p>`).join('')||'<p class="muted">Sem informações.</p>';
}
async function financeSubmit(form,endpoint,payload){try{await api(endpoint,{method:'POST',body:JSON.stringify(payload)});form.reset();updateContractSuborigins();if($('#customer-date'))$('#customer-date').value=new Date().toISOString().slice(0,10);if($('#contract-signed-date'))$('#contract-signed-date').value=new Date().toISOString().slice(0,10);$('#finance-message').textContent='Registro salvo.';await refreshFinance()}catch(e){$('#finance-message').textContent=e.message}}
$('#customer-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;const nameVal=$('#customer-name').value.trim();const dt=$('#customer-date')?.value||new Date().toISOString().slice(0,10);await financeSubmit(e.target,'/customers',{name:nameVal,date:dt});goto('novo-contrato');setTimeout(()=>{const sel=$('#contract-customer');if(sel){for(let i=0;i<sel.options.length;i++){if(sel.options[i].text.includes(nameVal)){sel.selectedIndex=i;break;}}}$('#contract-name')?.focus();},120);});
$('#contract-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!canWrite())return;
  const sDate=$('#contract-signed-date')?.value||null;
  const cVal=parseFloat($('#contract-value')?.value)||0;
  await financeSubmit(e.target,'/contracts',{
    customer_id:$('#contract-customer').value,
    label:$('#contract-name').value,
    fee_type:$('#contract-type').value,
    origin:$('#contract-origin')?.value||'atendimento',
    suborigin:$('#contract-suborigin')?.value||null,
    signed_date:sDate,
    contract_value:cVal
  });
  goto('cadastros');
});
$('#account-form')?.addEventListener('submit',e=>{e.preventDefault();if(canWrite())financeSubmit(e.target,'/accounts',{code:$('#account-code').value,name:$('#account-name').value,kind:$('#account-kind').value})});
$('#bill-form')?.addEventListener('submit',e=>{e.preventDefault();if(canWrite())financeSubmit(e.target,'/bills',{account_id:$('#bill-account').value,contract_id:$('#bill-contract').value||null,description:$('#bill-description').value,competence:$('#bill-competence').value,due_date:$('#bill-due').value,amount:$('#bill-amount').value,nature_id:$('#bill-nature')?.value||null,subcategory_id:$('#bill-subcategory')?.value||null})});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-settle]');if(!el||!canWrite())return;const bill=bills.find(x=>x.id===el.dataset.settle);if(!bill)return;const amount=prompt('Valor da baixa em reais (até '+((bill.cents-bill.settled_cents)/100).toFixed(2)+')');if(amount===null)return;const date=prompt('Data da baixa AAAA-MM-DD',new Date().toISOString().slice(0,10));if(date===null)return;const cleanAmount=String(amount).trim().replace(',','.');try{await api('/bills/'+encodeURIComponent(bill.id)+'/settle',{method:'POST',body:JSON.stringify({amount:cleanAmount,date})});await refreshFinance()}catch(err){$('#finance-message').textContent=err.message}});
const oldStart=start;start=async function(){await oldStart();if(user){$('#bill-competence').value=new Date().toISOString().slice(0,7);$('#bill-due').value=new Date().toISOString().slice(0,10);if($('#customer-date')&&!$('#customer-date').value)$('#customer-date').value=new Date().toISOString().slice(0,10);if($('#contract-signed-date')&&!$('#contract-signed-date').value)$('#contract-signed-date').value=new Date().toISOString().slice(0,10);if($('#cadastros-filter-month')&&!$('#cadastros-filter-month').value)$('#cadastros-filter-month').value=new Date().toISOString().slice(0,7);await refreshFinance()}};

// v0.4 read-only cash activity and internal settlement reconciliation.
async function refreshCash(){
  if(!user)return;
  try{
    const [report,check,movements]=await Promise.all(['/cash-report','/reconciliation','/cash-movements'].map(api));
    const el=document.querySelector('#cash-report');
    if(el)el.innerHTML=Object.entries(report.meses).map(([month,r])=>`<p><strong>${esc(month)}</strong> · Recebimentos: ${money(r.receita||0)} · Pagamentos: ${money((r.custo||0)+(r.despesa||0))} · Saldo: ${money(r.saldo_gerencial||0)}</p>`).join('')||'<p class="muted">Nenhum movimento novo registrado.</p>';
    const chk=document.querySelector('#reconciliation');
    if(chk)chk.textContent=`Conferência interna: ${check.titles_checked} títulos, ${check.mismatches.length} divergências. ${check.scope} ${report.aviso}`;
    const log=document.querySelector('#cash-movements');
    if(log)log.innerHTML=movements.map(m=>`<tr><td>${esc(m.date)}</td><td>${esc(m.description)}</td><td>${esc(m.kind)}</td><td>${money(m.cents/100)}</td></tr>`).join('')||'<tr><td colspan="4">Sem movimentações registradas.</td></tr>';
  }catch(e){const el=document.querySelector('#reconciliation');if(el)el.textContent='Falha ao consultar: '+e.message}
}
const prevRefreshFinance=refreshFinance;
refreshFinance=async function(){await prevRefreshFinance();await refreshCash()};

// v0.5 assisted statement reconciliation (server-validated, viewer read-only)
async function refreshBank(){if(!user)return;
 try{const [rows,suggestions,status]=await Promise.all(['/bank/rows','/bank/suggestions','/bank/status'].map(api));
 const suggested=new Map(suggestions.map(x=>[x.statement_id,x.movement_id]));
 bankRowsCache=rows;renderBankRows();
 $('#bank-suggestions').innerHTML=rows.filter(x=>suggested.has(x.id)).map(x=>`<p>${esc(x.date)} · ${money(x.cents/100)} ${canWrite()?`<button type="button" class="btn secondary" data-bank-match="${esc(x.id)}" data-movement-id="${esc(suggested.get(x.id))}">Aprovar</button>`:'<span>· Aguardando aprovação</span>'}</p>`).join('')||'<p class="muted">Sem sugestões de correspondência exata.</p>';
 $('#bank-status').innerHTML=status.months.map(x=>`<p>${esc(x.month)} · Extrato: ${x.statement_rows} · Conciliados: ${x.matched} · Pendentes: ${x.pending}</p>`).join('')+(status.closed.length?'<p><strong>Períodos fechados:</strong> '+status.closed.map(x=>esc(x.month)).join(', ')+'</p>':'');
 }catch(e){$('#bank-message').textContent=e.message;}}
$('#bank-form').addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;const f=$('#bank-file').files[0];if(!f)return;const body=new FormData();body.append('file',f);try{const r=await fetch('/api/bank/import',{method:'POST',headers:{Authorization:'Bearer '+token},body});const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Erro ao importar');$('#bank-message').textContent=`Importados: ${data.inserted}. Duplicados: ${data.duplicates_skipped}.`;await refreshBank();}catch(err){$('#bank-message').textContent=err.message;}});
document.addEventListener('click',async e=>{const t=e.target.closest('[data-bank-match]');if(!t||!canWrite())return;if(!confirm('Confirmar a correspondência deste movimento?'))return;try{await api('/bank/match',{method:'POST',body:JSON.stringify({statement_id:t.dataset.bankMatch,movement_id:t.dataset.movementId})});await refreshBank()}catch(err){$('#bank-message').textContent=err.message;}});
$('#close-form').addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;const month=$('#close-month').value;if(!confirm(`Fechar ${month}? O período ficará bloqueado para novas conciliações e baixas.`))return;try{await api('/finance/close',{method:'POST',body:JSON.stringify({month})});$('#bank-message').textContent='Mês fechado para novas conciliações e baixas.';await refreshBank()}catch(err){$('#bank-message').textContent=err.message;}});
const previousRefreshFinance=refreshFinance;refreshFinance=async function(){await previousRefreshFinance();await refreshBank();};

// v0.6: read-only integrated executive accounting estimates from bills only.
async function refreshExecutive(){if(!user)return;try{
 const execMonth=document.querySelector('#exec-month');
 const month=execMonth?execMonth.value:'';
 const data=await api('/executive'+(month?'?month='+encodeURIComponent(month):''));
 const selected=data.mes_selecionado, c=data.resumo_competencia||{},cash=data.resumo_caixa||{};
 const total=k=>money((c[k]||0)/100), cm=k=>money((cash[k]||0)/100);
 const cards=[['Receitas (indicativas)',total('receita_centavos')],['Custos diretos',total('custo_centavos')],['Despesas',total('despesa_centavos')],['Resultado indicativo',total('resultado_indicativo_centavos')]];
 const execCards=document.querySelector('#exec-cards');
 if(execCards) execCards.innerHTML=cards.map(([k,v])=>`<article class="card"><div class="label">${esc(k)}</div><strong>${v}</strong></article>`).join('');
 const execDre=document.querySelector('#exec-dre');
 if(execDre) execDre.innerHTML=`<p><strong>Competência:</strong> ${esc(selected||'sem dados')} · <strong>Margem indicativa:</strong> ${c.margem_indicativa_pct==null?'não disponível':esc(String(c.margem_indicativa_pct))+'%'}</p><p>Honorários condicionais segregados: <strong>${total('honorarios_condicionais_centavos')}</strong> · Contas transitórias: <strong>${total('transitoria_centavos')}</strong></p><h3>Caixa por data de baixa</h3><p>Entradas ${cm('entradas_centavos')} · Saídas ${cm('saidas_centavos')} · Movimento líquido ${cm('saldo_movimentacoes_centavos')}</p>`;
 const execOverview=document.querySelector('#exec-overview');
 if(execOverview) execOverview.innerHTML=`<p><strong>${esc(selected||'Sem período')}</strong> — Resultado por competência: ${total('resultado_indicativo_centavos')}; movimentação líquida de caixa: ${cm('saldo_movimentacoes_centavos')}.</p><p class="muted">Os dois números não devem ser somados. Lançamentos legados não estão integrados.</p>`;
 const execAlerts=document.querySelector('#exec-alerts');
 if(execAlerts) execAlerts.innerHTML=`<p>Honorários condicionais a revisar: ${data.alertas.filter(a=>a.tipo==='honorario_condicional').length}</p><p>Títulos com divergência no histórico de baixas: ${data.titulos_com_baixas_sem_historico}</p><p class="muted">${data.limites.map(esc).join(' · ')}</p>`;
 const execWarning=document.querySelector('#exec-warning');
 if(execWarning) execWarning.textContent=data.limites.join(' ');
 }catch(e){
  const execWarning=document.querySelector('#exec-warning');
  if(execWarning) execWarning.textContent=e.message;
 }}
document.querySelector('#exec-month')?.addEventListener('change',refreshExecutive);
const _refreshFinance06=refreshFinance;
refreshFinance=async function(){await _refreshFinance06();await refreshExecutive()};
const _start06=start;
start=async function(){await _start06();if(user)await refreshExecutive()};


// v0.7: grouped executive metrics with strategic goals and specialties.
async function refreshManagement(){if(!user)return;try{
 const monthInput=$('#manage-month');
 if(monthInput&&!monthInput.value) monthInput.value='2026-10';
 const month=monthInput?monthInput.value:'2026-10';
 if($('#plan-month')) $('#plan-month').value=month;
 const d=await api('/management'+(month?'?month='+encodeURIComponent(month):''));
 if(monthInput&&!monthInput.value&&d.mes_selecionado){monthInput.value=d.mes_selecionado;}
 const cur=d.comparativo.atual||{},old=d.comparativo.anterior||{};
 const cents=x=>money((x||0)/100);
 const percent=x=>x==null?'0,0%':Number(x).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
 
 const rev=cur.receita_centavos||0;
 const cost=(cur.custo_centavos||0)+(cur.despesa_centavos||0);
 const resultado=cur.resultado_centavos!=null?cur.resultado_centavos:(rev-cost);
 const marginPct=rev>0?((resultado/rev)*100):0;
 const goalCents=d.meta.receita_centavos;
 const atingPct=d.meta.atingimento_pct;
 const diffCents=d.meta.diferenca_centavos;
 
 $('#manage-totals').innerHTML=`
  <article class="card" style="border-left:4px solid var(--brand-gold,#EBB52C);background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Meta Fixada (Receita)</span>
      <span style="font-size:16px;">🎯</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${goalCents!=null?esc(cents(goalCents)):'Não Definida'}</strong>
    <div style="font-size:11px;color:#b45309;font-weight:600;margin-top:4px;">Planejamento estratégico mensal</div>
  </article>

  <article class="card" style="border-left:4px solid #0284c7;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Receita Realizada</span>
      <span style="font-size:16px;">💰</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${esc(cents(rev))}</strong>
    <div style="font-size:11px;color:#0284c7;font-weight:600;margin-top:4px;">Honorários faturados no período</div>
  </article>

  <article class="card" style="border-left:4px solid #16a34a;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">% Atingimento da Meta</span>
      <span style="font-size:16px;">🚀</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;">
      <strong style="font-size:22px;color:#16a34a;font-weight:900;">${percent(atingPct)}</strong>
      ${goalCents!=null?`<span class="pill" style="font-size:10px;font-weight:800;background:${atingPct>=100?'#dcfce7;color:#15803d':'#fef3c7;color:#b45309'};">${atingPct>=100?'Meta Superada':'Em Andamento'}</span>`:''}
    </div>
    <div style="font-size:11px;color:#15803d;font-weight:600;margin-top:4px;">${diffCents!=null?(diffCents>=0?'Superávit de +'+cents(diffCents):'Déficit de '+cents(diffCents)):'Sem meta cadastrada'}</div>
  </article>

  <article class="card" style="border-left:4px solid #8b5cf6;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Resultado Operacional</span>
      <span style="font-size:16px;">📈</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${esc(cents(resultado))}</strong>
    <div style="font-size:11px;color:#7c3aed;font-weight:600;margin-top:4px;">Margem operacional de ${percent(marginPct)}</div>
  </article>
 `;

 const varPct=d.comparativo.variacao_receita_pct;
 $('#manage-comparison').innerHTML=`
  <div style="background:linear-gradient(135deg,rgba(1,14,56,0.03) 0%,rgba(235,181,44,0.08) 100%);border:1px solid rgba(235,181,44,0.3);border-radius:12px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="font-size:24px;">📊</span>
      <div>
        <strong style="color:var(--brand-navy,#010E38);font-size:13.5px;display:block;">Comparativo de Performance Mês a Mês (MoM):</strong>
        <span style="font-size:12px;color:#475569;">
          Mês Atual (<strong>${esc(d.mes_selecionado||month)}</strong>): <strong>${cents(cur.receita_centavos)}</strong>
          &nbsp;·&nbsp;
          Mês Anterior (<strong>${esc(d.mes_anterior||'Sem dados')}</strong>): <strong>${cents(old.receita_centavos)}</strong>
        </span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="pill" style="font-size:12px;font-weight:800;background:${(varPct!=null&&varPct>=0)?'#dcfce7;color:#15803d':'#fee2e2;color:#b91c1c'};padding:6px 14px;border-radius:20px;border:1px solid ${(varPct!=null&&varPct>=0)?'#bbf7d0':'#fecaca'};">
        ${(varPct!=null&&varPct>=0)?'▲ +':'▼ '}${percent(varPct)} de variação de faturamento
      </span>
    </div>
  </div>
 `;

 const areas=Object.entries(d.areas_selecionadas||{});
 const areaIcons={
  'Trabalhista':'👷 Trabalhista',
  'Cível':'🏛️ Cível',
  'Tributário':'💼 Tributário',
  'Empresarial':'🏢 Empresarial',
  'Previdenciário':'👵 Previdenciário',
  'Família':'👨‍👩‍👧 Família',
  'Criminal':'⚖️ Criminal',
  'Administrativo':'🏛️ Administrativo'
 };

 $('#manage-areas').innerHTML=areas.length?`
  <div class="tablewrap" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;">
    <table style="width:100%;margin:0;border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;">Especialidade / Ramo</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Receitas Faturadas</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Custos Diretos</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Despesas Alocadas</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Resultado Parcial</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;min-width:140px;">Margem de Contribuição</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${areas.map(([name,v])=>{
          const revArea=v.receita_centavos||0;
          const resArea=v.resultado_parcial_centavos||0;
          const mArea=revArea>0?((resArea/revArea)*100):0;
          const statusBadge=mArea>=80?`<span class="pill" style="background:#dcfce7;color:#166534;font-size:10.5px;font-weight:700;">Alta Rentabilidade</span>`:
                            (mArea>=50?`<span class="pill" style="background:#e0f2fe;color:#0369a1;font-size:10.5px;font-weight:700;">Rentável</span>`:
                            `<span class="pill" style="background:#fef3c7;color:#b45309;font-size:10.5px;font-weight:700;">Atenção</span>`);
          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:var(--brand-navy,#010E38);">
                ${esc(areaIcons[name]||name)}
              </td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;text-align:right;color:#16a34a;">${esc(cents(v.receita_centavos))}</td>
              <td style="padding:10px 14px;font-size:12.5px;text-align:right;color:#dc2626;">${esc(cents(v.custo_centavos))}</td>
              <td style="padding:10px 14px;font-size:12.5px;text-align:right;color:#d97706;">${esc(cents(v.despesa_centavos))}</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:800;text-align:right;color:var(--brand-navy,#010E38);">${esc(cents(v.resultado_parcial_centavos))}</td>
              <td style="padding:10px 14px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;min-width:60px;">
                    <div style="width:${Math.max(0,Math.min(100,mArea))}%;height:100%;background:linear-gradient(90deg,var(--brand-gold,#EBB52C),#16a34a);border-radius:4px;"></div>
                  </div>
                  <strong style="font-size:12px;min-width:44px;text-align:right;color:#334155;">${percent(mArea)}</strong>
                </div>
              </td>
              <td style="padding:10px 14px;text-align:center;">${statusBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
 `:'<div style="background:#f8fafc;padding:20px;border-radius:10px;text-align:center;color:#64748b;font-size:13px;border:1px solid #e2e8f0;">Nenhum título atribuído a especialidades neste período. Utilize o formulário abaixo para classificar contratos da banca.</div>';

 $('#manage-specialty').innerHTML=d.especialidades.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
 $('#manage-contract').innerHTML=contracts.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}${d.classificacoes[c.id]?' · '+esc(d.classificacoes[c.id]):''}</option>`).join('');
 $('#manage-target-month').value||=d.mes_selecionado||month;
 $('#manage-status').textContent=`Classificação de integridade: ${cents(d.valores_segretados_total.sem_area_centavos)} sem área no acumulado geral. Honorários condicionais segregados: ${cents(d.valores_segretados_total.condicionais_centavos)}.`;
 }catch(e){$('#manage-status').textContent='Erro na gestão de metas: '+e.message;}}

$('#manage-month')?.addEventListener('change',()=>{
 if($('#plan-month')) $('#plan-month').value=$('#manage-month').value;
 refreshManagement();
 refreshPlanning();
});
$('#btn-meta-cur-month')?.addEventListener('click',()=>{
 if($('#manage-month')) $('#manage-month').value='2026-10';
 if($('#plan-month')) $('#plan-month').value='2026-10';
 refreshManagement();
 refreshPlanning();
});
$('#btn-meta-prev-month')?.addEventListener('click',()=>{
 if($('#manage-month')) $('#manage-month').value='2026-09';
 if($('#plan-month')) $('#plan-month').value='2026-09';
 refreshManagement();
 refreshPlanning();
});
$('#btn-meta-goto-target')?.addEventListener('click',()=>{
 $('#card-form-target')?.scrollIntoView({behavior:'smooth'});
 setTimeout(()=>$('#manage-target-value')?.focus(),300);
});
$('#manage-specialty-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;try{await api('/management/contracts/'+encodeURIComponent($('#manage-contract').value)+'/specialty',{method:'POST',body:JSON.stringify({specialty:$('#manage-specialty').value})});await refreshManagement();}catch(err){$('#manage-status').textContent=err.message;}});
$('#manage-target-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;try{await api('/management/targets',{method:'POST',body:JSON.stringify({month:$('#manage-target-month').value,revenue:$('#manage-target-value').value})});await refreshManagement();}catch(err){$('#manage-status').textContent=err.message;}});
const refreshFinance07=refreshFinance;
refreshFinance=async function(){await refreshFinance07();await refreshManagement()};
const start07=start;start=async function(){await start07();if(user)await refreshManagement()};

let lastProductivityData = null;
let currentProInModal = null;

// v0.8: operational entries only on desktop; viewer authorization enforced server-side.
async function refreshProductivity(){if(!user)return;try{
 if(!$('#prod-month').value) $('#prod-month').value='2026-10';
 const mval=$('#prod-month').value;
 const [d,pros]=await Promise.all([api('/productivity'+(mval?'?month='+encodeURIComponent(mval):'')),api('/productivity/professionals')]);
 lastProductivityData = d;
 const fmt=c=>money((c||0)/100),duration=formatHoursMinutes;
 const totalRev=d.contracts.reduce((sum,c)=>sum+(c.revenue_titles_cents||0),0);
 const avgMargin=totalRev>0?(((totalRev-d.totals.cost_hours_cents)/totalRev)*100).toFixed(1):null;

 $('#prod-summary').innerHTML=`
  <article class="card" style="border-left:4px solid #0284c7;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Tempo Total Alocado</span>
      <span style="font-size:16px;">⏱️</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${esc(duration(d.totals.minutes))}</strong>
    <div style="font-size:11px;color:#0284c7;font-weight:600;margin-top:4px;">Horas e minutos apontados</div>
  </article>

  <article class="card" style="border-left:4px solid #d97706;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Custo Teórico de Equipe</span>
      <span style="font-size:16px;">💰</span>
    </div>
    <strong style="font-size:22px;color:#d97706;font-weight:900;">${esc(fmt(d.totals.cost_hours_cents))}</strong>
    <div style="font-size:11px;color:#64748b;font-weight:600;margin-top:4px;">Valor-hora acumulado da equipe</div>
  </article>

  <article class="card" style="border-left:4px solid #16a34a;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Receita de Honorários</span>
      <span style="font-size:16px;">💳</span>
    </div>
    <strong style="font-size:22px;color:#16a34a;font-weight:900;">${esc(fmt(totalRev))}</strong>
    <div style="font-size:11px;color:#15803d;font-weight:600;margin-top:4px;">Contratos com horas e minutos no período</div>
  </article>

  <article class="card" style="border-left:4px solid var(--brand-gold,#EBB52C);background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Margem Média da Banca</span>
      <span style="font-size:16px;">📈</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${avgMargin!==null?esc(avgMargin)+'%':'N/D'}</strong>
    <div style="font-size:11px;color:#b45309;font-weight:600;margin-top:4px;">Margem bruta de contribuição</div>
  </article>
 `;

 $('#prod-contracts').innerHTML=d.contracts.length?`
  <div class="tablewrap" style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;text-align:left;">
          <th style="padding:10px 14px;color:var(--brand-navy,#010E38);font-weight:800;min-width:260px;">Contrato de Honorários</th>
          <th style="padding:10px 14px;color:var(--brand-navy,#010E38);font-weight:800;text-align:center;min-width:145px;white-space:nowrap;">Horas e Minutos Alocados</th>
          <th style="padding:10px 14px;color:var(--brand-navy,#010E38);font-weight:800;text-align:right;min-width:120px;white-space:nowrap;">Custo das Horas</th>
          <th style="padding:10px 14px;color:var(--brand-navy,#010E38);font-weight:800;text-align:right;min-width:130px;white-space:nowrap;">Receita Indicativa</th>
          <th style="padding:10px 14px;color:var(--brand-navy,#010E38);font-weight:800;text-align:center;min-width:110px;white-space:nowrap;">Margem Candidata</th>
          <th style="padding:10px 14px;color:var(--brand-navy,#010E38);font-weight:800;text-align:center;min-width:195px;white-space:nowrap;">Diagnóstico Operacional</th>
        </tr>
      </thead>
      <tbody>
        ${d.contracts.map((x,idx)=>{
          const margin=x.candidate_margin_pct;
          let marginBadge='<span class="pill" style="background:#f1f5f9;color:#64748b;font-weight:700;">ND</span>';
          if(margin!==null){
            if(margin>=50){
              marginBadge=`<span class="pill" style="background:#dcfce7;color:#15803d;font-weight:800;white-space:nowrap;">+${margin}%</span>`;
            } else if(margin>=20){
              marginBadge=`<span class="pill" style="background:#fef3c7;color:#b45309;font-weight:800;white-space:nowrap;">+${margin}%</span>`;
            } else {
              marginBadge=`<span class="pill" style="background:#fee2e2;color:#b91c1c;font-weight:800;white-space:nowrap;">${margin}%</span>`;
            }
          }
          const alertBadge=x.possible_double_counting 
            ? '<span class="diag-op-badge diag-op-warning" title="Atenção: Título de custo existente vinculado a este contrato. O custo das horas não deve ser somado à DRE para evitar duplicidade.">⚠️ Título de custo existente</span>'
            : '<span class="diag-op-badge diag-op-success" title="Operação saudável: Nenhum conflito ou duplicidade de custo direto identificado.">✓ Operação saudável</span>';
          const pros = x.professionals || [];
          const prosHtml = pros.length ? `
            <div class="contract-team-wrap">
              <span class="contract-team-label" title="Profissionais com horas e minutos apontados neste contrato">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--brand-gold,#EBB52C);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Envolvidos:
              </span>
              ${pros.map(p => {
                const match = (p.name || '').match(/^([^(]+)(?:\s*\(([^)]+)\))?/);
                const proName = match ? match[1].trim() : (p.name || 'Advogado');
                const proRole = match && match[2] ? match[2].trim() : '';
                return `
                  <span class="contract-pro-pill" title="${esc(p.name)} · ${esc(duration(p.minutes))} (${esc(fmt(p.cost_hours_cents))})">
                    <span class="pro-dot"></span>
                    <span class="pro-name">${esc(proName)}</span>
                    ${proRole ? `<span class="pro-role">${esc(proRole)}</span>` : ''}
                    <span class="pro-hours">${esc(duration(p.minutes))}</span>
                  </span>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="contract-team-wrap">
              <span style="font-size:11px;color:#94a3b8;font-style:italic;">Nenhum profissional apontado</span>
            </div>
          `;
          return `
            <tr style="border-bottom:1px solid rgba(148,163,184,0.15);">
              <td style="padding:12px;vertical-align:top;">
                <div style="display:flex;align-items:flex-start;gap:8px;">
                  <span style="font-size:16px;margin-top:2px;flex-shrink:0;">📄</span>
                  <div style="min-width:0;flex:1;">
                    <div class="prod-contract-title" style="font-weight:700;">${esc(x.label)}</div>
                    <span style="font-size:11px;color:#94a3b8;font-weight:500;">Contrato Fixo Mensal</span>
                    ${prosHtml}
                  </div>
                </div>
              </td>
              <td style="padding:12px;text-align:center;vertical-align:middle;white-space:nowrap;">
                <span class="pill" style="background:#e0f2fe;color:#0369a1;font-weight:700;font-size:12px;">${esc(duration(x.minutes))}</span>
              </td>
              <td style="padding:12px;text-align:right;font-weight:700;color:#d97706;vertical-align:middle;white-space:nowrap;">${esc(fmt(x.cost_hours_cents))}</td>
              <td style="padding:12px;text-align:right;font-weight:800;vertical-align:middle;white-space:nowrap;" class="prod-contract-title">${esc(fmt(x.revenue_titles_cents))}</td>
              <td style="padding:12px;text-align:center;vertical-align:middle;white-space:nowrap;">${marginBadge}</td>
              <td style="padding:12px 14px;text-align:center;vertical-align:middle;white-space:nowrap;">${alertBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
 `:'<p class="muted" style="padding:16px;text-align:center;">Sem horas e minutos registrados no período selecionado.</p>';

 if($('#prod-pros-total-badge')){
  $('#prod-pros-total-badge').textContent=`${pros.length} profissional(is) cadastrado(s)`;
 }

 const proHoursMap=new Map();
 (d.professionals||[]).forEach(dp=>proHoursMap.set(dp.professional_id,dp));

 const allProsRoster=pros.map(p=>{
  const logged=proHoursMap.get(p.id);
  return {
   professional_id:p.id,
   name:p.name,
   hourly_cost_cents:p.hourly_cost_cents,
   minutes:logged?logged.minutes:0,
   cost_hours_cents:logged?logged.cost_hours_cents:0,
   contracts:logged?logged.contracts:[]
  };
 });

 $('#prod-professionals').innerHTML=allProsRoster.length?`
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:14px;">
    ${allProsRoster.map(p=>{
      const pct=d.totals.minutes>0?((p.minutes/d.totals.minutes)*100).toFixed(0):0;
      const proContracts = p.contracts || [];
      const hasHours = p.minutes > 0;
      const hourlyRateFmt = fmt(p.hourly_cost_cents);
      return `
        <div class="prod-pro-card" style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#fff;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;background:rgba(235,181,44,0.15);border-radius:10px;font-size:16px;">⚖️</span>
                <div>
                  <strong class="prod-pro-title" style="font-size:13.5px;line-height:1.2;color:var(--brand-navy,#010E38);display:block;">${esc(p.name)}</strong>
                  <span style="font-size:11px;color:#64748b;font-weight:600;">Custo-hora: <strong style="color:#d97706;">${esc(hourlyRateFmt)}/h</strong></span>
                </div>
              </div>
              ${hasHours?`
                <span class="pill" style="font-size:10.5px;background:#fef3c7;color:#92400e;font-weight:700;">${pct}% das horas</span>
              `:`
                <span class="pill" style="font-size:10.5px;background:#f1f5f9;color:#64748b;font-weight:600;">Sem horas no mês</span>
              `}
            </div>

            ${hasHours?`
              <div style="margin:10px 0 6px;height:6px;background:rgba(148,163,184,0.2);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:var(--brand-gold,#EBB52C);border-radius:3px;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;">
                <span style="color:#64748b;">Tempo no mês: <strong class="prod-pro-title" style="color:#010E38;">${esc(duration(p.minutes))}</strong></span>
                <span style="color:#64748b;">Custo: <strong style="color:#d97706;">${esc(fmt(p.cost_hours_cents))}</strong></span>
              </div>
            `:`
              <div style="margin:8px 0;font-size:11.5px;color:#94a3b8;font-style:italic;">
                Nenhuma hora apontada na competência ${mval?`${mval.split('-')[1]}/${mval.split('-')[0]}`:'ativa'}.
              </div>
            `}
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9;gap:6px;">
            ${hasHours?`
              <button type="button" class="btn secondary btn-view-contracts" data-pro-id="${esc(p.professional_id)}" style="padding:4px 9px;font-size:11.5px;min-height:28px;border-radius:6px;color:#0284c7;border-color:#bae6fd;background:#f0f9ff;font-weight:700;cursor:pointer;" title="Ver contratos alocados">
                📁 ${proContracts.length} contrato(s) ↗
              </button>
            `:`
              <span style="font-size:11px;color:#94a3b8;font-weight:600;">Equipe Ativa</span>
            `}
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn secondary btn-edit-pro" data-pro-id="${esc(p.professional_id)}" data-pro-name="${esc(p.name)}" data-pro-cost="${(p.hourly_cost_cents/100).toFixed(2)}" style="padding:4px 10px;font-size:11.5px;min-height:28px;border-radius:6px;font-weight:700;color:var(--brand-navy,#010E38);cursor:pointer;" title="Editar nome e custo-hora deste profissional">
                ✏️ Editar
              </button>
              <button type="button" class="btn secondary btn-delete-pro" data-pro-id="${esc(p.professional_id)}" data-pro-name="${esc(p.name)}" style="padding:4px 9px;font-size:11.5px;min-height:28px;border-radius:6px;color:#dc2626;border-color:#fca5a5;cursor:pointer;" title="Excluir profissional da banca">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  </div>
 `:'<p class="muted" style="padding:16px;text-align:center;">Nenhum profissional cadastrado na banca ainda.</p>';

 $('#prod-pro').innerHTML=pros.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${fmt(p.hourly_cost_cents)}/h</option>`).join('');
 $('#prod-contract').innerHTML=contracts.map(p=>`<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
 if($('#ts-invite-pro')) $('#ts-invite-pro').innerHTML=pros.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if($('#prod-date')&&!$('#prod-date').value){
  const today=new Date().toISOString().split('T')[0];
  $('#prod-date').value=today;
 }
 $('#prod-status').textContent='';
 await refreshTimeStudioAdmin();
 await refreshRecentWorklogs();
 }catch(err){console.error('refreshProductivity error:',err);$('#prod-status').textContent='Erro no relatório: '+err.message;}}

// ==========================================
// Modal Interativo de Contratos do Profissional
// ==========================================
function renderProContractsModal(filterQuery = '') {
  if (!currentProInModal) return;
  const p = currentProInModal;
  const tbody = $('#pro-modal-table-body');
  const countBadge = $('#pro-modal-count-badge');
  const summaryEl = $('#pro-modal-summary');
  if (!tbody) return;

  const fmt = c => money((c || 0) / 100);
  const duration = formatHoursMinutes;

  let list = (p.contracts || []).slice();
  const q = (filterQuery || '').trim().toLowerCase();
  if (q) {
    list = list.filter(c => 
      (c.label || '').toLowerCase().includes(q) ||
      (c.customer || '').toLowerCase().includes(q) ||
      (c.fee_type || '').toLowerCase().includes(q)
    );
  }

  // Ordena por maior tempo dedicado
  list.sort((a, b) => b.minutes - a.minutes);

  if (countBadge) countBadge.textContent = `${list.length} de ${(p.contracts || []).length} contrato(s)`;
  if (summaryEl) {
    const totalMinutesFiltered = list.reduce((acc, c) => acc + (c.minutes || 0), 0);
    const totalCostFiltered = list.reduce((acc, c) => acc + (c.cost_hours_cents || 0), 0);
    summaryEl.innerHTML = `Horas e minutos no filtro: <strong>${duration(totalMinutesFiltered)}</strong> · Custo: <strong style="color:#d97706;">${fmt(totalCostFiltered)}</strong>`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#64748b;">Nenhum contrato encontrado${q ? ` para a busca "${esc(q)}"` : ' para este profissional no período'}.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const pct = p.minutes > 0 ? ((c.minutes / p.minutes) * 100).toFixed(1) : '0.0';
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 14px;">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <span style="font-size:16px;margin-top:2px;">📄</span>
            <div>
              <div style="font-weight:700;color:var(--brand-navy,#010E38);font-size:13.5px;line-height:1.25;">${esc(c.label)}</div>
              <div style="font-size:11.5px;color:#64748b;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${c.customer ? `<span>Cliente: <strong style="color:#334155;">${esc(c.customer)}</strong></span>` : ''}
                ${c.fee_type ? `<span class="pill" style="font-size:10px;padding:1px 6px;background:#f1f5f9;color:#475569;font-weight:600;">${esc(c.fee_type.toUpperCase())}</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td style="padding:12px 14px;text-align:center;">
          <span class="pill" style="background:#e0f2fe;color:#0369a1;font-weight:700;font-size:12px;">${esc(duration(c.minutes))}</span>
        </td>
        <td style="padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(100, Math.max(0, parseFloat(pct)))}%;background:var(--brand-gold,#EBB52C);border-radius:3px;"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:#010E38;min-width:38px;text-align:right;">${pct}%</span>
          </div>
        </td>
        <td style="padding:12px 14px;text-align:right;" class="num">
          <strong style="color:#d97706;font-size:13.5px;">${esc(fmt(c.cost_hours_cents))}</strong>
        </td>
      </tr>
    `;
  }).join('');
}

function openProContractsModal(proId) {
  if (!lastProductivityData) return;
  const p = (lastProductivityData.professionals || []).find(x => x.professional_id === proId);
  if (!p) return;
  currentProInModal = p;

  const fmt = c => money((c || 0) / 100);
  const duration = formatHoursMinutes;

  const modal = $('#pro-contracts-modal');
  if (!modal) return;

  const nameEl = $('#pro-modal-name');
  if (nameEl) nameEl.textContent = p.name;

  const periodEl = $('#pro-modal-period');
  if (periodEl) {
    const selMonth = $('#prod-month')?.value || 'Período Geral';
    periodEl.textContent = `Competência: ${selMonth}`;
  }

  const hoursEl = $('#pro-modal-hours');
  if (hoursEl) hoursEl.textContent = `Tempo Total: ${duration(p.minutes)}`;

  const costEl = $('#pro-modal-cost');
  if (costEl) costEl.textContent = `Custo Total: ${fmt(p.cost_hours_cents)}`;

  const searchInput = $('#pro-modal-search');
  if (searchInput) searchInput.value = '';

  renderProContractsModal('');
  modal.showModal();
}

function openProEditModal(proId, name, cost) {
  const modal = $('#pro-edit-modal');
  if (!modal) return;
  if ($('#edit-pro-id')) $('#edit-pro-id').value = proId;
  if ($('#edit-pro-name')) $('#edit-pro-name').value = name;
  if ($('#edit-pro-cost')) $('#edit-pro-cost').value = cost;
  const msg = $('#pro-edit-msg');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  modal.showModal();
}

async function handleDeleteProfessional(proId, name) {
  if (!confirm(`Deseja realmente excluir o profissional "${name}" da equipe?`)) return;
  try {
    await api('/productivity/professionals/' + proId, { method: 'DELETE' });
    $('#pro-edit-modal')?.close();
    await refreshProductivity();
    alert(`Profissional "${name}" excluído com sucesso.`);
  } catch (err) {
    alert('Não foi possível excluir o profissional: ' + err.message);
  }
}

// Event Delegation para cliques nos cards de profissionais
$('#prod-professionals')?.addEventListener('click', e => {
  const btnEdit = e.target.closest('.btn-edit-pro');
  if (btnEdit) {
    e.stopPropagation();
    openProEditModal(btnEdit.dataset.proId, btnEdit.dataset.proName, btnEdit.dataset.proCost);
    return;
  }
  const btnDelete = e.target.closest('.btn-delete-pro');
  if (btnDelete) {
    e.stopPropagation();
    handleDeleteProfessional(btnDelete.dataset.proId, btnDelete.dataset.proName);
    return;
  }
  const btnView = e.target.closest('.btn-view-contracts');
  if (btnView) {
    e.stopPropagation();
    openProContractsModal(btnView.dataset.proId);
    return;
  }
});

$('#pro-edit-close')?.addEventListener('click', () => {
  $('#pro-edit-modal')?.close();
});
$('#btn-pro-edit-cancel')?.addEventListener('click', () => {
  $('#pro-edit-modal')?.close();
});
$('#btn-pro-delete')?.addEventListener('click', () => {
  const proId = $('#edit-pro-id')?.value;
  const proName = $('#edit-pro-name')?.value || 'Profissional';
  if (proId) handleDeleteProfessional(proId, proName);
});

$('#pro-edit-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!canWrite()) return;
  const proId = $('#edit-pro-id')?.value;
  const name = $('#edit-pro-name')?.value.trim();
  const cost = $('#edit-pro-cost')?.value;
  const msg = $('#pro-edit-msg');
  try {
    await api('/productivity/professionals/' + proId, {
      method: 'PUT',
      body: JSON.stringify({ name: name, hourly_cost: cost })
    });
    $('#pro-edit-modal')?.close();
    await refreshProductivity();
  } catch (err) {
    if (msg) {
      msg.style.display = 'block';
      msg.style.background = '#fef2f2';
      msg.style.color = '#b91c1c';
      msg.style.border = '1px solid #fca5a5';
      msg.textContent = 'Erro ao atualizar: ' + err.message;
    }
  }
});

$('#btn-goto-add-pro')?.addEventListener('click', () => {
  const modal = $('#modal-cadastrar-profissional');
  if (modal) {
    const feedback = $('#prod-prof-feedback');
    if (feedback) feedback.style.display = 'none';
    $('#prod-prof-form')?.reset();
    modal.showModal();
    $('#prod-name')?.focus();
  }
});

$('#btn-close-modal-pro')?.addEventListener('click', () => {
  $('#modal-cadastrar-profissional')?.close();
});

$('#btn-cancel-modal-pro')?.addEventListener('click', () => {
  $('#modal-cadastrar-profissional')?.close();
});


$('#pro-modal-close')?.addEventListener('click', () => {
  $('#pro-contracts-modal')?.close();
});

$('#pro-modal-cancel')?.addEventListener('click', () => {
  $('#pro-contracts-modal')?.close();
});

$('#pro-modal-search')?.addEventListener('input', e => {
  renderProContractsModal(e.target.value);
});

// Time Studio Administrative Functions
async function refreshTimeStudioAdmin(){
 if(!user)return;
 try{
  // 1. Load Approvals
  const statusFilter=$('#ts-filter-status')?.value||'PENDING';
  const url='/timestudio/approvals'+(statusFilter?`?status=${encodeURIComponent(statusFilter)}`:'');
  const [approvals,invites]=await Promise.all([api(url),api('/timestudio/invites')]);

  const container=$('#ts-approvals-container');
  if(container){
   if(approvals.length===0){
    container.innerHTML='<div style="background:#f8fafc;padding:24px;border-radius:10px;text-align:center;color:#64748b;font-size:13px;border:1px solid #e2e8f0;">Nenhum apontamento com o status selecionado.</div>';
   }else{
    const fmt=c=>money((c||0)/100);
    const duration=formatHoursMinutes;
    container.innerHTML=`
     <div class="tablewrap" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;">
      <table style="width:100%;margin:0;border-collapse:collapse;">
       <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;">Profissional</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;">Data</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;">Contrato / Processo</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Horas & Minutos</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Custo Est.</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;">Descrição do Ato</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;">Status</th>
         <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;">Ações de Controle</th>
        </tr>
       </thead>
       <tbody>
        ${approvals.map(a=>{
         let badge='';
         if(a.status==='APPROVED') badge='<span class="pill" style="background:#dcfce7;color:#166534;font-size:10.5px;font-weight:700;">✓ Aprovado</span>';
         else if(a.status==='REJECTED') badge=`<span class="pill" style="background:#fee2e2;color:#b91c1c;font-size:10.5px;font-weight:700;" title="${esc(a.rejection_reason)}">✕ Rejeitado</span>`;
         else badge='<span class="pill" style="background:#fef3c7;color:#b45309;font-size:10.5px;font-weight:700;">⏳ Pendente</span>';

         return `
          <tr style="border-bottom:1px solid #f1f5f9;">
           <td style="padding:10px 14px;font-size:12.5px;font-weight:700;color:var(--brand-navy,#010E38);">${esc(a.professional_name)}</td>
           <td style="padding:10px 14px;font-size:12px;color:#475569;">${esc(a.work_date)}</td>
           <td style="padding:10px 14px;font-size:12.5px;color:var(--brand-navy,#010E38);font-weight:600;">${esc(a.contract_label)}</td>
           <td style="padding:10px 14px;font-size:12.5px;font-weight:700;text-align:right;color:#0284c7;">${esc(duration(a.minutes))}</td>
           <td style="padding:10px 14px;font-size:12.5px;font-weight:700;text-align:right;color:#d97706;">${esc(fmt(a.cost_cents))}</td>
           <td style="padding:10px 14px;font-size:12px;color:#334155;max-width:240px;line-height:1.3;">
            ${esc(a.description||'—')}
            ${a.status==='REJECTED'&&a.rejection_reason?`<div style="font-size:10.5px;color:#dc2626;margin-top:2px;"><strong>Motivo:</strong> ${esc(a.rejection_reason)}</div>`:''}
           </td>
           <td style="padding:10px 14px;text-align:center;">${badge}</td>
           <td style="padding:10px 14px;text-align:center;white-space:nowrap;">
            ${a.status==='PENDING'?`
             <button type="button" class="btn" data-ts-approve="${esc(a.id)}" style="padding:4px 10px;font-size:11px;min-height:28px;background:#16a34a;color:#fff;font-weight:700;border-radius:6px;cursor:pointer;">Aprovar ✓</button>
             <button type="button" class="btn secondary" data-ts-reject="${esc(a.id)}" style="padding:4px 10px;font-size:11px;min-height:28px;color:#dc2626;border-color:#fca5a5;border-radius:6px;cursor:pointer;margin-left:4px;">Rejeitar ✕</button>
            `:(a.status==='REJECTED'?`
             <button type="button" class="btn" data-ts-approve="${esc(a.id)}" style="padding:4px 10px;font-size:11px;min-height:28px;background:#16a34a;color:#fff;font-weight:700;border-radius:6px;cursor:pointer;">Reconsiderar & Aprovar</button>
            `:'<span style="font-size:11.5px;color:#16a34a;font-weight:600;">Consolidado em DRE</span>')}
           </td>
          </tr>
         `;
        }).join('')}
       </tbody>
      </table>
     </div>
    `;
   }
  }

  // 2. Load Invites
  const invitesContainer=$('#ts-invites-list-container');
  if(invitesContainer){
   if(invites.length===0){
    invitesContainer.innerHTML='<p class="muted" style="padding:16px;text-align:center;">Nenhum convite emitido ainda.</p>';
   }else{
    invitesContainer.innerHTML=invites.map(inv=>{
     let stBadge='';
     if(inv.status==='ATIVO') stBadge='<span class="pill" style="background:#dcfce7;color:#15803d;font-size:10px;">Ativo (48h)</span>';
     else if(inv.status==='USADO') stBadge='<span class="pill" style="background:#e0f2fe;color:#0369a1;font-size:10px;">Já Cadastrado</span>';
     else stBadge='<span class="pill" style="background:#fee2e2;color:#b91c1c;font-size:10px;">Expirado</span>';

     return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;">
       <div>
        <strong style="color:var(--brand-navy,#010E38);display:block;">${esc(inv.professional_name)}</strong>
        <span style="color:#64748b;font-size:11px;">${esc(inv.email)}</span>
       </div>
       <div>${stBadge}</div>
      </div>
     `;
    }).join('');
   }
  }
 }catch(err){
  console.warn('Erro ao atualizar Time Studio admin:',err);
 }
}

// Global click delegation for Approvals
document.addEventListener('click',async ev=>{
 const btnApprove=ev.target.closest('[data-ts-approve]');
 if(btnApprove&&canWrite()){
  const id=btnApprove.dataset.tsApprove;
  try{
   btnApprove.disabled=true;
   await api(`/timestudio/approvals/${encodeURIComponent(id)}/approve`,{method:'POST'});
   await refreshProductivity();
  }catch(ex){
   alert('Erro ao aprovar horas: '+ex.message);
  }finally{
   if(btnApprove)btnApprove.disabled=false;
  }
  return;
 }
 const btnReject=ev.target.closest('[data-ts-reject]');
 if(btnReject&&canWrite()){
  const id=btnReject.dataset.tsReject;
  const reason=prompt('Informe a justificativa da recusa deste apontamento:');
  if(!reason||!reason.trim()){
   alert('Justificativa obrigatória para rejeitar horas.');
   return;
  }
  try{
   btnReject.disabled=true;
   await api(`/timestudio/approvals/${encodeURIComponent(id)}/reject`,{
    method:'POST',
    body:JSON.stringify({reason:reason.trim()})
   });
   await refreshProductivity();
  }catch(ex){
   alert('Erro ao rejeitar horas: '+ex.message);
  }finally{
   if(btnReject)btnReject.disabled=false;
  }
  return;
 }
});

// Invite creation submission
$('#ts-invite-form')?.addEventListener('submit',async ev=>{
 ev.preventDefault();
 if(!canWrite())return;
 const profId=$('#ts-invite-pro').value;
 const email=$('#ts-invite-email').value.trim();
 if(!profId||!email)return;
 try{
  const res=await api('/timestudio/invites',{
   method:'POST',
   body:JSON.stringify({professional_id:profId,email:email})
  });
  const fullUrl=window.location.origin+res.invite_url;
  const resultBox=$('#ts-invite-result');
  const linkInput=$('#ts-invite-link-input');
  if(linkInput) linkInput.value=fullUrl;
  if(resultBox) resultBox.style.display='block';
  await refreshTimeStudioAdmin();
 }catch(err){
  alert('Erro ao gerar convite: '+err.message);
 }
});

$('#btn-ts-copy-link')?.addEventListener('click',()=>{
 const input=$('#ts-invite-link-input');
 if(input&&input.value){
  navigator.clipboard.writeText(input.value).then(()=>{
   alert('Link de convite do Time Studio copiado com sucesso!');
  }).catch(()=>{
   input.select();
   document.execCommand('copy');
   alert('Link copiado!');
  });
 }
});

$('#ts-filter-status')?.addEventListener('change',refreshTimeStudioAdmin);
$('#btn-refresh-approvals')?.addEventListener('click',refreshTimeStudioAdmin);

$('#prod-month').addEventListener('change',refreshProductivity);
$('#btn-prod-cur-month')?.addEventListener('click',()=>{if($('#prod-month')){$('#prod-month').value='2026-10';refreshProductivity();}});
$('#btn-prod-all-months')?.addEventListener('click',()=>{if($('#prod-month')){$('#prod-month').value='';refreshProductivity();}});
$('#btn-prod-goto-log')?.addEventListener('click',()=>{document.getElementById('prod-forms-container')?.scrollIntoView({behavior:'smooth'});$('#prod-minutes')?.focus();});
$('#prod-prof-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!canWrite()) return;
  const feedback = $('#prod-prof-feedback');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Cadastrando...'; }
  try {
    const name = $('#prod-name').value.trim();
    const cost = $('#prod-cost').value;
    await api('/productivity/professionals', {
      method: 'POST',
      body: JSON.stringify({ name: name, hourly_cost: cost })
    });
    e.target.reset();
    if (feedback) {
      feedback.style.display = 'block';
      feedback.innerHTML = `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;color:#166534;font-size:12px;margin-top:6px;">
          <strong>✅ Profissional Cadastrado com Sucesso!</strong><br>
          <strong>${esc(name)}</strong> agora integra a equipe (Custo-hora: R$ ${esc(Number(cost).toFixed(2))}/h).
        </div>
      `;
    }
    await refreshProductivity();
    setTimeout(() => {
      $('#modal-cadastrar-profissional')?.close();
      if (feedback) feedback.style.display = 'none';
    }, 850);
  } catch (err) {
    if (feedback) {
      feedback.style.display = 'block';
      feedback.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 12px;color:#b91c1c;font-size:12px;margin-top:6px;">
          <strong>Erro ao cadastrar profissional:</strong> ${esc(err.message)}
        </div>
      `;
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
  }
});
let recentLogsFilterMode = 'all';

async function refreshRecentWorklogs() {
  if (!user) return;
  const container = $('#prod-recent-worklogs-container');
  if (!container) return;
  try {
    const approvals = await api('/timestudio/approvals');
    const activeMonth = $('#prod-month')?.value || '';
    
    let list = (approvals || []).slice();
    if (recentLogsFilterMode === 'current' && activeMonth) {
      list = list.filter(a => a.work_date && a.work_date.startsWith(activeMonth));
    }
    
    if (list.length === 0) {
      const activeFmt = activeMonth ? `${activeMonth.split('-')[1]}/${activeMonth.split('-')[0]}` : '';
      container.innerHTML = `
        <div style="background:#f8fafc;padding:24px;border-radius:10px;text-align:center;color:#64748b;font-size:13px;border:1px solid #e2e8f0;">
          Nenhum apontamento de horas encontrado ${recentLogsFilterMode === 'current' && activeFmt ? `para a competência ativa (${activeFmt})` : ''}.
        </div>
      `;
      return;
    }

    const fmt = c => money((c || 0) / 100);
    const duration = formatHoursMinutes;

    container.innerHTML = `
      <div class="tablewrap" style="border:1px solid #e2e8f0;border-radius:10px;overflow-x:auto;background:#fff;">
        <table style="width:100%;margin:0;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:left;white-space:nowrap;min-width:95px;vertical-align:middle;">Data</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;white-space:nowrap;min-width:115px;vertical-align:middle;">Competência</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:left;min-width:180px;vertical-align:middle;">Advogado / Profissional</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:left;min-width:200px;vertical-align:middle;">Contrato Atendido</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;white-space:nowrap;min-width:95px;vertical-align:middle;">Tempo</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;white-space:nowrap;min-width:115px;vertical-align:middle;">Custo Calculado</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;white-space:nowrap;min-width:115px;vertical-align:middle;">Status</th>
              <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;white-space:nowrap;min-width:95px;vertical-align:middle;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(item => {
              const [y, m, d] = (item.work_date || '').split('-');
              const dateFormatted = y && m && d ? `${d}/${m}/${y}` : item.work_date;
              const comp = y && m ? `${m}/${y}` : '—';
              const isDiffFromActive = activeMonth && (y && m) && (`${y}-${m}` !== activeMonth);

              return `
                <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                  <td style="padding:10px 14px;font-weight:700;color:var(--brand-navy,#010E38);white-space:nowrap;vertical-align:middle;">
                    ${esc(dateFormatted)}
                  </td>
                  <td style="padding:10px 14px;text-align:center;white-space:nowrap;vertical-align:middle;">
                    <span class="worklog-comp-badge ${isDiffFromActive ? 'worklog-comp-diff' : 'worklog-comp-normal'}" title="${isDiffFromActive ? 'Atenção: Apontamento lançado com data em competência diferente do filtro ativo (' + esc(activeMonth) + ')' : 'Competência contábil ' + esc(comp)}">
                      ${isDiffFromActive ? '<span style="font-size:11px;line-height:1;" aria-hidden="true">⚠️</span>' : ''}
                      <span>${esc(comp)}</span>
                    </span>
                  </td>
                  <td style="padding:10px 14px;font-weight:700;color:var(--brand-navy,#010E38);vertical-align:middle;">
                    ${esc(item.professional_name)}
                  </td>
                  <td style="padding:10px 14px;color:#334155;font-weight:600;vertical-align:middle;">
                    ${esc(item.contract_label)}
                  </td>
                  <td style="padding:10px 14px;text-align:right;font-weight:800;color:#0284c7;white-space:nowrap;vertical-align:middle;">
                    ${esc(duration(item.minutes))}
                  </td>
                  <td style="padding:10px 14px;text-align:right;font-weight:800;color:#d97706;white-space:nowrap;vertical-align:middle;">
                    ${esc(fmt(item.cost_cents))}
                  </td>
                  <td style="padding:10px 14px;text-align:center;white-space:nowrap;vertical-align:middle;">
                    <span class="worklog-status-badge" title="Horas e custo computados e consolidados na DRE">
                      <span style="font-weight:900;font-size:11px;line-height:1;" aria-hidden="true">✓</span>
                      <span>Computado</span>
                    </span>
                  </td>
                  <td style="padding:10px 14px;text-align:center;white-space:nowrap;vertical-align:middle;">
                    <button type="button" class="btn secondary btn-delete-worklog" data-log-id="${esc(item.id)}" style="display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;padding:4px 9px;font-size:11px;font-weight:700;color:#dc2626;border-color:#fca5a5;border-radius:6px;cursor:pointer;background:#fff;" title="Excluir apontamento">
                      <span style="font-size:12px;line-height:1;">🗑️</span>
                      <span>Excluir</span>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.btn-delete-worklog').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.currentTarget.getAttribute('data-log-id');
        if (!confirm('Deseja realmente excluir este apontamento de horas? O custo e horas serão desvinculados do contrato.')) return;
        try {
          await api('/productivity/worklogs/' + id, { method: 'DELETE' });
          await refreshProductivity();
          await refreshRecentWorklogs();
        } catch (err) {
          alert('Erro ao excluir apontamento: ' + err.message);
        }
      });
    });

  } catch (err) {
    console.error('refreshRecentWorklogs error:', err);
    container.innerHTML = '<p class="muted" style="padding:16px;text-align:center;color:#ef4444;">Erro ao carregar histórico: ' + esc(err.message) + '</p>';
  }
}

$('#btn-recent-all')?.addEventListener('click', () => {
  recentLogsFilterMode = 'all';
  const bAll = $('#btn-recent-all');
  const bCur = $('#btn-recent-current');
  if (bAll) {
    bAll.className = 'btn active';
    bAll.style.background = '#fff';
    bAll.style.color = 'var(--brand-navy,#010E38)';
    bAll.style.fontWeight = '700';
    bAll.style.border = '2px solid #0284c7';
    bAll.style.boxShadow = '0 1px 4px rgba(2,132,199,0.15)';
  }
  if (bCur) {
    bCur.className = 'btn secondary';
    bCur.style.background = 'transparent';
    bCur.style.color = '#64748b';
    bCur.style.fontWeight = '600';
    bCur.style.border = '2px solid transparent';
    bCur.style.boxShadow = 'none';
  }
  refreshRecentWorklogs();
});

$('#btn-recent-current')?.addEventListener('click', () => {
  recentLogsFilterMode = 'current';
  const bAll = $('#btn-recent-all');
  const bCur = $('#btn-recent-current');
  if (bCur) {
    bCur.className = 'btn active';
    bCur.style.background = '#fff';
    bCur.style.color = 'var(--brand-navy,#010E38)';
    bCur.style.fontWeight = '700';
    bCur.style.border = '2px solid #0284c7';
    bCur.style.boxShadow = '0 1px 4px rgba(2,132,199,0.15)';
  }
  if (bAll) {
    bAll.className = 'btn secondary';
    bAll.style.background = 'transparent';
    bAll.style.color = '#64748b';
    bAll.style.fontWeight = '600';
    bAll.style.border = '2px solid transparent';
    bAll.style.boxShadow = 'none';
  }
  refreshRecentWorklogs();
});

$('#btn-refresh-recent-logs')?.addEventListener('click', refreshRecentWorklogs);

$('#prod-log-form').addEventListener('submit', async e => {
  e.preventDefault();
  if(!canWrite()) return;
  const feedback = $('#prod-log-feedback');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Gravando apontamento...'; }
  try {
    const proId = $('#prod-pro').value;
    const contractId = $('#prod-contract').value;
    const workDate = $('#prod-date').value;
    const minutes = Number($('#prod-minutes').value);

    const res = await api('/productivity/worklogs', {
      method: 'POST',
      body: JSON.stringify({
        professional_id: proId,
        contract_id: contractId,
        date: workDate,
        minutes: minutes
      })
    });

    const workMonth = workDate.substring(0, 7);
    const activeMonth = $('#prod-month')?.value || '';
    const isDifferentMonth = activeMonth && workMonth !== activeMonth;

    const fmt = c => money((c || 0) / 100);
    const dur = formatHoursMinutes(minutes);
    const [y, m, d] = workDate.split('-');
    const formattedDate = `${d}/${m}/${y}`;
    const formattedMonth = `${m}/${y}`;
    const activeFormattedMonth = activeMonth ? `${activeMonth.split('-')[1]}/${activeMonth.split('-')[0]}` : '';

    if (feedback) {
      feedback.style.display = 'block';
      feedback.innerHTML = `
        <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:14px 16px;box-shadow:0 2px 6px rgba(22,163,74,0.08);animation:tabFadeIn .25s ease-out;margin-top:6px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:18px;">✅</span>
            <strong style="color:#166534;font-size:14px;font-weight:800;">Apontamento Registrado com Sucesso!</strong>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:8px;font-size:12px;color:#1e293b;background:#ffffff;padding:10px 12px;border-radius:8px;border:1px solid #dcfce7;margin-bottom:10px;">
            <div><span style="color:#64748b;">Profissional:</span> <strong style="color:var(--brand-navy,#010E38);">${esc(res.professional_name||'Profissional')}</strong></div>
            <div><span style="color:#64748b;">Contrato:</span> <strong style="color:var(--brand-navy,#010E38);">${esc(res.contract_label||'Contrato')}</strong></div>
            <div><span style="color:#64748b;">Data do Trabalho:</span> <strong style="color:#0284c7;">${formattedDate} (${formattedMonth})</strong></div>
            <div><span style="color:#64748b;">Tempo Registrado:</span> <strong style="color:#16a34a;">${dur}</strong></div>
            <div><span style="color:#64748b;">Custo Calculado:</span> <strong style="color:#d97706;">${fmt(res.cost_cents)}</strong></div>
          </div>
          ${isDifferentMonth ? `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:12px;color:#92400e;line-height:1.4;">
              <strong>⚠️ Atenção à Competência:</strong><br>
              Você apontou para <strong>${formattedMonth}</strong>, mas a visualização atual do relatório acima está em <strong>${activeFormattedMonth}</strong>.<br>
              <div style="margin-top:8px;">
                <button type="button" id="btn-goto-worklog-month" class="btn" style="background:#d97706;color:#fff;font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:6px;border:none;cursor:pointer;">
                  📅 Alternar Relatório para a Competência ${formattedMonth} ➔
                </button>
              </div>
            </div>
          ` : `
            <div style="font-size:11.5px;color:#15803d;font-weight:600;">
              ✓ O apontamento foi computado no contrato e já está refletido nos cards e tabelas.
            </div>
          `}
          <div style="margin-top:6px;display:flex;justify-content:flex-end;">
            <button type="button" id="btn-scroll-to-recent-logs" class="btn secondary" style="padding:4px 10px;font-size:11px;min-height:28px;">
              Ver no Histórico de Apontamentos ↓
            </button>
          </div>
        </div>
      `;

      $('#btn-goto-worklog-month')?.addEventListener('click', async () => {
        if ($('#prod-month')) {
          $('#prod-month').value = workMonth;
          await refreshProductivity();
          document.getElementById('prod-contracts')?.scrollIntoView({ behavior: 'smooth' });
        }
      });

      $('#btn-scroll-to-recent-logs')?.addEventListener('click', () => {
        document.getElementById('prod-recent-logs-section')?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    $('#prod-minutes').value = '';
    await refreshProductivity();
    await refreshRecentWorklogs();
  } catch (err) {
    if (feedback) {
      feedback.style.display = 'block';
      feedback.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 12px;color:#b91c1c;font-size:12px;margin-top:6px;">
          <strong>Erro ao registrar:</strong> ${esc(err.message)}
        </div>
      `;
    }
    $('#prod-status').textContent = err.message;
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
  }
});
const start08=start;start=async function(){await start08();if(user)await refreshProductivity()};
const refreshFinance08=refreshFinance;refreshFinance=async function(){await refreshFinance08();await refreshProductivity()};

// v0.9: capacity and optional indirect-cost allocation preview, read-only on mobile.
async function refreshPlanning(){if(!user)return;try{
 const month=$('#manage-month')?.value||$('#plan-month')?.value||'2026-10';
 if($('#plan-month')) $('#plan-month').value=month;
 const [data,pros]=await Promise.all([api('/planning?month='+encodeURIComponent(month)),api('/productivity/professionals')]);
 const formatMinutes=formatHoursMinutes;
 const fmtCents=c=>money((c||0)/100);
 
 $('#plan-prof').innerHTML=pros.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 
 const totalAvail=data.professionals.reduce((sum,p)=>sum+(p.available_minutes||0),0);
 const totalLogged=data.logged_minutes_total||0;
 const totalOccupancy=totalAvail>0?((totalLogged/totalAvail)*100).toFixed(1):0;
 const totalPoolAmount=data.pools.reduce((sum,p)=>sum+(p.amount_cents||0),0);

 $('#plan-summary').innerHTML=`
  <article class="card" style="border-left:4px solid #0284c7;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Horas e Minutos Alocados</span>
      <span style="font-size:16px;">⏱️</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${esc(formatMinutes(totalLogged))}</strong>
    <div style="font-size:11px;color:#0284c7;font-weight:600;margin-top:4px;">Tempo apontado nos casos ativos</div>
  </article>

  <article class="card" style="border-left:4px solid var(--brand-gold,#EBB52C);background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Capacidade Total Declarada</span>
      <span style="font-size:16px;">👥</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${esc(formatMinutes(totalAvail))}</strong>
    <div style="font-size:11px;color:#b45309;font-weight:600;margin-top:4px;">Disponibilidade mensal da equipe</div>
  </article>

  <article class="card" style="border-left:4px solid #16a34a;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Taxa de Ocupação Média</span>
      <span style="font-size:16px;">📊</span>
    </div>
    <strong style="font-size:22px;color:#16a34a;font-weight:900;">${totalOccupancy}%</strong>
    <div style="font-size:11px;color:#15803d;font-weight:600;margin-top:4px;">${formatMinutes(Math.max(0,totalAvail-totalLogged))} livres para novos clientes</div>
  </article>

  <article class="card" style="border-left:4px solid #8b5cf6;background:#fff;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-left-width:4px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span class="label" style="font-size:12px;font-weight:700;color:#64748b;">Despesas Indiretas (Pools)</span>
      <span style="font-size:16px;">🏢</span>
    </div>
    <strong style="font-size:22px;color:var(--brand-navy,#010E38);font-weight:900;">${esc(fmtCents(totalPoolAmount))}</strong>
    <div style="font-size:11px;color:#7c3aed;font-weight:600;margin-top:4px;">${data.pools.length} pools declarados para rateio</div>
  </article>
 `;

 $('#plan-people').innerHTML=data.professionals.length?`
  <div class="tablewrap" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;">
    <table style="width:100%;margin:0;border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;">Advogado / Profissional</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Capacidade Disponível</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:right;">Horas & Minutos Apontados</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;min-width:140px;">Taxa de Utilização</th>
          <th style="padding:10px 14px;font-size:12px;color:#475569;font-weight:700;text-align:center;">Diagnóstico de Carga</th>
        </tr>
      </thead>
      <tbody>
        ${data.professionals.map(x=>{
          const util=x.utilization_pct!=null?x.utilization_pct:0;
          const statusBadge=x.over_capacity?`<span class="pill" style="background:#fee2e2;color:#b91c1c;font-weight:700;">Acima da Capacidade</span>`:
                            (util<50?`<span class="pill" style="background:#dcfce7;color:#15803d;font-weight:700;">Disponível para Novos Casos</span>`:
                            `<span class="pill" style="background:#e0f2fe;color:#0284c7;font-weight:700;">Carga Equilibrada</span>`);
          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:var(--brand-navy,#010E38);">${esc(x.name)}</td>
              <td style="padding:10px 14px;font-size:12.5px;font-weight:600;text-align:right;color:#475569;">${x.available_minutes==null?'ND':esc(formatMinutes(x.available_minutes))}</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;text-align:right;color:#0284c7;">${esc(formatMinutes(x.logged_minutes))}</td>
              <td style="padding:10px 14px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;min-width:60px;">
                    <div style="width:${Math.min(100,util)}%;height:100%;background:${x.over_capacity?'#ef4444':'#0284c7'};border-radius:4px;"></div>
                  </div>
                  <strong style="font-size:12px;min-width:44px;text-align:right;color:#334155;">${x.utilization_pct!=null?x.utilization_pct+'%':'ND'}</strong>
                </div>
              </td>
              <td style="padding:10px 14px;text-align:center;">${statusBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
 `:'<p class="muted">Nenhum profissional cadastrado.</p>';

 $('#plan-pools').innerHTML=data.pools.length?data.pools.map(p=>`
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(1,14,56,0.04);display:flex;flex-direction:column;gap:12px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
      <div>
        <strong style="font-size:14px;color:var(--brand-navy,#010E38);display:block;">${esc(p.label)}</strong>
        <span style="font-size:11.5px;color:#64748b;display:block;margin-top:2px;">${esc(p.source_note)}</span>
      </div>
      <div style="text-align:right;">
        <span style="font-size:15px;font-weight:900;color:#16a34a;display:block;">${fmtCents(p.amount_cents)}</span>
        <span class="pill" style="font-size:10px;background:#f1f5f9;color:#475569;font-weight:700;">Rateio por Horas e Minutos</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Absorção Simulada por Contrato:</span>
      ${p.allocations.map(a=>{
        const pct=totalLogged>0?((a.logged_minutes/totalLogged)*100).toFixed(1):0;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:6px 10px;border-radius:6px;border:1px solid #e2e8f0;font-size:12px;">
            <div style="display:flex;flex-direction:column;">
              <strong style="color:var(--brand-navy,#010E38);font-size:12px;">${esc(a.contract)}</strong>
              <span style="font-size:10.5px;color:#64748b;">${esc(formatMinutes(a.logged_minutes))} (${pct}% das horas e min.)</span>
            </div>
            <strong style="color:#d97706;font-size:12.5px;">${fmtCents(a.allocated_cents)}</strong>
          </div>
        `;
      }).join('')}
    </div>
  </div>
 `).join(''):'<div style="background:#f8fafc;padding:16px;border-radius:10px;text-align:center;color:#64748b;font-size:13px;border:1px solid #e2e8f0;">Sem custos indiretos declarados para este mês.</div>';

 $('#plan-status').textContent=data.warnings.join(' ');
 }catch(err){$('#plan-status').textContent='Erro no planejamento de capacidade: '+err.message;}}

$('#plan-capacity-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;try{await api('/planning/capacity',{method:'POST',body:JSON.stringify({professional_id:$('#plan-prof').value,month:$('#manage-month')?.value||$('#plan-month')?.value||'2026-10',available_minutes:Number($('#plan-available').value)})});await refreshPlanning();}catch(err){$('#plan-status').textContent=err.message;}});
$('#plan-pool-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!canWrite())return;try{await api('/planning/overhead',{method:'POST',body:JSON.stringify({month:$('#manage-month')?.value||$('#plan-month')?.value||'2026-10',label:$('#plan-label').value,amount:$('#plan-amount').value,basis:'minutes_logged',source_note:$('#plan-source').value})});e.target.reset();await refreshPlanning();}catch(err){$('#plan-status').textContent=err.message;}});
const start09=start;start=async function(){await start09();if(user)await refreshPlanning()};
const refreshFinance09=refreshFinance;refreshFinance=async function(){await refreshFinance09();await refreshPlanning()};

// v1.0: office-scoped governance and legal team access modal.
function openGovernanceModal(tabId='tab-novo-acesso'){
 const dlg=$('#governance-modal');
 if(!dlg)return;
 if(user?.role!=='admin'||mobile()){
  alert('A gestão de usuários e governança é restrita a administradores (sócios titulares) no desktop.');
  return;
 }
 if(typeof dlg.showModal==='function') dlg.showModal();
 else dlg.setAttribute('open','true');
 switchGovTab(tabId);
 refreshGovernance();
}
function closeGovernanceModal(){
 const dlg=$('#governance-modal');
 if(!dlg)return;
 if(typeof dlg.close==='function') dlg.close();
 else dlg.removeAttribute('open');
}
function switchGovTab(tabId){
 document.querySelectorAll('.gov-tab-btn').forEach(btn=>{
  const active=btn.dataset.govTab===tabId;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-selected',active?'true':'false');
 });
 document.querySelectorAll('.gov-tab-pane').forEach(pane=>{
  pane.classList.toggle('active',pane.id===tabId);
 });
}

$('#gov-modal-close')?.addEventListener('click',closeGovernanceModal);
document.querySelectorAll('.gov-tab-btn').forEach(btn=>{
 btn.addEventListener('click',()=>switchGovTab(btn.dataset.govTab));
});
$('#governance-modal')?.addEventListener('click',e=>{
 if(e.target===$('#governance-modal')) closeGovernanceModal();
});

async function refreshGovernance(){
 const section=$('#governance-panel');
 const admin=user?.role==='admin'&&!mobile();
 if(section) section.hidden=true;
 const btnNav=$('#btn-navbar-users');
 if(btnNav) btnNav.style.display=admin?'flex':'none';
 if(!admin){
  const listEl=$('#gov-users');
  if(listEl && (!user || user.role==='viewer')) listEl.innerHTML='<p class="muted">Acesso de gestão restrito aos sócios administradores da banca.</p>';
  const auditEl=$('#gov-audit');
  if(auditEl && (!user || user.role==='viewer')) auditEl.innerHTML='<p class="muted">Acesso à trilha de auditoria restrito aos administradores da banca.</p>';
  return;
 }
 try{
  const [users,events]=await Promise.all([api('/governance/users'),api('/governance/audit?limit=100')]);
  const roleBadges={
   admin:{label:'👑 Administrador · Sócio Titular',badge:'background:#fef3c7;color:#92400e;border:1px solid #fde68a;'},
   editor:{label:'✍️ Editor · Controladoria',badge:'background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;'},
   viewer:{label:'👁️ Visualizador · Associado',badge:'background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;'}
  };
  const listEl=$('#gov-users');
  if(listEl){
   listEl.innerHTML=users.length?users.map(u=>{
    const meta=roleBadges[u.role]||{label:u.role,badge:'background:#f1f5f9;color:#475569;'};
    const initial=(u.email||'U').charAt(0).toUpperCase();
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
     <div style="display:flex;align-items:center;gap:10px;">
      <span style="width:34px;height:34px;border-radius:50%;background:var(--brand-navy,#010E38);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">${esc(initial)}</span>
      <div>
       <strong style="font-size:13px;color:var(--brand-navy,#010E38);display:block;">${esc(u.email)}</strong>
       <span style="font-size:11px;color:#64748b;">Acesso da Banca Jurídica</span>
      </div>
     </div>
     <span style="font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:20px;${meta.badge}">${esc(meta.label)}</span>
    </div>`;
   }).join(''):'<p class="muted">Nenhum outro usuário cadastrado para esta banca.</p>';
  }
  const auditEl=$('#gov-audit');
  if(auditEl){
   auditEl.innerHTML=events.length?`<div class="tablewrap" style="max-height:300px;overflow-y:auto;"><table><thead><tr><th>Horário</th><th>Responsável</th><th>Operação</th><th>Alvo</th></tr></thead><tbody>${events.map(e=>`<tr><td style="font-size:11.5px;color:#64748b;">${esc(e.timestamp)}</td><td style="font-weight:600;color:var(--brand-navy,#010E38);">${esc(e.actor)}</td><td><span class="pill" style="font-size:11px;">${esc(e.action)}</span></td><td style="font-size:11px;font-family:monospace;color:#475569;">${esc(e.target_id)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Sem eventos rastreados recentemente.</p>';
  }
 }catch(error){
  const st=$('#gov-status');
  if(st) st.textContent=error.message;
 }
}
$('#gov-user-form')?.addEventListener('submit',async e=>{
 e.preventDefault();if(user?.role!=='admin'||mobile())return;
 const statusEl=$('#gov-status');
 if(statusEl){statusEl.style.color='var(--brand-navy,#010E38)';statusEl.textContent='Cadastrando colaborador...';}
 try{
  await api('/governance/users',{method:'POST',body:JSON.stringify({email:$('#gov-email').value,password:$('#gov-password').value,role:$('#gov-role').value})});
  e.target.reset();
  if(statusEl){statusEl.style.color='#16a34a';statusEl.textContent='Usuário cadastrado com sucesso!';}
  await refreshGovernance();
  setTimeout(()=>{
   switchGovTab('tab-usuarios-ativos');
   if(statusEl) statusEl.textContent='';
  },900);
 }catch(err){
  if(statusEl){statusEl.style.color='#dc2626';statusEl.textContent='Erro ao cadastrar: '+err.message;}
 }
});
$('#gov-export')?.addEventListener('click',async()=>{
 if(user?.role!=='admin'||mobile())return;
 try{
  const r=await fetch('/api/governance/export/entries.csv',{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)throw Error('Falha ao exportar');
  const blob=await r.blob();
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='lancamentos-piloto.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
 }catch(err){
  const st=$('#gov-status');if(st)st.textContent=err.message;
 }
});
const start10=start;start=async function(){await start10();if(user)await refreshGovernance()};
window.addEventListener('resize',()=>{if(user)refreshGovernance()});


// v1.1: password change from desktop, all previously issued sessions revoked server-side.
const start11=start;
start=async function(){await start11();if($('#account-panel'))$('#account-panel').hidden=false;};
$('#account-password-form').addEventListener('submit',async e=>{
 e.preventDefault(); if(!user||mobile())return;
 const output=$('#account-password-status');output.textContent='Atualizando credenciais…';
 try{
  await api('/account/change-password',{method:'POST',body:JSON.stringify({current_password:$('#account-current-password').value,new_password:$('#account-new-password').value})});
  e.target.reset();output.textContent='Senha alterada. Faça login novamente.';
  showLogin();$('#login-error').textContent='Senha alterada: entre novamente.';
 }catch(error){output.textContent=error.message;}
});
window.addEventListener('resize',()=>{if($('#account-panel'))$('#account-panel').hidden=false;});

// MFA enrollment and session controls, desktop only.
$('#mfa-setup')?.addEventListener('click',async()=>{try{const r=await api('/account/mfa/setup',{method:'POST'});$('#mfa-secret').textContent='Segredo MFA: '+r.secret+'\nURI: '+r.otpauth_uri;$('#mfa-message').textContent='Cadastre no autenticador e confirme o codigo.'}catch(e){$('#mfa-message').textContent=e.message}});
$('#mfa-confirm-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/account/mfa/confirm',{method:'POST',body:JSON.stringify({code:$('#mfa-code').value})});sessionStorage.removeItem('dre_token');location.reload()}catch(err){$('#mfa-message').textContent=err.message}});
$('#session-revoke')?.addEventListener('click',async()=>{try{await api('/account/sessions/revoke-all',{method:'POST'});sessionStorage.removeItem('dre_token');location.reload()}catch(e){$('#mfa-message').textContent=e.message}});

// V2.2: feedback unificado de carregamento e erros para requisicoes autenticadas.
let pendingRequests22=0;
function requestFeedback22(message='',error=false){const box=document.getElementById('request-feedback');if(!box)return;box.hidden=!message;box.textContent=message;box.classList.toggle('error',error)}
const originalApi22=api;
api=async function(url,options={}){pendingRequests22++;if(pendingRequests22===1)requestFeedback22('Atualizando informações...');try{return await originalApi22(url,options)}catch(error){requestFeedback22('Não foi possível concluir a operação. '+(error?.message||'Tente novamente.'),true);throw error}finally{pendingRequests22=Math.max(0,pendingRequests22-1);if(pendingRequests22===0){const box=document.getElementById('request-feedback');if(box&&!box.classList.contains('error'))requestFeedback22('')}}};
// Ao navegar, mantém a indicação da página ativa sem interferir no carregamento dos dados.
const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('[data-view]').forEach(button=>{if(button.dataset.view==='painel')button.setAttribute('aria-current','page')});

// V2.4: confirmação contextual e prevenção de duplo envio em formulários financeiros.
const pendingForms24 = new WeakSet();
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement) || !form.matches('#entry-form,#bill-form,#settlement-form,#bank-form,#account-form,#contract-form,#customer-form'))return;
  if(pendingForms24.has(form)){event.preventDefault();event.stopImmediatePropagation();return;}
  pendingForms24.add(form);
  const submitter=event.submitter || form.querySelector('button[type="submit"],button:not([type])');
  if(submitter){submitter.disabled=true;submitter.setAttribute('aria-busy','true');}
  // Os manipuladores existentes usam operações assíncronas; liberamos após os pedidos ao servidor.
  const release=()=>{pendingForms24.delete(form);if(submitter){submitter.disabled=false;submitter.removeAttribute('aria-busy');}};
  let ticks=0;
  const wait=()=>{if(pendingRequests22>0){ticks=0;setTimeout(wait,150);return;} if(++ticks<3){setTimeout(wait,150);return;}release();};
  setTimeout(wait,150);
},true);
// Fornece navegação consistente por teclado entre as abas principais.
document.querySelectorAll('.mobile-nav [data-view]').forEach(button=>{
  button.setAttribute('type','button');
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const items=[...document.querySelectorAll('.mobile-nav [data-view]')];
    const next=(items.indexOf(button)+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;
    event.preventDefault();items[next].focus();items[next].click();
  });
});


// V3.0: instalação assistida via navbar UX/UI e sinalização de conexão
let deferredInstall30 = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstall30 = event;
});
async function triggerPwaInstall() {
  if (deferredInstall30) {
    const e = deferredInstall30;
    deferredInstall30 = null;
    await e.prompt();
  } else {
    const dlg = document.getElementById('pwa-install-dialog');
    if (dlg) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    }
  }
}
document.getElementById('install-pwa')?.addEventListener('click', triggerPwaInstall);
document.getElementById('mobile-install-btn')?.addEventListener('click', triggerPwaInstall);
document.getElementById('close-install-dialog')?.addEventListener('click', () => {
  const dlg = document.getElementById('pwa-install-dialog');
  if (dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }
});
document.getElementById('btn-ok-install-dialog')?.addEventListener('click', () => {
  const dlg = document.getElementById('pwa-install-dialog');
  if (dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }
});
window.addEventListener('appinstalled', () => {
  deferredInstall30 = null;
  const b = document.getElementById('install-pwa');
  if (b) b.style.display = 'none';
  const mb = document.getElementById('mobile-install-btn');
  if (mb) mb.style.display = 'none';
});
function connectionState30(){const el=document.getElementById('offline-indicator');if(el)el.hidden=navigator.onLine;}
window.addEventListener('online',connectionState30);window.addEventListener('offline',connectionState30);connectionState30();
document.getElementById('onboarding-dismiss')?.addEventListener('click',()=>{document.getElementById('onboarding-v30').hidden=true;});
if('serviceWorker' in navigator && window.isSecureContext){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}

// ==========================================
// Módulo de Naturezas de Operações e DRE CPC
// ==========================================
let dreGroups = [];
let operationNatures = [];

async function refreshNatures() {
  if (!user) return;
  try {
    const [groupsRes, naturesRes] = await Promise.all([
      api('/dre-groups'),
      api('/operation-natures?only_active=false')
    ]);
    dreGroups = groupsRes;
    operationNatures = naturesRes;

    populateNatureSelects();
    renderNaturesTable();
    updateNatureCodeSuggestion();
    if (typeof renderSubcategoriesTable === 'function') renderSubcategoriesTable();
    await refreshCompleteDRE();
  } catch (err) {
    console.error('Erro ao carregar naturezas:', err);
  }
}

function populateNatureSelects() {
  const currentKind = $('#f-tipo')?.value || 'receita';
  const entryNatures = operationNatures.filter(n => n.is_active && (n.operation_type === currentKind || (currentKind === 'receita' && n.operation_type === 'receita')));
  
  if ($('#f-nature')) {
    const prev = $('#f-nature').value;
    $('#f-nature').innerHTML = '<option value="">Selecione a natureza...</option>' +
      entryNatures.map(n => `<option value="${esc(n.id)}" ${n.id===prev?'selected':''}>${esc(n.code)} · ${esc(n.name)}</option>`).join('');
  }

  if ($('#bill-nature')) {
    const prev = $('#bill-nature').value;
    $('#bill-nature').innerHTML = '<option value="">Selecione a natureza...</option>' +
      operationNatures.filter(n => n.is_active).map(n => `<option value="${esc(n.id)}" ${n.id===prev?'selected':''}>${esc(n.code)} · ${esc(n.name)} (${esc(n.group_code)})</option>`).join('');
  }

  if ($('#sub-nature-select')) {
    $('#sub-nature-select').innerHTML = '<option value="">Selecione uma natureza...</option>' +
      operationNatures.map(n => `<option value="${esc(n.id)}">${esc(n.code)} · ${esc(n.name)}</option>`).join('');
  }
}

function updateSubcategoriesSelect(natureId, selectEl, selectValueToKeep) {
  if (!selectEl) return;
  const nature = operationNatures.find(n => n.id === natureId);
  if (!nature || !nature.subcategories || !nature.subcategories.length) {
    selectEl.innerHTML = '<option value="">Sem subcategoria</option>';
    return;
  }
  const opts = nature.subcategories.map(s => {
    const isCustom = s.is_system_default === 0 || (s.office_id && s.is_system_default !== 1);
    const tag = isCustom ? ' [Escritório]' : '';
    const isSel = (selectValueToKeep && s.id === selectValueToKeep);
    return `<option value="${esc(s.id)}" ${isSel ? 'selected' : ''}>${esc(s.name)}${tag}</option>`;
  }).join('');
  selectEl.innerHTML = '<option value="">Sem subcategoria</option>' + opts;
}

$('#f-tipo')?.addEventListener('change', () => {
  populateNatureSelects();
  updateSubcategoriesSelect($('#f-nature')?.value, $('#f-subcategory'));
});

$('#f-nature')?.addEventListener('change', (e) => {
  updateSubcategoriesSelect(e.target.value, $('#f-subcategory'));
});

$('#bill-nature')?.addEventListener('change', (e) => {
  updateSubcategoriesSelect(e.target.value, $('#bill-subcategory'));
});

// Modal e cadastro rápido de subcategoria pelo cliente
let activeQuickNatureId = null;
let activeQuickTargetSelect = null;

function openQuickSubModal(natureId, targetSelectId) {
  const nature = operationNatures.find(n => n.id === natureId);
  if (!nature) {
    alert('Por favor, selecione primeiro a Classificação (Natureza) para vincular a nova subcategoria.');
    return;
  }
  activeQuickNatureId = natureId;
  activeQuickTargetSelect = targetSelectId;
  const infoEl = $('#quick-sub-parent-info');
  if (infoEl) {
    infoEl.innerHTML = `Vinculada à Natureza: <strong>${esc(nature.code)} · ${esc(nature.name)}</strong> (${esc(nature.group_name)})`;
  }
  const inputEl = $('#quick-sub-input');
  if (inputEl) inputEl.value = '';
  const modal = $('#quick-sub-modal');
  if (modal && typeof modal.showModal === 'function') {
    modal.showModal();
    inputEl?.focus();
  } else {
    const name = prompt(`Nova subcategoria para "${nature.name}":`);
    if (name && name.trim()) {
      saveQuickSubcategory(natureId, name.trim(), targetSelectId);
    }
  }
}

async function saveQuickSubcategory(natureId, name, targetSelectId) {
  try {
    const res = await api(`/operation-natures/${encodeURIComponent(natureId)}/subcategories`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await refreshNatures();
    if (targetSelectId) {
      const selectEl = $(targetSelectId);
      if (selectEl) {
        updateSubcategoriesSelect(natureId, selectEl, res.id);
        selectEl.value = res.id;
      }
    }
    const modal = $('#quick-sub-modal');
    if (modal && modal.open) modal.close();
  } catch (err) {
    alert('Erro ao salvar subcategoria: ' + err.message);
  }
}

$('#quick-sub-cancel')?.addEventListener('click', () => {
  $('#quick-sub-modal')?.close();
});

$('#quick-sub-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  const name = ($('#quick-sub-input')?.value || '').trim();
  if (!name || !activeQuickNatureId) return;
  await saveQuickSubcategory(activeQuickNatureId, name, activeQuickTargetSelect);
});

$('#btn-quick-sub-entry')?.addEventListener('click', () => {
  const natureId = $('#f-nature')?.value;
  if (!natureId) {
    alert('Por favor, selecione primeiro a Classificação (Natureza) para vincular a nova subcategoria.');
    $('#f-nature')?.focus();
    return;
  }
  openQuickSubModal(natureId, '#f-subcategory');
});

$('#btn-quick-sub-bill')?.addEventListener('click', () => {
  const natureId = $('#bill-nature')?.value;
  if (!natureId) {
    alert('Por favor, selecione primeiro a Classificação (Natureza) para vincular a nova subcategoria.');
    $('#bill-nature')?.focus();
    return;
  }
  openQuickSubModal(natureId, '#bill-subcategory');
});

let availableAreas = [];

async function loadAreas(selectedToKeep) {
  try {
    const res = await api('/areas');
    availableAreas = res.areas || [];
    renderAreasSelect(selectedToKeep);
    if (typeof renderAreasPageTable === 'function') renderAreasPageTable();
  } catch (err) {
    console.warn('Erro ao carregar áreas:', err);
  }
}

function renderAreasSelect(selectedToKeep) {
  const selectEl = $('#f-area');
  if (!selectEl) return;
  const currentVal = selectedToKeep || selectEl.value;
  selectEl.innerHTML = availableAreas.map(a => {
    const label = a.is_custom ? `${esc(a.name)} [Escritório]` : esc(a.name);
    return `<option value="${esc(a.name)}">${label}</option>`;
  }).join('');
  if (currentVal) {
    selectEl.value = currentVal;
  }
  const manageSpecialty = $('#manage-specialty');
  if (manageSpecialty && availableAreas.length) {
    const prevSpec = manageSpecialty.value;
    manageSpecialty.innerHTML = availableAreas.map(a => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
    if (prevSpec) manageSpecialty.value = prevSpec;
  }
}

function openQuickAreaModal() {
  const inputEl = $('#quick-area-input');
  if (inputEl) inputEl.value = '';
  const modal = $('#quick-area-modal');
  if (modal && typeof modal.showModal === 'function') {
    modal.showModal();
    inputEl?.focus();
  } else {
    const name = prompt('Nome da nova Área jurídica:');
    if (name && name.trim()) {
      saveQuickArea(name.trim());
    }
  }
}

async function saveQuickArea(name) {
  try {
    await api('/areas', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await loadAreas(name);
    const modal = $('#quick-area-modal');
    if (modal && modal.open) modal.close();
  } catch (err) {
    alert('Erro ao salvar área: ' + err.message);
  }
}

$('#quick-area-cancel')?.addEventListener('click', () => {
  $('#quick-area-modal')?.close();
});

$('#quick-area-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  const name = ($('#quick-area-input')?.value || '').trim();
  if (!name) return;
  await saveQuickArea(name);
});

$('#btn-quick-area-entry')?.addEventListener('click', () => {
  openQuickAreaModal();
});

function renderNaturesTable() {
  const tbody = $('#natures-table-body');
  if (!tbody) return;

  const q = ($('#natures-search')?.value || '').trim().toLowerCase();
  const groupFilter = $('#natures-group-filter')?.value || '';
  const typeFilter = $('#natures-type-filter')?.value || '';

  const filtered = operationNatures.filter(n => {
    if (groupFilter && n.group_id !== groupFilter) return false;
    if (typeFilter && n.operation_type !== typeFilter) return false;
    if (q) {
      const text = [n.code, n.name, n.description || '', n.group_name].join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  if ($('#natures-count')) {
    $('#natures-count').textContent = `${filtered.length} de ${operationNatures.length} naturezas de operações exibidas.`;
  }

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:16px;">Nenhuma natureza encontrada para os filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(n => {
    const isSys = n.is_system_default;
    const originPill = isSys
      ? '<span class="pill-system">Sistema</span>'
      : '<span class="pill-custom">Escritório</span>';
    const statusPill = n.is_active
      ? '<span class="pill-active">Ativa</span>'
      : '<span class="pill-inactive">Inativa</span>';
    
    let subsHtml = '';
    if (n.subcategories && n.subcategories.length) {
      subsHtml = n.subcategories.map(s => {
        const isCustom = s.is_system_default === 0 || (s.office_id && s.is_system_default !== 1);
        const customClass = isCustom ? 'custom' : '';
        const titleTip = isCustom ? 'Subcategoria do escritório' : 'Subcategoria padrão do sistema';
        return `
          <span class="sub-tag-chip ${customClass}" title="${titleTip}">
            <span>${esc(s.name)}</span>
            ${canWrite() ? `
              <button type="button" class="sub-chip-btn" data-edit-sub="${esc(s.id)}" data-nature-id="${esc(n.id)}" data-sub-name="${esc(s.name)}" title="Editar subcategoria">✏️</button>
              <button type="button" class="sub-chip-btn del" data-del-sub="${esc(s.id)}" data-sub-name="${esc(s.name)}" title="Excluir subcategoria">&times;</button>
            ` : ''}
          </span>
        `;
      }).join('');
    }
    
    if (canWrite()) {
      subsHtml += `<button type="button" class="btn secondary" style="padding:3px 8px;font-size:11px;min-height:24px;border-radius:6px;margin-left:4px;font-weight:600;" data-add-sub-nature="${esc(n.id)}" title="Adicionar subcategoria nesta natureza">+ Subcategoria</button>`;
    } else if (!subsHtml) {
      subsHtml = '<span class="muted" style="font-size:12px;">—</span>';
    }

    const actions = canWrite() ? `
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn-action edit" data-edit-nature="${esc(n.id)}" title="Editar dados da natureza">
          <span>✏️</span> Editar
        </button>
        <button type="button" class="btn-action delete" data-delete-nature="${esc(n.id)}" title="Excluir ou inativar natureza">
          <span>🗑️</span> Excluir
        </button>
        <button type="button" class="btn-action ${n.is_active ? 'toggle-inactivate' : 'toggle-activate'}" data-toggle-nature="${esc(n.id)}" title="${n.is_active ? 'Inativar' : 'Ativar'} natureza">
          ${n.is_active ? '⏸️ Inativar' : '▶️ Ativar'}
        </button>
      </div>
    ` : '<span class="muted" style="font-size:12px;">Consulta</span>';

    return `
      <tr>
        <td><strong>${esc(n.code)}</strong></td>
        <td><small class="muted">${esc(n.group_code)}</small> ${esc(n.group_name)}</td>
        <td>
          <strong>${esc(n.name)}</strong>
          ${n.description ? `<br><small class="muted">${esc(n.description)}</small>` : ''}
        </td>
        <td><span style="text-transform:capitalize;">${esc(n.operation_type)}</span></td>
        <td>${subsHtml}</td>
        <td>${originPill}</td>
        <td>${statusPill}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

for (const id of ['natures-search', 'natures-group-filter', 'natures-type-filter']) {
  $('#' + id)?.addEventListener('input', renderNaturesTable);
}

$('#natures-clear')?.addEventListener('click', () => {
  if ($('#natures-search')) $('#natures-search').value = '';
  if ($('#natures-group-filter')) $('#natures-group-filter').value = '';
  if ($('#natures-type-filter')) $('#natures-type-filter').value = '';
  renderNaturesTable();
});

// Ações na tabela de naturezas e subcategorias
async function handleNatureActions(ev) {
  // 1. Inativar / Ativar Natureza
  const toggleBtn = ev.target.closest('[data-toggle-nature]');
  if (toggleBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!canWrite()) {
      alert('Seu usuário está em modo somente leitura.');
      return;
    }
    const id = toggleBtn.dataset.toggleNature;
    toggleBtn.disabled = true;
    try {
      await api(`/operation-natures/${encodeURIComponent(id)}/toggle-active`, { method: 'POST' });
      await refreshNatures();
    } catch (e) {
      alert('Erro ao alterar situação: ' + e.message);
    } finally {
      toggleBtn.disabled = false;
    }
    return;
  }

  // 2. Editar Natureza (Abre Modal de Edição)
  const editNatureBtn = ev.target.closest('[data-edit-nature]');
  if (editNatureBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!canWrite()) {
      alert('Seu usuário está em modo somente leitura.');
      return;
    }
    const id = editNatureBtn.dataset.editNature;
    const n = operationNatures.find(x => x.id === id);
    if (!n) {
      alert('Natureza não encontrada: ' + id);
      return;
    }
    const modal = $('#nature-edit-modal');
    if (modal) {
      $('#nature-edit-id').value = n.id;
      $('#nature-edit-code').value = n.code;
      $('#nature-edit-group').value = `${n.group_code} · ${n.group_name}`;
      $('#nature-edit-name').value = n.name;
      $('#nature-edit-desc').value = n.description || '';
      $('#nature-edit-status').value = n.is_active ? '1' : '0';
      const infoEl = $('#nature-edit-info');
      if (infoEl) {
        infoEl.textContent = n.is_system_default
          ? 'Natureza padrão do sistema (CPC 00). Você pode personalizar a nomenclatura e orientações gerenciais para o seu escritório.'
          : 'Natureza personalizada criada para o seu escritório.';
      }
      try {
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
      } catch (err) {
        modal.setAttribute('open', '');
      }
      $('#nature-edit-name')?.focus();
    }
    return;
  }

  // 3. Excluir Natureza
  const deleteBtn = ev.target.closest('[data-delete-nature]');
  if (deleteBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!canWrite()) {
      alert('Seu usuário está em modo somente leitura.');
      return;
    }
    const id = deleteBtn.dataset.deleteNature;
    const n = operationNatures.find(x => x.id === id);
    if (!n) return;

    if (n.linked_records_count > 0) {
      const wantInactivate = confirm(`A natureza "${n.code} - ${n.name}" possui ${n.linked_records_count} lançamento(s) financeiro(s) vinculado(s) e não pode ser apagada para preservar a integridade contábil.\n\nDeseja INATIVAR esta natureza para que ela não seja mais utilizada em novos lançamentos?`);
      if (wantInactivate) {
        try {
          await api(`/operation-natures/${encodeURIComponent(id)}/toggle-active`, { method: 'POST' });
          await refreshNatures();
        } catch (e) {
          alert(e.message);
        }
      }
      return;
    }

    if (n.is_system_default) {
      const wantInactivate = confirm(`A natureza "${n.code} - ${n.name}" é um padrão do sistema contábil (CPC 00).\n\nPara mantê-la segura sem quebrar o plano de contas, ela será inativada e deixará de aparecer em novos lançamentos.\n\nDeseja inativar esta natureza?`);
      if (wantInactivate) {
        try {
          await api(`/operation-natures/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await refreshNatures();
        } catch (e) {
          alert(e.message);
        }
      }
      return;
    }

    if (confirm(`Deseja realmente EXCLUIR permanentemente a natureza personalizada "${n.code} - ${n.name}"?\nEsta ação é irreversível.`)) {
      try {
        await api(`/operation-natures/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await refreshNatures();
      } catch (e) {
        alert(e.message);
      }
    }
    return;
  }

  // 4. Adicionar Subcategoria rápida na natureza
  const addSubBtn = ev.target.closest('[data-add-sub-nature]');
  if (addSubBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!canWrite()) return;
    const id = addSubBtn.dataset.addSubNature;
    openQuickSubModal(id);
    return;
  }

  // 5. Editar Subcategoria
  const editSubBtn = ev.target.closest('[data-edit-sub]');
  if (editSubBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!canWrite()) return;
    const subId = editSubBtn.dataset.editSub;
    const subName = editSubBtn.dataset.subName || '';
    const natureId = editSubBtn.dataset.natureId;
    const n = operationNatures.find(x => x.id === natureId);
    const modal = $('#sub-edit-modal');
    if (modal) {
      $('#sub-edit-id').value = subId;
      $('#sub-edit-input').value = subName;
      const infoEl = $('#sub-edit-parent-info');
      if (infoEl) {
        infoEl.innerHTML = n ? `Vinculada à Natureza: <strong>${esc(n.code)} · ${esc(n.name)}</strong>` : '';
      }
      try {
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
      } catch (err) {
        modal.setAttribute('open', '');
      }
      $('#sub-edit-input')?.focus();
    }
    return;
  }

  // 6. Excluir Subcategoria
  const delSubBtn = ev.target.closest('[data-del-sub]');
  if (delSubBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!canWrite()) return;
    const subId = delSubBtn.dataset.delSub;
    const subName = delSubBtn.dataset.subName || 'esta subcategoria';
    if (confirm(`Deseja realmente excluir a subcategoria "${subName}"?`)) {
      try {
        await api(`/operation-subcategories/${encodeURIComponent(subId)}`, { method: 'DELETE' });
        await refreshNatures();
      } catch (e) {
        alert(e.message);
      }
    }
    return;
  }
}

document.addEventListener('click', handleNatureActions);
$('#natures-table-body')?.addEventListener('click', handleNatureActions);

// Alternar abas do card responsivo de cadastro (Natureza vs Subcategoria)
document.addEventListener('click', ev => {
  const tabBtn = ev.target.closest('.nature-tab-btn');
  if (tabBtn) {
    const targetId = tabBtn.dataset.targetTab;
    document.querySelectorAll('.nature-tab-btn').forEach(b => {
      const isSel = b === tabBtn;
      b.classList.toggle('active', isSel);
      b.setAttribute('aria-selected', isSel ? 'true' : 'false');
    });
    document.querySelectorAll('.nature-tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === targetId);
    });
    if (targetId === 'tab-panel-nature') {
      updateNatureCodeSuggestion();
    }
  }
});

// Alternar abas do painel unificado de Cadastros (Clientes vs Contratos)
function switchCadastrosTab(tabKey) {
  document.querySelectorAll('.cadastros-tab-btn').forEach(b => {
    const isAct = b.dataset.cadastrosTab === tabKey;
    b.classList.toggle('active', isAct);
    b.setAttribute('aria-selected', isAct ? 'true' : 'false');
  });
  document.querySelectorAll('.cadastros-tab-panel').forEach(p => {
    const isPanel = p.id === 'cadastros-panel-' + tabKey;
    p.classList.toggle('active', isPanel);
    p.style.display = isPanel ? 'block' : 'none';
  });
}
window.switchCadastrosTab = switchCadastrosTab;

document.addEventListener('click', ev => {
  const cTabBtn = ev.target.closest('.cadastros-tab-btn');
  if (cTabBtn && cTabBtn.dataset.cadastrosTab) {
    switchCadastrosTab(cTabBtn.dataset.cadastrosTab);
  }
  if (ev.target.closest('#btn-switch-to-client-tab')) {
    switchCadastrosTab('cliente');
    setTimeout(() => $('#customer-name')?.focus(), 60);
  }
});

// Controles dos Modais de Edição
$('#nature-edit-close')?.addEventListener('click', () => $('#nature-edit-modal')?.close());
$('#nature-edit-cancel')?.addEventListener('click', () => $('#nature-edit-modal')?.close());
$('#nature-edit-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!canWrite()) return;
  const id = $('#nature-edit-id')?.value;
  const name = ($('#nature-edit-name')?.value || '').trim();
  const description = ($('#nature-edit-desc')?.value || '').trim();
  const is_active = $('#nature-edit-status')?.value === '1';
  if (!id || !name) return;
  try {
    await api(`/operation-natures/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, is_active })
    });
    $('#nature-edit-modal')?.close();
    await refreshNatures();
  } catch (err) {
    alert('Erro ao atualizar natureza: ' + err.message);
  }
});

$('#sub-edit-close')?.addEventListener('click', () => $('#sub-edit-modal')?.close());
$('#sub-edit-cancel')?.addEventListener('click', () => $('#sub-edit-modal')?.close());
$('#sub-edit-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!canWrite()) return;
  const subId = $('#sub-edit-id')?.value;
  const name = ($('#sub-edit-input')?.value || '').trim();
  if (!subId || !name) return;
  try {
    await api(`/operation-subcategories/${encodeURIComponent(subId)}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    });
    $('#sub-edit-modal')?.close();
    await refreshNatures();
  } catch (err) {
    alert('Erro ao atualizar subcategoria: ' + err.message);
  }
});

// Mapeamento e cálculo inteligente do Código Gerencial de Natureza (UX/UI Contábil)
const TYPE_DEFAULT_GROUPS = {
  receita: 'G01',
  custo: 'G03',
  despesa: 'G05',
  patrimonial: 'G99'
};

const GROUP_COMPATIBLE_TYPES = {
  G01: ['receita'],
  G02: ['despesa'],
  G03: ['custo'],
  G04: ['despesa'],
  G05: ['despesa'],
  G06: ['despesa'],
  G07: ['despesa'],
  G08: ['despesa', 'receita'],
  G09: ['despesa', 'receita'],
  G10: ['despesa'],
  G99: ['patrimonial']
};

function getNextNatureCode(groupId) {
  if (!groupId) return '';
  const prefixNum = groupId.replace(/^G/, '').padStart(2, '0');
  const prefix = prefixNum + '.';
  const existingCodes = new Set((operationNatures || []).map(n => (n.code || '').trim()));

  let maxSeq = 0;
  (operationNatures || []).forEach(n => {
    const code = (n.code || '').trim();
    if (code.startsWith(prefix)) {
      const suffix = code.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  let candidateNum = maxSeq + 1;
  while (candidateNum < 1000) {
    const candidateCode = `${prefix}${String(candidateNum).padStart(2, '0')}`;
    if (!existingCodes.has(candidateCode)) {
      return candidateCode;
    }
    candidateNum++;
  }
  return `${prefix}01`;
}

function updateNatureCodeSuggestion(source = 'auto') {
  const groupSelect = $('#nat-group');
  const typeSelect = $('#nat-type');
  const codeInput = $('#nat-code');
  const badge = $('#nat-code-badge');
  const hint = $('#nat-code-hint');
  if (!groupSelect || !typeSelect || !codeInput) return;

  if (source === 'type') {
    const chosenType = typeSelect.value;
    const currentGroup = groupSelect.value;
    const compTypes = GROUP_COMPATIBLE_TYPES[currentGroup] || [];
    if (!currentGroup || !compTypes.includes(chosenType)) {
      groupSelect.value = TYPE_DEFAULT_GROUPS[chosenType] || 'G01';
    }
  } else if (source === 'group') {
    const chosenGroup = groupSelect.value;
    if (chosenGroup) {
      const compTypes = GROUP_COMPATIBLE_TYPES[chosenGroup] || ['despesa'];
      if (!compTypes.includes(typeSelect.value)) {
        typeSelect.value = compTypes[0];
      }
    }
  } else {
    if (!groupSelect.value && typeSelect.value) {
      groupSelect.value = TYPE_DEFAULT_GROUPS[typeSelect.value] || 'G01';
    }
  }

  const activeGroup = groupSelect.value;
  if (!activeGroup) {
    codeInput.value = '';
    if (badge) {
      badge.textContent = 'Aguardando grupo';
      badge.style.color = '#64748b';
      badge.style.background = '#f1f5f9';
    }
    if (hint) {
      hint.textContent = 'Selecione o tipo de operação ou grupo para gerar o código.';
    }
    return;
  }

  const nextCode = getNextNatureCode(activeGroup);
  codeInput.value = nextCode;

  const groupObj = (dreGroups || []).find(g => g.id === activeGroup);
  const groupName = groupObj ? groupObj.name : activeGroup;

  if (badge) {
    badge.textContent = `Auto-sugerido: ${nextCode}`;
    badge.style.color = '#0284c7';
    badge.style.background = '#e0f2fe';
  }
  if (hint) {
    hint.textContent = `Próximo código sequencial livre para ${activeGroup} (${groupName}). Você pode editar se desejar.`;
  }
}

function validateManualNatureCode() {
  const codeInput = $('#nat-code');
  const badge = $('#nat-code-badge');
  const hint = $('#nat-code-hint');
  if (!codeInput || !badge || !hint) return;

  const typed = codeInput.value.trim();
  if (!typed) {
    badge.textContent = 'Obrigatório';
    badge.style.color = '#dc2626';
    badge.style.background = '#fee2e2';
    hint.textContent = 'Informe um código sequencial (ex: 01.09, 05.11).';
    return;
  }

  const exists = (operationNatures || []).some(n => (n.code || '').trim().toLowerCase() === typed.toLowerCase());
  if (exists) {
    badge.textContent = '⚠️ Código já em uso';
    badge.style.color = '#dc2626';
    badge.style.background = '#fee2e2';
    hint.textContent = `Atenção: o código "${typed}" já está cadastrado em outra natureza. Escolha outro código.`;
  } else {
    badge.textContent = '✓ Código disponível';
    badge.style.color = '#16a34a';
    badge.style.background = '#dcfce7';
    hint.textContent = `Código "${typed}" válido e pronto para cadastro.`;
  }
}

$('#nat-type')?.addEventListener('change', () => updateNatureCodeSuggestion('type'));
$('#nat-group')?.addEventListener('change', () => updateNatureCodeSuggestion('group'));
$('#nat-code')?.addEventListener('input', validateManualNatureCode);

// Criação de nova natureza personalizada
$('#nature-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!canWrite()) return;
  const msgEl = $('#nature-msg');
  msgEl.textContent = '';
  const payload = {
    group_id: $('#nat-group').value,
    operation_type: $('#nat-type').value,
    code: $('#nat-code').value.trim(),
    name: $('#nat-name').value.trim(),
    description: $('#nat-desc').value.trim()
  };
  try {
    await api('/operation-natures', { method: 'POST', body: JSON.stringify(payload) });
    ev.target.reset();
    msgEl.textContent = 'Natureza cadastrada com sucesso.';
    await refreshNatures();
    updateNatureCodeSuggestion();
  } catch (err) {
    msgEl.textContent = err.message;
  }
});

// Criação de nova subcategoria
$('#subcategory-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!canWrite()) return;
  const msgEl = $('#sub-msg');
  msgEl.textContent = '';
  const natureId = $('#sub-nature-select').value;
  if (!natureId) {
    msgEl.textContent = 'Selecione uma natureza pai.';
    return;
  }
  const payload = {
    name: $('#sub-name').value.trim()
  };
  try {
    await api(`/operation-natures/${encodeURIComponent(natureId)}/subcategories`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    $('#sub-name').value = '';
    msgEl.innerHTML = 'Subcategoria adicionada com sucesso! <button type="button" class="btn secondary" data-goto="naturezas" style="padding:2px 8px;font-size:11px;margin-left:6px;">Ver Catálogo</button>';
    await refreshNatures();
    if (typeof renderSubcategoriesTable === 'function') renderSubcategoriesTable();
  } catch (err) {
    msgEl.textContent = err.message;
  }
});

// ==========================================
// Gestão de Subcategorias (Nível 3) - Página
// ==========================================
function renderSubcategoriesTable() {
  const tbody = $('#subcategories-table-body');
  if (!tbody) return;

  const q = ($('#subcategories-search')?.value || '').trim().toLowerCase();
  let allSubs = [];
  (operationNatures || []).forEach(n => {
    (n.subcategories || []).forEach(s => {
      allSubs.push({
        id: s.id,
        name: s.name,
        is_system_default: s.is_system_default,
        nature_id: n.id,
        nature_code: n.code,
        nature_name: n.name,
        group_id: n.group_id,
        group_name: n.group_name || n.group_code
      });
    });
  });

  if (q) {
    allSubs = allSubs.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.nature_code.toLowerCase().includes(q) ||
      s.nature_name.toLowerCase().includes(q) ||
      (s.group_name && s.group_name.toLowerCase().includes(q))
    );
  }

  const badge = $('#subcategories-total-badge');
  if (badge) {
    badge.textContent = `${allSubs.length} subcategoria${allSubs.length === 1 ? '' : 's'}`;
  }

  if (allSubs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">Nenhuma subcategoria encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = allSubs.map(s => {
    const originBadge = s.is_system_default
      ? '<span class="pill" style="font-size:11px;background:#f1f5f9;color:#475569;">Padrão Sistema</span>'
      : '<span class="pill" style="font-size:11px;background:#fef3c7;color:#b45309;font-weight:700;">Personalizada (Banca)</span>';

    const actionBtn = !s.is_system_default
      ? `<button type="button" class="btn secondary" data-edit-sub="${esc(s.id)}" data-sub-name="${esc(s.name)}" data-nature-id="${esc(s.nature_id)}" style="padding:3px 8px;font-size:11px;border-radius:6px;" title="Editar subcategoria">✏️ Editar</button>`
      : '<span class="muted" style="font-size:11.5px;">Fixa</span>';

    return `<tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td><span style="font-family:monospace;font-weight:700;color:var(--brand-navy,#010E38);">${esc(s.nature_code)}</span> · ${esc(s.nature_name)}</td>
      <td><span class="muted" style="font-size:12px;">${esc(s.group_id)} - ${esc(s.group_name)}</span></td>
      <td>${originBadge}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

$('#subcategories-search')?.addEventListener('input', renderSubcategoriesTable);

// ==========================================
// Gestão de Áreas Jurídicas - Página
// ==========================================
function renderAreasPageTable() {
  const tbody = $('#areas-table-body');
  if (!tbody) return;

  const q = ($('#areas-search')?.value || '').trim().toLowerCase();
  let list = availableAreas || [];

  if (q) {
    list = list.filter(a => (a.name || '').toLowerCase().includes(q));
  }

  const badge = $('#areas-total-badge');
  if (badge) {
    badge.textContent = `${list.length} área${list.length === 1 ? '' : 's'}`;
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:#64748b;">Nenhuma área jurídica encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(a => {
    const originBadge = a.is_custom
      ? '<span class="pill" style="font-size:11px;background:#ede9fe;color:#7c3aed;font-weight:700;">Personalizada (Banca)</span>'
      : '<span class="pill" style="font-size:11px;background:#f1f5f9;color:#475569;">Padrão OAB</span>';

    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px;"><span style="color:#7c3aed;font-size:14px;">⚖️</span><strong>${esc(a.name)}</strong></div></td>
      <td>${originBadge}</td>
      <td><span style="color:#16a34a;font-weight:600;font-size:12px;">✓ Disponível em Lançamentos & Contratos</span></td>
    </tr>`;
  }).join('');
}

$('#areas-search')?.addEventListener('input', renderAreasPageTable);

$('#area-page-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!canWrite()) return;
  const msgEl = $('#area-page-msg');
  if (msgEl) msgEl.textContent = '';
  const inputEl = $('#area-page-name');
  const name = (inputEl?.value || '').trim();
  if (!name) return;
  try {
    await api('/areas', { method: 'POST', body: JSON.stringify({ name }) });
    if (inputEl) inputEl.value = '';
    if (msgEl) msgEl.innerHTML = `Área jurídica "${name}" cadastrada com sucesso! <button type="button" class="btn secondary" data-goto="naturezas" style="padding:2px 8px;font-size:11px;margin-left:6px;">Ver Catálogo</button>`;
    await loadAreas(name);
    renderAreasPageTable();
  } catch (err) {
    if (msgEl) msgEl.textContent = err.message;
  }
});

// ==========================================
// DRE Completa 10 Grupos CPC + Não-DRE G99
// ==========================================
async function refreshCompleteDRE() {
  const container = $('#dre-complete-container');
  if (!container || !user) return;
  const month = $('#dre-complete-month')?.value || '';
  const url = month ? `/dre/complete?month=${encodeURIComponent(month)}` : '/dre/complete';
  try {
    if (!contracts || contracts.length === 0) {
      try { contracts = await api('/contracts'); } catch (e) {}
    }
    const res = await api(url);
    const d = res.dre;
    const p = res.operacoes_nao_dre_patrimoniais;
    const cac = res.indicadores_comerciais || d.cac || { despesas_comerciais_g06: 0, total_contratos: 0, cac_unitario: 0, cac_sobre_receita_pct: 0, status: 'Sem dados' };
    const cac_op = res.indicadores_cac_operacional || d.cac_operacional || { despesas_escritorio_total: 0, total_contratos: 0, cac_unitario: 0, cac_sobre_receita_pct: 0, status: 'Sem dados' };
    const cac_tot = res.indicadores_cac_total || d.cac_total || { despesas_totais_cac: (cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total), total_contratos: cac.total_contratos, cac_unitario: 0, cac_sobre_receita_pct: 0, status: 'Sem dados' };
    
    // Contagem real e automatica a partir dos contratos cadastrados com a respectiva origem e valores informativos
    const isMkt = c => {
      if (c.origin === 'marketing' || c.origin === 'mkt') return true;
      if (c.origin === 'atendimento' || c.origin === 'desk') return false;
      const l = (c.label || '').toLowerCase();
      return l.includes('alpha') || l.includes('tech') || l.includes('mega') || l.includes('mkt') || l.includes('marketing');
    };
    const activeContracts = (contracts && contracts.length) ? contracts.filter(c => {
      if (!month) return true;
      const sDate = c.signed_date || (c.created_at ? c.created_at.slice(0, 10) : '');
      return sDate ? sDate.slice(0, 7) === month : true;
    }) : [];

    const mktContracts = activeContracts.filter(isMkt);
    const deskContracts = activeContracts.filter(c => !isMkt(c));

    const mktFromContracts = mktContracts.length;
    const deskFromContracts = deskContracts.length;
    const initialMkt = mktFromContracts > 0 ? mktFromContracts : (cac.contratos_marketing || 0);
    const initialDesk = deskFromContracts > 0 ? deskFromContracts : (cac.contratos_atendimento || 0);
    const numContratosBase = (initialMkt + initialDesk) > 0 ? (initialMkt + initialDesk) : (cac.total_contratos || 0);

    const mktValTotal = mktContracts.reduce((sum, c) => sum + (c.contract_value || 0), 0);
    const deskValTotal = deskContracts.reduce((sum, c) => sum + (c.contract_value || 0), 0);
    const totalContractsVal = mktValTotal + deskValTotal;

    const mktTicketMedio = initialMkt > 0 ? (mktValTotal / initialMkt) : 0;
    const deskTicketMedio = initialDesk > 0 ? (deskValTotal / initialDesk) : 0;
    const totalTicketMedio = (initialMkt + initialDesk) > 0 ? (totalContractsVal / (initialMkt + initialDesk)) : 0;

    const compKey = res.competencia || 'todas';
    const fmt = v => money(v || 0);
    const dreBtn = (target, title) => `
      <button type="button" class="btn-action edit dre-item-btn" data-dre-target="${target}" data-dre-title="${esc(title)}" title="Ver lista de lançamentos que compõem este resultado" aria-label="Ver lançamentos de ${esc(title)}" style="padding:2px 7px;font-size:11px;font-weight:600;margin-left:8px;vertical-align:middle;display:inline-flex;align-items:center;gap:4px;">
        <span>📋</span> Lista
      </button>
    `;

    container.innerHTML = `
      <!-- Cabeçalho Oficial para Impressão e Relatório -->
      <div class="print-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #010E38;padding-bottom:8px;margin-bottom:12px;">
          <div>
            <div style="font-size:15pt;font-weight:900;color:#010E38;letter-spacing:-0.02em;">DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)</div>
            <div style="font-size:9.5pt;color:#465575;margin-top:2px;">Regime de Competência &bull; Estrutura CPC 00 (R2) &bull; Provimento CFOAB nº 205/2021</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11pt;font-weight:800;color:#010E38;">${esc(user?.office || 'Escritório de Advocacia')}</div>
            <div style="font-size:9pt;color:#577082;">Competência: <strong>${esc(res.competencia)}</strong></div>
            <div style="font-size:8pt;color:#708591;">Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
          </div>
        </div>
      </div>

      <div class="tablewrap">
        <table class="dre-cascade-table">
          <thead>
            <tr class="dre-header-row">
              <th>Demonstração do Resultado do Exercício (CPC 00 / Jurídico)</th>
              <th class="num">Competência ${esc(res.competencia)}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="dre-subtotal-row">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(1) RECEITA BRUTA DE SERVIÇOS JURÍDICOS (G01)</strong></span>${dreBtn('G01', '(1) Receita Bruta de Serviços Jurídicos (G01)')}</div></td>
              <td class="num"><strong>${fmt(d.receita_bruta)}</strong></td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>(-) Deduções da Receita Bruta (Tributos Faturamento / Glosas) (G02)</span>${dreBtn('G02', 'Deduções da Receita Bruta (G02)')}</div></td>
              <td class="num negative" style="color:#c5221f;">-${fmt(d.deducoes_receita)}</td>
            </tr>
            <tr class="dre-subtotal-row" style="background:#eef6fc;">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(=) RECEITA OPERACIONAL LÍQUIDA</strong></span>${dreBtn('G01,G02', 'Receita Operacional Líquida (G01 e G02)')}</div></td>
              <td class="num"><strong>${fmt(d.receita_liquida)}</strong></td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>(-) Custos dos Serviços Jurídicos (Correspondentes / Custas / Perícias) (G03)</span>${dreBtn('G03', 'Custos dos Serviços Jurídicos (G03)')}</div></td>
              <td class="num negative" style="color:#c5221f;">-${fmt(d.custos_servicos)}</td>
            </tr>
            <tr class="dre-subtotal-row" style="background:#e8f0fe;">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(=) RESULTADO BRUTO</strong></span>${dreBtn('G01,G02,G03', 'Resultado Bruto (G01 a G03)')}</div></td>
              <td class="num"><strong>${fmt(d.resultado_bruto)}</strong></td>
            </tr>
            <tr class="dre-header-row">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(-) DESPESAS OPERACIONAIS</strong></span>${dreBtn('G04,G05,G06,G07,G08', 'Despesas Operacionais Globais (G04 a G08)')}</div></td>
              <td class="num"></td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>· Despesas com Pessoal Administrativo e Apoio (G04)</span>${dreBtn('G04', 'Despesas com Pessoal Administrativo (G04)')}</div></td>
              <td class="num">-${fmt(d.despesas_operacionais.pessoal)}</td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>· Despesas Administrativas e Ocupação (Aluguel, Energia, Água) (G05)</span>${dreBtn('G05', 'Despesas Administrativas e Ocupação (G05)')}</div></td>
              <td class="num">-${fmt(d.despesas_operacionais.administrativas)}</td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>· Despesas Comerciais e Marketing Jurídico (Conforme Provimento OAB) (G06)</span>${dreBtn('G06', 'Despesas Comerciais e Marketing Jurídico (G06)')}</div></td>
              <td class="num">-${fmt(d.despesas_operacionais.comerciais_oab)}</td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>· Despesas Tecnológicas, Softwares Jurídicos e Segurança (G07)</span>${dreBtn('G07', 'Despesas Tecnológicas e Segurança (G07)')}</div></td>
              <td class="num">-${fmt(d.despesas_operacionais.tecnologicas)}</td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>· Outras Receitas / Despesas Operacionais (G08)</span>${dreBtn('G08', 'Outras Receitas e Despesas Operacionais (G08)')}</div></td>
              <td class="num">-${fmt(d.despesas_operacionais.outras)}</td>
            </tr>
            <tr class="dre-subtotal-row" style="background:#f1f5f9;">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(=) RESULTADO OPERACIONAL ANTES DOS EFEITOS FINANCEIROS (EBIT)</strong></span>${dreBtn('G01,G02,G03,G04,G05,G06,G07,G08', 'Resultado Operacional EBIT')}</div></td>
              <td class="num"><strong>${fmt(d.resultado_operacional_ebit)}</strong></td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>(+/-) Resultado Financeiro Líquido (Rendimentos - Tarifas/Juros) (G09)</span>${dreBtn('G09', 'Resultado Financeiro Líquido (G09)')}</div></td>
              <td class="num">-${fmt(d.resultado_financeiro)}</td>
            </tr>
            <tr class="dre-subtotal-row">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(=) RESULTADO ANTES DOS TRIBUTOS SOBRE O LUCRO (LAIR)</strong></span>${dreBtn('G01,G02,G03,G04,G05,G06,G07,G08,G09', 'Resultado Antes dos Tributos (LAIR)')}</div></td>
              <td class="num"><strong>${fmt(d.resultado_antes_tributos_lair)}</strong></td>
            </tr>
            <tr>
              <td style="padding-left:28px;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>(-) Provisão para IRPJ e CSLL sobre o Lucro (G10)</span>${dreBtn('G10', 'Provisão para IRPJ e CSLL (G10)')}</div></td>
              <td class="num">-${fmt(d.tributos_sobre_lucro)}</td>
            </tr>
            <tr class="dre-total-row">
              <td><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span><strong>(=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO/PREJUÍZO LÍQUIDO)</strong></span>${dreBtn('G01,G02,G03,G04,G05,G06,G07,G08,G09,G10', 'Resultado Líquido do Exercício')}</div></td>
              <td class="num"><strong style="font-size:16px;color:${d.resultado_liquido_exercicio >= 0 ? '#137333' : '#c5221f'};">${fmt(d.resultado_liquido_exercicio)}</strong></td>
            </tr>
            <tr>
              <td><em>Margem Líquida da Operação</em></td>
              <td class="num"><strong>${d.margem_liquida_pct}%</strong></td>
            </tr>
            <!-- CAC 1: CAC Marketing (G06) no Rodapé da DRE -->
            <tr id="dre-row-cac-mkt" class="dre-subtotal-row" style="background:#f8fafc;border-top:2px solid #cbd5e1;">
              <td>
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding:2px 0;">
                  <div>
                    <strong style="color:#010E38;font-size:13px;">1. CAC Comercial (Marketing e Captação • G06)</strong>
                    <div id="dre-row-cac-mkt-sub" style="font-size:11px;color:#64748b;margin-top:2px;">Marketing (G06: ${fmt(cac.despesas_comerciais_g06)}) / <span class="cac-val-mkt-cnt">${initialMkt}</span> contratos via marketing · Vol. fechado (info): <strong id="dre-row-cac-mkt-vol" style="color:#059669;">${fmt(mktValTotal)}</strong></div>
                  </div>
                  ${dreBtn('G06', 'CAC Comercial (Marketing • G06)')}
                </div>
              </td>
              <td class="num">
                <strong id="dre-row-cac-mkt-val" style="font-size:15px;color:#010E38;"><span style="white-space:nowrap;">${fmt(initialMkt > 0 ? cac.despesas_comerciais_g06 / initialMkt : 0)}</span> <small style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">/ contrato</small></strong>
                <div id="dre-row-cac-mkt-pct" style="font-size:11px;color:#475569;font-weight:600;">
                  ${d.receita_bruta > 0 ? ((cac.despesas_comerciais_g06 / d.receita_bruta) * 100).toFixed(2) : '0.00'}% da receita bruta
                </div>
              </td>
            </tr>

            <!-- CAC 2: CAC Atendimento do Escritório (Despesas do Escritório G04 a G08) -->
            <tr id="dre-row-cac-desk" class="dre-subtotal-row" style="background:#f1f5f9;border-top:1px solid #e2e8f0;">
              <td>
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding:2px 0;">
                  <div>
                    <strong style="color:#010E38;font-size:13px;">2. CAC Atendimento do Escritório (Despesas Operacionais e Overhead)</strong>
                    <div id="dre-row-cac-desk-sub" style="font-size:11px;color:#64748b;margin-top:2px;">Despesas operacionais (Total: ${fmt(cac_op.despesas_escritorio_total)}) / <span class="cac-val-desk-cnt">${initialDesk}</span> contratos via atendimento · Vol. fechado (info): <strong id="dre-row-cac-desk-vol" style="color:#925d00;">${fmt(deskValTotal)}</strong></div>
                  </div>
                  ${dreBtn('G04,G05,G06,G07,G08', 'Despesas Operacionais do Atendimento')}
                </div>
              </td>
              <td class="num">
                <strong id="dre-row-cac-desk-val" style="font-size:15px;color:#010E38;"><span style="white-space:nowrap;">${fmt(initialDesk > 0 ? cac_op.despesas_escritorio_total / initialDesk : 0)}</span> <small style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">/ contrato</small></strong>
                <div id="dre-row-cac-desk-pct" style="font-size:11px;color:#475569;font-weight:600;">
                  ${d.receita_bruta > 0 ? ((cac_op.despesas_escritorio_total / d.receita_bruta) * 100).toFixed(2) : '0.00'}% da receita bruta (Overhead)
                </div>
              </td>
            </tr>

            <!-- CAC 3: CAC Total Consolidado do Escritório (Contexto Geral DRE) -->
            <tr id="dre-row-cac-tot" class="dre-subtotal-row" style="background:#e8eef6;border-top:2px solid #010E38;">
              <td>
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding:2px 0;">
                  <div>
                    <strong style="color:#010E38;font-size:13px;">3. CAC Total Consolidado (Marketing + Atendimento • DRE Geral)</strong>
                    <div id="dre-row-cac-tot-sub" style="font-size:11px;color:#475569;margin-top:2px;">Custo global (${fmt(cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total)}) / <span class="cac-val-tot-cnt">${initialMkt + initialDesk}</span> contratos totais · Vol. fechado total (info): <strong id="dre-row-cac-tot-vol" style="color:#137333;">${fmt(totalContractsVal)}</strong></div>
                  </div>
                  ${dreBtn('G04,G05,G06,G07,G08', 'CAC Total Consolidado')}
                </div>
              </td>
              <td class="num">
                <strong id="dre-row-cac-tot-val" style="font-size:15px;color:#010E38;"><span style="white-space:nowrap;">${fmt((initialMkt + initialDesk) > 0 ? (cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / (initialMkt + initialDesk) : 0)}</span> <small style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">/ contrato</small></strong>
                <div id="dre-row-cac-tot-pct" style="font-size:11px;color:#010E38;font-weight:700;">
                  ${d.receita_bruta > 0 ? (((cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / d.receita_bruta) * 100).toFixed(2) : '0.00'}% da receita bruta
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Painel Integrado de CAC com Abas e Edição de Contratos -->
      <article class="panel" style="margin-top:16px;background:#ffffff;border:1px solid #dce4ee;border-radius:12px;padding:20px;">
        <div style="margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:14px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h3 style="margin:0;color:#010E38;font-size:17px;font-weight:800;">Indicadores de CAC & Sustentação de Contratos</h3>
            <span style="background:#010E38;color:#fff;font-size:11px;padding:3px 9px;border-radius:6px;font-weight:700;">DRE & Inteligência Comercial</span>
            <span style="background:#fef3c7;color:#b45309;font-size:11px;padding:3px 9px;border-radius:6px;font-weight:700;">Modo Informativo</span>
          </div>
          <p class="sub" style="margin:5px 0 0;font-size:12px;color:#64748b;">
            Diferenciação contábil e estratégica dos contratos gerados por <strong>Marketing</strong> e pelo <strong>Atendimento do Escritório</strong>, integrando os valores fechados de honorários em modo informativo para análise de ticket médio e retorno.
          </p>
        </div>

        <!-- Conteúdo das Abas / Blocos -->
        <div id="cac-tabs-content">
          <!-- Bloco 1: CAC Comercial (Marketing e Captação • Grupo G06) -->
          <div id="cac-card-mkt" class="cac-pane" style="margin-bottom:18px;padding:16px;background:#f8fafc;border:1px solid #dce4ee;border-left:4px solid #010E38;border-radius:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
              <div>
                <strong style="color:#010E38;font-size:14px;font-weight:700;">1. CAC Comercial (Marketing, Anúncios e Captação • Grupo G06)</strong>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Origem: Tráfego pago, campanhas digitais, conteúdo educativo OAB e prospecção institucional.</div>
              </div>
              <span style="font-size:11px;background:#e8eef6;color:#010E38;padding:2px 8px;border-radius:4px;font-weight:600;">Provimento CFOAB nº 205/2021</span>
            </div>
            
            <div class="cards">
              <article class="card">
                <div class="label">Investimento Comercial (G06)</div>
                <strong style="font-size:15.5px;color:#010E38;">${fmt(cac.despesas_comerciais_g06)}</strong>
                <div class="meta">Verba de marketing apurada</div>
              </article>

              <article class="card" style="border:2px solid #010E38;box-shadow:0 2px 8px rgba(1,14,56,0.08);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label" style="color:#010E38;font-weight:700;">Contratos via Marketing</span>
                  <span style="font-size:9.5px;background:#e8eef6;color:#010E38;padding:1px 5px;border-radius:4px;font-weight:700;">Automático</span>
                </div>
                <div style="display:flex;align-items:baseline;gap:5px;margin:2px 0;">
                  <strong style="font-size:18px;color:#010E38;font-weight:800;" class="cac-val-mkt-cnt">${initialMkt}</strong>
                  <span style="font-size:11px;color:#64748b;font-weight:600;">contratos apurados</span>
                </div>
                <div class="meta" style="color:#475569;">Origem: Marketing</div>
              </article>

              <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label" style="color:#059669;font-weight:700;">Volume Fechado (Mkt)</span>
                  <span style="font-size:9.5px;background:#dcfce7;color:#15803d;padding:1px 5px;border-radius:4px;font-weight:700;">Informativo</span>
                </div>
                <strong id="cac-mkt-card-vol" style="font-size:15.5px;color:#059669;display:block;margin:2px 0;">${fmt(mktValTotal)}</strong>
                <div class="meta">Ticket Médio: <strong id="cac-mkt-card-tkt" style="color:#059669;">${fmt(mktTicketMedio)}</strong></div>
              </article>

              <article class="card">
                <div class="label">CAC Marketing Unitário</div>
                <strong id="cac-mkt-card-unit" class="cac-unit-badge"><span class="cac-val-main">${fmt(initialMkt > 0 ? cac.despesas_comerciais_g06 / initialMkt : 0)}</span><span class="cac-val-suffix">/ contrato</span></strong>
                <div class="meta">Custo por contrato captado</div>
              </article>

              <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label">CAC / Vol. Fechado</span>
                  <span style="font-size:9.5px;background:#fef3c7;color:#b45309;padding:1px 5px;border-radius:4px;font-weight:700;">Informativo</span>
                </div>
                <strong id="cac-mkt-card-ratio" style="font-size:15.5px;color:#010E38;display:block;margin:2px 0;">${mktValTotal > 0 ? ((cac.despesas_comerciais_g06 / mktValTotal) * 100).toFixed(1) + '%' : '0.0%'}</strong>
                <div class="meta">Investimento s/ carteira</div>
              </article>

              <article class="card">
                <div class="label">% da Receita Bruta DRE</div>
                <strong id="cac-mkt-card-pct" style="font-size:15.5px;color:#010E38;display:block;margin:2px 0;">${d.receita_bruta > 0 ? ((cac.despesas_comerciais_g06 / d.receita_bruta) * 100).toFixed(2) : '0.00'}%</strong>
                <div class="meta">Referência: 3% a 10%</div>
              </article>
            </div>

            <div id="cac-mkt-status-box" style="font-size:12px;color:#334155;background:#fff;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;">
              <strong>Diagnóstico de Captação:</strong> <span id="cac-mkt-status-text">${esc(cac.status)}</span>
            </div>
          </div>

          <!-- Bloco 2: CAC do Atendimento do Escritório (Despesas Operacionais e de Atendimento • G04 a G08) -->
          <div id="cac-card-desk" class="cac-pane" style="margin-bottom:18px;padding:16px;background:#f8fafc;border:1px solid #dce4ee;border-left:4px solid #EBB52C;border-radius:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
              <div>
                <strong style="color:#010E38;font-size:14px;font-weight:700;">2. CAC Atendimento do Escritório (Despesas Operacionais e Overhead • G04 a G08)</strong>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Origem: Indicações, balcão, clientes da carteira, relacionamento e networking dos sócios.</div>
              </div>
              <span style="font-size:11px;background:#fff8e6;color:#925d00;padding:2px 8px;border-radius:4px;font-weight:600;">Overhead & Retenção</span>
            </div>

            <div class="cards">
              <article class="card">
                <div class="label">Despesas do Escritório</div>
                <strong style="font-size:15.5px;color:#010E38;">${fmt(cac_op.despesas_escritorio_total)}</strong>
                <div class="meta">G04 a G08 (pessoal, sede, TI)</div>
              </article>

              <article class="card" style="border:2px solid #EBB52C;box-shadow:0 2px 8px rgba(235,181,44,0.15);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label" style="color:#010E38;font-weight:700;">Contratos Atendimento</span>
                  <span style="font-size:9.5px;background:#fff8e6;color:#925d00;padding:1px 5px;border-radius:4px;font-weight:700;">Automático</span>
                </div>
                <div style="display:flex;align-items:baseline;gap:5px;margin:2px 0;">
                  <strong style="font-size:18px;color:#010E38;font-weight:800;" class="cac-val-desk-cnt">${initialDesk}</strong>
                  <span style="font-size:11px;color:#64748b;font-weight:600;">contratos apurados</span>
                </div>
                <div class="meta" style="color:#475569;">Origem: Atendimento</div>
              </article>

              <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label" style="color:#925d00;font-weight:700;">Volume Fechado (Atend.)</span>
                  <span style="font-size:9.5px;background:#fef3c7;color:#b45309;padding:1px 5px;border-radius:4px;font-weight:700;">Informativo</span>
                </div>
                <strong id="cac-desk-card-vol" style="font-size:15.5px;color:#925d00;display:block;margin:2px 0;">${fmt(deskValTotal)}</strong>
                <div class="meta">Ticket Médio: <strong id="cac-desk-card-tkt" style="color:#925d00;">${fmt(deskTicketMedio)}</strong></div>
              </article>

              <article class="card">
                <div class="label">CAC Atendimento Unitário</div>
                <strong id="cac-desk-card-unit" class="cac-unit-badge"><span class="cac-val-main">${fmt(initialDesk > 0 ? cac_op.despesas_escritorio_total / initialDesk : 0)}</span><span class="cac-val-suffix">/ contrato</span></strong>
                <div class="meta">Custo estrutural por contrato</div>
              </article>

              <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label">CAC / Vol. Fechado</span>
                  <span style="font-size:9.5px;background:#fef3c7;color:#b45309;padding:1px 5px;border-radius:4px;font-weight:700;">Informativo</span>
                </div>
                <strong id="cac-desk-card-ratio" style="font-size:15.5px;color:#010E38;display:block;margin:2px 0;">${deskValTotal > 0 ? ((cac_op.despesas_escritorio_total / deskValTotal) * 100).toFixed(1) + '%' : '0.0%'}</strong>
                <div class="meta">Custo operacional s/ contratos</div>
              </article>

              <article class="card">
                <div class="label">% Receita Bruta (Overhead)</div>
                <strong id="cac-desk-card-pct" style="font-size:15.5px;color:#010E38;display:block;margin:2px 0;">${d.receita_bruta > 0 ? ((cac_op.despesas_escritorio_total / d.receita_bruta) * 100).toFixed(2) : '0.00'}%</strong>
                <div class="meta">Referência: 30% a 50%</div>
              </article>
            </div>

            <div id="cac-desk-status-box" style="font-size:12px;color:#334155;background:#fff;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;">
              <strong>Diagnóstico Operacional:</strong> <span id="cac-desk-status-text">${esc(cac_op.status)}</span>
            </div>
          </div>

          <!-- Bloco 3: CAC Total Consolidado do Escritório (Contexto Geral DRE) -->
          <div id="cac-card-tot" class="cac-pane" style="padding:16px;background:#f0f4f9;border:1px solid #cbd5e1;border-left:4px solid #137333;border-radius:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
              <div>
                <strong style="color:#010E38;font-size:14px;font-weight:800;">3. CAC Total Consolidado do Escritório (Contexto Geral da DRE)</strong>
                <div style="font-size:11px;color:#475569;margin-top:2px;">
                  Consolidação macroeconômica da banca que une a captação comercial e o suporte operacional sobre a totalidade de contratos.
                </div>
              </div>
              <span style="font-size:11px;background:#e6f4ea;color:#137333;padding:2px 8px;border-radius:4px;font-weight:700;">Visão Unificada DRE</span>
            </div>

            <div class="cards">
              <article class="card">
                <div class="label">Investimento Global (G04 a G08)</div>
                <strong id="cac-tot-card-exp" style="font-size:15.5px;color:#010E38;">${fmt(cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total)}</strong>
                <div class="meta">Marketing + Despesas Escritório</div>
              </article>

              <article class="card">
                <div class="label">Total de Contratos</div>
                <div style="display:flex;align-items:baseline;gap:5px;margin:2px 0;">
                  <strong id="cac-tot-card-cnt" style="font-size:17px;color:#010E38;font-weight:800;">${initialMkt + initialDesk}</strong>
                  <span style="font-size:11px;color:#64748b;font-weight:600;">contratos totais</span>
                </div>
                <div class="meta"><span class="cac-val-mkt-cnt">${initialMkt}</span> mkt + <span class="cac-val-desk-cnt">${initialDesk}</span> atend.</div>
              </article>

              <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label" style="color:#137333;font-weight:700;">Volume Total Fechado</span>
                  <span style="font-size:9.5px;background:#e6f4ea;color:#137333;padding:1px 5px;border-radius:4px;font-weight:700;">Informativo</span>
                </div>
                <strong id="cac-tot-card-vol" style="font-size:15.5px;color:#137333;display:block;margin:2px 0;">${fmt(totalContractsVal)}</strong>
                <div class="meta">Ticket Médio Geral: <strong id="cac-tot-card-tkt" style="color:#137333;">${fmt(totalTicketMedio)}</strong></div>
              </article>

              <article class="card" style="border:2px solid #137333;box-shadow:0 2px 8px rgba(19,115,51,0.12);">
                <div class="label" style="color:#137333;font-weight:700;">CAC Total Consolidado</div>
                <strong id="cac-tot-card-unit" class="cac-unit-badge"><span class="cac-val-main">${fmt((initialMkt + initialDesk) > 0 ? (cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / (initialMkt + initialDesk) : 0)}</span><span class="cac-val-suffix">/ contrato</span></strong>
                <div class="meta" style="color:#137333;font-weight:600;">Custo médio total por contrato</div>
              </article>

              <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="label">CAC Global / Vol. Fechado</span>
                  <span style="font-size:9.5px;background:#fef3c7;color:#b45309;padding:1px 5px;border-radius:4px;font-weight:700;">Informativo</span>
                </div>
                <strong id="cac-tot-card-ratio" style="font-size:15.5px;color:#010E38;display:block;margin:2px 0;">${totalContractsVal > 0 ? (((cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / totalContractsVal) * 100).toFixed(1) + '%' : '0.0%'}</strong>
                <div class="meta">Custo total s/ carteira</div>
              </article>

              <article class="card">
                <div class="label">% Total s/ Receita Bruta</div>
                <strong id="cac-tot-card-pct" style="font-size:15.5px;color:#010E38;display:block;margin:2px 0;">${d.receita_bruta > 0 ? (((cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / d.receita_bruta) * 100).toFixed(2) : '0.00'}%</strong>
                <div class="meta">Captação + Suporte</div>
              </article>
            </div>

            <!-- Tabela Comparativa de Canais e Eficiência -->
            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                <strong style="font-size:13px;color:#010E38;">Quadro Comparativo por Canal de Originação (Contexto DRE & Fechamentos):</strong>
                <span class="pill" style="font-size:10px;font-weight:700;background:#fef3c7;color:#b45309;">Modo Informativo Ativo</span>
              </div>
              <div class="tablewrap">
                <table style="font-size:12px;margin:0;">
                  <thead>
                    <tr style="background:#f8fafc;">
                      <th>Canal / Origem</th>
                      <th class="num">Investimento Alocado</th>
                      <th class="num">Contratos Atribuídos</th>
                      <th class="num">Vol. Fechado (Info)</th>
                      <th class="num">Ticket Médio</th>
                      <th class="num">CAC Unitário do Canal</th>
                      <th class="num">% s/ Receita Bruta</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>1. Canal Marketing (G06)</strong> <small style="display:block;color:#64748b;">Anúncios, SEO, mídias permitidas OAB</small></td>
                      <td class="num">${fmt(cac.despesas_comerciais_g06)}</td>
                      <td class="num"><strong class="cac-val-mkt-cnt">${initialMkt}</strong></td>
                      <td class="num"><strong id="cac-comp-mkt-vol" style="color:#059669;">${fmt(mktValTotal)}</strong></td>
                      <td class="num" id="cac-comp-mkt-tkt">${fmt(mktTicketMedio)}</td>
                      <td class="num"><strong id="cac-comp-mkt-unit">${fmt(initialMkt > 0 ? cac.despesas_comerciais_g06 / initialMkt : 0)}</strong></td>
                      <td class="num" id="cac-comp-mkt-pct">${d.receita_bruta > 0 ? ((cac.despesas_comerciais_g06 / d.receita_bruta) * 100).toFixed(2) : '0.00'}%</td>
                    </tr>
                    <tr>
                      <td><strong>2. Atendimento do Escritório</strong> <small style="display:block;color:#64748b;">Indicações, balcão e base interna</small></td>
                      <td class="num">${fmt(cac_op.despesas_escritorio_total)}</td>
                      <td class="num"><strong class="cac-val-desk-cnt">${initialDesk}</strong></td>
                      <td class="num"><strong id="cac-comp-desk-vol" style="color:#925d00;">${fmt(deskValTotal)}</strong></td>
                      <td class="num" id="cac-comp-desk-tkt">${fmt(deskTicketMedio)}</td>
                      <td class="num"><strong id="cac-comp-desk-unit">${fmt(initialDesk > 0 ? cac_op.despesas_escritorio_total / initialDesk : 0)}</strong></td>
                      <td class="num" id="cac-comp-desk-pct">${d.receita_bruta > 0 ? ((cac_op.despesas_escritorio_total / d.receita_bruta) * 100).toFixed(2) : '0.00'}%</td>
                    </tr>
                    <tr style="background:#eef6fc;font-weight:700;">
                      <td><strong>(=) CAC Médio Geral da Banca</strong> <small style="display:block;color:#010E38;">Consolidação geral da DRE</small></td>
                      <td class="num">${fmt(cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total)}</td>
                      <td class="num"><strong class="cac-val-tot-cnt">${initialMkt + initialDesk}</strong></td>
                      <td class="num"><strong id="cac-comp-tot-vol" style="color:#137333;">${fmt(totalContractsVal)}</strong></td>
                      <td class="num" id="cac-comp-tot-tkt">${fmt(totalTicketMedio)}</td>
                      <td class="num"><strong id="cac-comp-tot-unit" style="color:#010E38;">${fmt((initialMkt + initialDesk) > 0 ? (cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / (initialMkt + initialDesk) : 0)}</strong></td>
                      <td class="num" id="cac-comp-tot-pct" style="color:#010E38;">${d.receita_bruta > 0 ? (((cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / d.receita_bruta) * 100).toFixed(2) : '0.00'}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style="font-size:11px;color:#64748b;margin-top:8px;">* <strong>Modo Informativo:</strong> Os volumes fechados e tickets médios refletem os valores declarados no cadastro de contratos para acompanhamento gerencial e inteligência de CAC, sem alterar a receita apurada da DRE.</div>
            </div>

            <div id="cac-tot-status-box" style="font-size:12px;color:#1e3a5f;background:#fff;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;">
              <strong>Parecer Estratégico Consolidado:</strong> <span id="cac-tot-status-text">
                ${((initialMkt + initialDesk) > 0) ? (
                  ((((cac.despesas_comerciais_g06 + cac_op.despesas_escritorio_total) / d.receita_bruta) * 100) <= 40.0) 
                  ? 'Equilíbrio financeiro e alta sustentabilidade: o custo conjunto de captação e atendimento consome menos de 40% da receita bruta.' 
                  : 'Custo global conjunto consome mais de 40% da receita; acompanhe a taxa de conversão dos novos contratos.'
                ) : 'Sem contratos no período para composição do CAC médio consolidado.'}
              </span>
            </div>
          </div>
        </div>
      </article>

      ${(p && (Math.abs(p.total || 0) > 0 || (p.detalhes && p.detalhes.length > 0))) ? `
      <!-- Operações Segregadas Não-DRE (G99) -->
      <div class="panel" style="margin-top:16px;border-left:4px solid #EBB52C;background:#fffdfa;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;color:#010E38;">Operações Patrimoniais e Transitórias (Grupo G99 - Fora da DRE)</h3>
          <span style="font-size:14px;font-weight:bold;">Total: ${fmt(p.total)}</span>
        </div>
        <p class="sub" style="margin:6px 0 10px 0;">${esc(p.aviso)}</p>
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Operação Não-DRE</th>
                <th class="num">Valor Movimentado</th>
              </tr>
            </thead>
            <tbody>
              ${(p.detalhes || []).map(x => `
                <tr>
                  <td><strong>${esc(x.nature_code)}</strong></td>
                  <td>${esc(x.nature_name)}</td>
                  <td class="num"><strong>${fmt(x.total_reais)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
      <!-- Bloco de Assinaturas Formais para Relatório A4 -->
      <div class="print-signatures">
        <div class="signature-box">
          <div style="font-weight:bold;color:#010E38;margin-bottom:3px;">Sócio Administrador / Diretor Financeiro</div>
          <div style="color:#465575;font-size:8pt;">OAB / Responsabilidade Técnica</div>
        </div>
        <div class="signature-box">
          <div style="font-weight:bold;color:#010E38;margin-bottom:3px;">Controladoria e Gestão Contábil</div>
          <div style="color:#465575;font-size:8pt;">CRC / Apuração de Resultados</div>
        </div>
      </div>
    `;

    // Função de Recálculo Dinâmico de CAC
    function runCACRecalc() {
      const mktCount = initialMkt;
      const deskCount = initialDesk;
      const totCount = mktCount + deskCount;

      const mktExp = cac.despesas_comerciais_g06 || 0;
      const deskExp = cac_op.despesas_escritorio_total || 0;
      const totExp = mktExp + deskExp;
      const recBruta = d.receita_bruta || 0;

      const mktUnit = mktCount > 0 ? (mktExp / mktCount) : 0;
      const deskUnit = deskCount > 0 ? (deskExp / deskCount) : 0;
      const totUnit = totCount > 0 ? (totExp / totCount) : 0;

      const mktPct = recBruta > 0 ? ((mktExp / recBruta) * 100).toFixed(2) : '0.00';
      const deskPct = recBruta > 0 ? ((deskExp / recBruta) * 100).toFixed(2) : '0.00';
      const totPct = recBruta > 0 ? ((totExp / recBruta) * 100).toFixed(2) : '0.00';

      // Atualizar contadores nos textos
      document.querySelectorAll('.cac-val-mkt-cnt').forEach(el => el.textContent = mktCount);
      document.querySelectorAll('.cac-val-desk-cnt').forEach(el => el.textContent = deskCount);
      document.querySelectorAll('.cac-val-tot-cnt').forEach(el => el.textContent = totCount);

      // Bloco 1: Marketing
      const elMktUnit = $('#cac-mkt-card-unit');
      if (elMktUnit) elMktUnit.innerHTML = `<span class="cac-val-main">${fmt(mktUnit)}</span><span class="cac-val-suffix">/ contrato</span>`;
      const elMktPct = $('#cac-mkt-card-pct');
      if (elMktPct) elMktPct.textContent = `${mktPct}%`;
      const elMktVol = $('#cac-mkt-card-vol');
      if (elMktVol) elMktVol.textContent = fmt(mktValTotal);
      const elMktTkt = $('#cac-mkt-card-tkt');
      if (elMktTkt) elMktTkt.textContent = fmt(mktTicketMedio);
      const elMktRatio = $('#cac-mkt-card-ratio');
      if (elMktRatio) elMktRatio.textContent = mktValTotal > 0 ? ((mktExp / mktValTotal) * 100).toFixed(1) + '%' : '0.0%';

      let mktStatus = 'Dentro da faixa recomendada (3% a 10% da receita bruta)';
      if (mktCount === 0) mktStatus = 'Nenhum contrato atribuído à captação de marketing no período.';
      else if (parseFloat(mktPct) > 20) mktStatus = 'Investimento comercial superior a 20% da receita bruta; avalie o CAC por campanha.';
      else if (parseFloat(mktPct) > 10) mktStatus = 'Atenção ao investimento comercial (10% a 20% da receita bruta).';
      const elMktStatus = $('#cac-mkt-status-text');
      if (elMktStatus) elMktStatus.textContent = mktStatus;

      // Bloco 2: Atendimento
      const elDeskUnit = $('#cac-desk-card-unit');
      if (elDeskUnit) elDeskUnit.innerHTML = `<span class="cac-val-main">${fmt(deskUnit)}</span><span class="cac-val-suffix">/ contrato</span>`;
      const elDeskPct = $('#cac-desk-card-pct');
      if (elDeskPct) elDeskPct.textContent = `${deskPct}%`;
      const elDeskVol = $('#cac-desk-card-vol');
      if (elDeskVol) elDeskVol.textContent = fmt(deskValTotal);
      const elDeskTkt = $('#cac-desk-card-tkt');
      if (elDeskTkt) elDeskTkt.textContent = fmt(deskTicketMedio);
      const elDeskRatio = $('#cac-desk-card-ratio');
      if (elDeskRatio) elDeskRatio.textContent = deskValTotal > 0 ? ((deskExp / deskValTotal) * 100).toFixed(1) + '%' : '0.0%';

      let deskStatus = 'Faixa equilibrada de sustentação operacional para escritórios (30% a 50%)';
      if (deskCount === 0) deskStatus = 'Nenhum contrato atribuído ao atendimento/balcão no período.';
      else if (parseFloat(deskPct) > 65) deskStatus = 'Sobrecarga operacional crítica (> 65% da receita consumida em estrutura).';
      else if (parseFloat(deskPct) > 50) deskStatus = 'Atenção ao custo estrutural e despesas administrativas (50% a 65%).';
      else if (parseFloat(deskPct) <= 30) deskStatus = 'Estrutura operacional altamente enxuta e escalável (<= 30% da receita bruta).';
      const elDeskStatus = $('#cac-desk-status-text');
      if (elDeskStatus) elDeskStatus.textContent = deskStatus;

      // Bloco 3: CAC Total
      const elTotCnt = $('#cac-tot-card-cnt');
      if (elTotCnt) elTotCnt.textContent = `${totCount} contratos`;
      const elTotUnit = $('#cac-tot-card-unit');
      if (elTotUnit) elTotUnit.innerHTML = `<span class="cac-val-main">${fmt(totUnit)}</span><span class="cac-val-suffix">/ contrato</span>`;
      const elTotPct = $('#cac-tot-card-pct');
      if (elTotPct) elTotPct.textContent = `${totPct}%`;
      const elTotVol = $('#cac-tot-card-vol');
      if (elTotVol) elTotVol.textContent = fmt(totalContractsVal);
      const elTotTkt = $('#cac-tot-card-tkt');
      if (elTotTkt) elTotTkt.textContent = fmt(totalTicketMedio);
      const elTotRatio = $('#cac-tot-card-ratio');
      if (elTotRatio) elTotRatio.textContent = totalContractsVal > 0 ? ((totExp / totalContractsVal) * 100).toFixed(1) + '%' : '0.0%';

      let totStatus = 'Equilíbrio financeiro e alta sustentabilidade (<= 40% da receita em aquisição e suporte).';
      if (totCount === 0) totStatus = 'Sem contratos no período para rateio do CAC total consolidado.';
      else if (parseFloat(totPct) > 60) totStatus = 'Atenção: custos globais de captação e sustentação superam 60% da receita bruta.';
      else if (parseFloat(totPct) > 40) totStatus = 'Faixa moderada de sustentação global dos contratos (40% a 60% da receita bruta).';
      const elTotStatus = $('#cac-tot-status-text');
      if (elTotStatus) elTotStatus.textContent = totStatus;

      // Tabela Comparativa
      const elCompMktVol = $('#cac-comp-mkt-vol');
      if (elCompMktVol) elCompMktVol.textContent = fmt(mktValTotal);
      const elCompMktTkt = $('#cac-comp-mkt-tkt');
      if (elCompMktTkt) elCompMktTkt.textContent = fmt(mktTicketMedio);
      const elCompMktUnit = $('#cac-comp-mkt-unit');
      if (elCompMktUnit) elCompMktUnit.textContent = fmt(mktUnit);
      const elCompMktPct = $('#cac-comp-mkt-pct');
      if (elCompMktPct) elCompMktPct.textContent = `${mktPct}%`;

      const elCompDeskVol = $('#cac-comp-desk-vol');
      if (elCompDeskVol) elCompDeskVol.textContent = fmt(deskValTotal);
      const elCompDeskTkt = $('#cac-comp-desk-tkt');
      if (elCompDeskTkt) elCompDeskTkt.textContent = fmt(deskTicketMedio);
      const elCompDeskUnit = $('#cac-comp-desk-unit');
      if (elCompDeskUnit) elCompDeskUnit.textContent = fmt(deskUnit);
      const elCompDeskPct = $('#cac-comp-desk-pct');
      if (elCompDeskPct) elCompDeskPct.textContent = `${deskPct}%`;

      const elCompTotVol = $('#cac-comp-tot-vol');
      if (elCompTotVol) elCompTotVol.textContent = fmt(totalContractsVal);
      const elCompTotTkt = $('#cac-comp-tot-tkt');
      if (elCompTotTkt) elCompTotTkt.textContent = fmt(totalTicketMedio);
      const elCompTotUnit = $('#cac-comp-tot-unit');
      if (elCompTotUnit) elCompTotUnit.textContent = fmt(totUnit);
      const elCompTotPct = $('#cac-comp-tot-pct');
      if (elCompTotPct) elCompTotPct.textContent = `${totPct}%`;

      // Atualizar Linhas da DRE (Rodapé)
      const elDreMktVal = $('#dre-row-cac-mkt-val');
      if (elDreMktVal) elDreMktVal.innerHTML = `<span style="white-space:nowrap;">${fmt(mktUnit)}</span> <small style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">/ contrato</small>`;
      const elDreMktPct = $('#dre-row-cac-mkt-pct');
      if (elDreMktPct) elDreMktPct.textContent = `${mktPct}% da receita bruta`;
      const elDreMktVol = $('#dre-row-cac-mkt-vol');
      if (elDreMktVol) elDreMktVol.textContent = fmt(mktValTotal);

      const elDreDeskVal = $('#dre-row-cac-desk-val');
      if (elDreDeskVal) elDreDeskVal.innerHTML = `<span style="white-space:nowrap;">${fmt(deskUnit)}</span> <small style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">/ contrato</small>`;
      const elDreDeskPct = $('#dre-row-cac-desk-pct');
      if (elDreDeskPct) elDreDeskPct.textContent = `${deskPct}% da receita bruta (Overhead)`;
      const elDreDeskVol = $('#dre-row-cac-desk-vol');
      if (elDreDeskVol) elDreDeskVol.textContent = fmt(deskValTotal);

      const elDreTotVal = $('#dre-row-cac-tot-val');
      if (elDreTotVal) elDreTotVal.innerHTML = `<span style="white-space:nowrap;">${fmt(totUnit)}</span> <small style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;">/ contrato</small>`;
      const elDreTotPct = $('#dre-row-cac-tot-pct');
      if (elDreTotPct) elDreTotPct.textContent = `${totPct}% da receita bruta`;
      const elDreTotVol = $('#dre-row-cac-tot-vol');
      if (elDreTotVol) elDreTotVol.textContent = fmt(totalContractsVal);
    }

    // Executa recálculo automático com base nos contratos cadastrados
    runCACRecalc();
  } catch (err) {
    container.innerHTML = `<p class="negative">${esc(err.message)}</p>`;
  }
}

$('#dre-complete-refresh')?.addEventListener('click', refreshCompleteDRE);
$('#dre-complete-month')?.addEventListener('change', refreshCompleteDRE);

// Handler para Salvar DRE como arquivo executivo standalone A4
$('#dre-save-btn')?.addEventListener('click', () => {
  const container = $('#dre-complete-container');
  if (!container) return;

  const monthVal = $('#dre-complete-month')?.value || 'geral';
  const officeName = user?.office || 'Escritório de Advocacia';
  const fileName = `DRE_Demonstrativo_${monthVal.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;

  const brandStyles = document.getElementById('brandkit-v23')?.innerHTML || '';
  const naturesStyles = document.getElementById('natures-v30')?.innerHTML || '';
  const printStyles = document.getElementById('dre-print-style')?.innerHTML || '';

  const clone = container.cloneNode(true);
  
  // Remover botões internos do clone
  clone.querySelectorAll('#btn-cac-reset-contracts, .cac-tab-btn').forEach(b => b.remove());

  // Assegurar que todas as seções de CAC estejam visíveis no arquivo salvo
  clone.querySelectorAll('.cac-pane').forEach(p => p.style.display = 'block');

  const htmlDoc = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DRE - Demonstração do Resultado - ${esc(officeName)} - ${esc(monthVal)}</title>
  <style>
    ${brandStyles}
    ${naturesStyles}
    ${printStyles}
    body {
      background: #f1f4f9;
      color: #010E38;
      font-family: Montserrat, Inter, system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 24px;
    }
    .report-sheet {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #dce1eb;
      border-radius: 12px;
      padding: 32px 36px;
      box-shadow: 0 4px 20px rgba(1, 14, 56, 0.08);
    }
    .print-header, .print-signatures {
      display: block !important;
    }
    .report-actions {
      max-width: 960px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .report-actions button {
      background: #010E38;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .report-actions button:hover {
      background: #15265a;
    }
    @media print {
      body {
        background: #fff !important;
        padding: 0 !important;
      }
      .report-actions {
        display: none !important;
      }
      .report-sheet {
        max-width: 100% !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="report-actions">
    <div>
      <strong style="color:#010E38;">Relatório Salvo da DRE</strong>
      <span style="color:#465575;font-size:12px;margin-left:8px;">${esc(officeName)} · Competência ${esc(monthVal)}</span>
    </div>
    <button onclick="window.print()">Imprimir / Salvar PDF (A4)</button>
  </div>
  <div class="report-sheet">
    ${clone.innerHTML}
  </div>
</body>
</html>`;

  const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

  const feedEl = $('#request-feedback');
  if (feedEl) {
    feedEl.textContent = `Demonstrativo DRE da competência ${monthVal} salvo com sucesso no arquivo ${fileName}.`;
    feedEl.classList.remove('error');
    feedEl.hidden = false;
    setTimeout(() => { feedEl.hidden = true; }, 5000);
  }
});

// Handler para Imprimir A4
$('#dre-print-btn')?.addEventListener('click', () => {
  goto('dre');
  setTimeout(() => {
    window.print();
  }, 150);
});

const prevRefreshFinanceWithNatures = refreshFinance;
refreshFinance = async function() {
  await prevRefreshFinanceWithNatures();
  await refreshNatures();
  if (typeof refreshCompleteDRE === 'function') await refreshCompleteDRE();
};

// ==========================================
// Módulo de Edição de Lançamentos (Pop-up Modal)
// ==========================================
function populateEditEntryNatureSelect(currentKind, selectedNatureId) {
  const selectEl = $('#edit-entry-nature');
  if (!selectEl) return;
  const filtered = (operationNatures || []).filter(n => n.is_active && (n.operation_type === currentKind || (currentKind === 'receita' && n.operation_type === 'receita')));
  selectEl.innerHTML = '<option value="">Selecione a natureza...</option>' +
    filtered.map(n => `<option value="${esc(n.id)}" ${n.id === selectedNatureId ? 'selected' : ''}>${esc(n.code)} · ${esc(n.name)}</option>`).join('');
}

function openEditEntryModal(id) {
  const e = (entries || []).find(x => String(x.id) === String(id));
  if (!e) {
    alert('Lançamento não encontrado.');
    return;
  }
  const modal = $('#entry-edit-modal');
  if (!modal) return;

  $('#edit-entry-id').value = e.id;
  $('#edit-entry-data').value = e.data || '';
  $('#edit-entry-valor').value = Number(e.valor || 0).toFixed(2);
  $('#edit-entry-tipo').value = e.tipo || 'receita';
  $('#edit-entry-descricao').value = e.descricao || '';
  $('#edit-entry-msg').textContent = '';

  // Áreas disponíveis
  const areaSelect = $('#edit-entry-area');
  if (areaSelect) {
    let areasList = (availableAreas && availableAreas.length)
      ? availableAreas.map(a => a.name)
      : ['Trabalhista', 'Cível', 'Previdenciário', 'Empresarial', 'Tributário', 'Família e Sucessões', 'Criminal', 'Administrativo', 'Ambiental', 'Outros'];
    if (e.area && !areasList.includes(e.area)) areasList.unshift(e.area);
    areaSelect.innerHTML = areasList.map(a => `<option value="${esc(a)}" ${a === e.area ? 'selected' : ''}>${esc(a)}</option>`).join('');
  }

  // Naturezas e Subcategorias correspondentes ao tipo
  populateEditEntryNatureSelect(e.tipo || 'receita', e.nature_id);
  updateSubcategoriesSelect(e.nature_id, $('#edit-entry-subcategory'), e.subcategory_id);

  try {
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
  } catch (err) {
    modal.setAttribute('open', '');
  }
  $('#edit-entry-descricao')?.focus();
}

// Abertura do modal ao clicar em [data-edit-entry]
document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-edit-entry]');
  if (btn) {
    ev.preventDefault();
    if (!canWrite()) {
      alert('Seu usuário está em modo somente leitura.');
      return;
    }
    openEditEntryModal(btn.dataset.editEntry);
  }
});

// Mudança no tipo (receita / custo / despesa / patrimonial) dentro do modal
$('#edit-entry-tipo')?.addEventListener('change', (e) => {
  populateEditEntryNatureSelect(e.target.value, null);
  updateSubcategoriesSelect(null, $('#edit-entry-subcategory'));
});

// Mudança na classificação/natureza dentro do modal
$('#edit-entry-nature')?.addEventListener('change', (e) => {
  updateSubcategoriesSelect(e.target.value, $('#edit-entry-subcategory'));
});

// Fechamento do modal
$('#entry-edit-close')?.addEventListener('click', () => $('#entry-edit-modal')?.close());
$('#entry-edit-cancel')?.addEventListener('click', () => $('#entry-edit-modal')?.close());

// Submissão do formulário de edição
$('#entry-edit-form')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!canWrite()) return;
  const id = $('#edit-entry-id')?.value;
  const valor = Number($('#edit-entry-valor')?.value);
  if (!(valor > 0 && Number.isFinite(valor))) {
    $('#edit-entry-msg').textContent = 'Valor inválido.';
    return;
  }
  const submitBtn = $('#edit-entry-submit');
  if (submitBtn) submitBtn.disabled = true;
  $('#edit-entry-msg').textContent = 'Salvando alterações...';
  try {
    await api('/entries/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify({
        data: $('#edit-entry-data').value,
        descricao: $('#edit-entry-descricao').value.trim(),
        tipo: $('#edit-entry-tipo').value,
        area: $('#edit-entry-area').value,
        valor: valor.toFixed(2),
        nature_id: $('#edit-entry-nature')?.value || null,
        subcategory_id: $('#edit-entry-subcategory')?.value || null
      })
    });
    $('#entry-edit-modal')?.close();
    await refresh();
  } catch (err) {
    $('#edit-entry-msg').textContent = 'Erro ao salvar: ' + err.message;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ==========================================
// Módulo de Detalhamento dos Lançamentos da DRE
// ==========================================
let currentDreItemsCache = [];

async function openDreItemsModal(targetGroups, title) {
  const modal = $('#dre-items-modal');
  if (!modal) return;
  const month = $('#dre-complete-month')?.value || '';
  
  $('#dre-items-title').innerHTML = `<span style="background:#e8eef6;color:#010E38;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;">📋</span> ${esc(title || 'Lançamentos do Resultado')}`;
  $('#dre-items-group-label').textContent = `Resultado: ${title || targetGroups}`;
  $('#dre-items-period-label').textContent = month ? `Competência: ${month}` : 'Todas as competências (Visão acumulada)';
  if ($('#dre-items-search')) $('#dre-items-search').value = '';
  $('#dre-items-count-badge').textContent = 'Consultando...';
  $('#dre-items-table-body').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Carregando lançamentos do servidor...</td></tr>';
  $('#dre-items-total-info').textContent = '';

  try {
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
  } catch (err) {
    modal.setAttribute('open', '');
  }

  try {
    const url = `/dre/items?group=${encodeURIComponent(targetGroups)}${month ? `&month=${encodeURIComponent(month)}` : ''}`;
    const res = await api(url);
    currentDreItemsCache = res.items || [];
    renderDreItemsTable();
  } catch (err) {
    $('#dre-items-table-body').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#c5221f;">Erro ao carregar lançamentos: ${esc(err.message)}</td></tr>`;
    $('#dre-items-count-badge').textContent = 'Erro';
  }
}

function renderDreItemsTable() {
  const q = ($('#dre-items-search')?.value || '').trim().toLowerCase();
  const filtered = currentDreItemsCache.filter(item => {
    if (!q) return true;
    return (item.description || '').toLowerCase().includes(q) ||
           (item.area || '').toLowerCase().includes(q) ||
           (item.nature_name || '').toLowerCase().includes(q) ||
           (item.nature_code || '').toLowerCase().includes(q) ||
           (item.subcategory_name || '').toLowerCase().includes(q) ||
           String(item.amount).includes(q);
  });

  const total = filtered.reduce((acc, it) => acc + Number(it.amount || 0), 0);
  $('#dre-items-count-badge').textContent = `${filtered.length} lançamento(s)`;
  $('#dre-items-total-info').textContent = `Total dos itens listados: ${money(total)}`;

  const tbody = $('#dre-items-table-body');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Nenhum lançamento encontrado para este resultado no período selecionado.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '—';
    const isEntry = (item.source === 'entry');
    const badgeSource = isEntry
      ? '<span style="background:#e8f0fe;color:#174ea6;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;">Lançamento</span>'
      : '<span style="background:#fef7e0;color:#b06000;font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;">Título</span>';

    const subText = item.subcategory_name && item.subcategory_name !== '—'
      ? `<br><small style="color:#64748b;">🏷️ ${esc(item.subcategory_name)}</small>`
      : '';

    const editBtn = isEntry && canWrite()
      ? `<button type="button" class="btn-action edit" data-dre-edit-entry="${esc(item.id)}" title="Editar este lançamento" style="padding:3px 7px;font-size:11px;"><span>✏️</span> Editar</button>`
      : '<span style="color:#94a3b8;font-size:11px;">—</span>';

    return `
      <tr>
        <td style="white-space:nowrap;font-size:12px;">${esc(dateFmt)}</td>
        <td><strong>${esc(item.description)}</strong></td>
        <td>${esc(item.area || 'Geral')}</td>
        <td style="font-size:12px;">
          <span>${esc(item.nature_code)} · ${esc(item.nature_name)}</span>
          ${subText}
        </td>
        <td>${badgeSource}</td>
        <td class="num" style="font-weight:700;">${money(item.amount)}</td>
        <td style="text-align:center;">${editBtn}</td>
      </tr>
    `;
  }).join('');
}

// Event delegation para os botões contextuais da DRE
document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-dre-target]');
  if (btn) {
    ev.preventDefault();
    openDreItemsModal(btn.dataset.dreTarget, btn.dataset.dreTitle || 'Detalhamento');
    return;
  }

  const editEntryBtn = ev.target.closest('[data-dre-edit-entry]');
  if (editEntryBtn) {
    ev.preventDefault();
    $('#dre-items-modal')?.close();
    openEditEntryModal(editEntryBtn.dataset.dreEditEntry);
  }
});

$('#dre-items-search')?.addEventListener('input', renderDreItemsTable);
$('#dre-items-close')?.addEventListener('click', () => $('#dre-items-modal')?.close());
$('#dre-items-cancel')?.addEventListener('click', () => $('#dre-items-modal')?.close());

/* =========================================================================
   MÓDULO: SAÚDE DO ATENDIMENTO & DIAGNÓSTICO DE GARGALOS (FUNIL COMERCIAL)
   Inspirado no motor de fechamento semanal & inteligência comercial Venda+ Tech
   ========================================================================= */

const HEALTH_STORAGE_KEY_PREFIX = 'dre_commercial_health_v1_';

function getHealthStorageKey() {
  const office = user?.office || 'default';
  return HEALTH_STORAGE_KEY_PREFIX + office;
}

function loadCommercialHealthStore() {
  try {
    const raw = localStorage.getItem(getHealthStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Falha ao ler dre_commercial_health_v1:', e);
    return {};
  }
}

function saveCommercialHealthStore(store) {
  try {
    localStorage.setItem(getHealthStorageKey(), JSON.stringify(store));
  } catch (e) {
    console.warn('Falha ao salvar dre_commercial_health_v1:', e);
  }
}

function getDefaultHealthData(month) {
  return {
    month: month || new Date().toISOString().slice(0, 7),
    leads: 45,
    qualified: 32,
    unqualified: 13,
    scheduled: 20,
    conducted: 16,
    proposals: 12,
    contracts: 5,
    sla: 12,
    loss_reason: 'Preço / Honorários',
    follow_up: 8,
    sources: {
      ads: 18,
      organic: 9,
      referral: 14,
      other: 4
    }
  };
}

function getCommercialHealthForMonth(month) {
  const store = loadCommercialHealthStore();
  const targetMonth = month || $('#health-month-select')?.value || new Date().toISOString().slice(0, 7);
  if (store[targetMonth]) {
    return { ...store[targetMonth], month: targetMonth };
  }
  const defaults = getDefaultHealthData(targetMonth);
  store[targetMonth] = defaults;
  saveCommercialHealthStore(store);
  return defaults;
}

function calcCommercialInsights(d) {
  const leads = Math.max(0, Number(d.leads || 0));
  const qualified = Math.max(0, Number(d.qualified || 0));
  const unqualified = Math.max(0, Number(d.unqualified || 0));
  const scheduled = Math.max(0, Number(d.scheduled || 0));
  const conducted = Math.max(0, Number(d.conducted || 0));
  const proposals = Math.max(0, Number(d.proposals || 0));
  const contractCount = Math.max(0, Number(d.contracts || 0));
  const sla = Math.max(1, Number(d.sla || 15));
  const lossReason = d.loss_reason || 'Preço / Honorários';
  const followUp = Math.max(0, Number(d.follow_up || 0));

  // Taxas de conversão entre etapas adjacentes
  const rQual = leads > 0 ? (qualified / leads) * 100 : 0;
  const rSched = qualified > 0 ? (scheduled / qualified) * 100 : 0;
  const rCond = scheduled > 0 ? (conducted / scheduled) * 100 : 0;
  const rProp = conducted > 0 ? (proposals / conducted) * 100 : 0;
  const rCont = proposals > 0 ? (contractCount / proposals) * 100 : 0;
  const overallRate = leads > 0 ? (contractCount / leads) * 100 : 0;

  // Análise do ponto crítico (maior taxa de ruptura relativa)
  const stages = [
    { id: 'qual', name: 'Qualificação de Entrada', from: leads, to: qualified, rate: rQual, drop: 100 - rQual, desc: 'Perda de contatos sem perfil na triagem inicial' },
    { id: 'sched', name: 'Agendamento de Reuniões', from: qualified, to: scheduled, rate: rSched, drop: 100 - rSched, desc: 'Qualificados que não converteram em consulta agendada' },
    { id: 'cond', name: 'Comparecimento (Presença)', from: scheduled, to: conducted, rate: rCond, drop: 100 - rCond, desc: 'No-show / faltas em reuniões marcadas com advogados' },
    { id: 'prop', name: 'Elaboração de Propostas', from: conducted, to: proposals, rate: rProp, drop: 100 - rProp, desc: 'Consultas que não avançaram para envio de honorários' },
    { id: 'cont', name: 'Fechamento de Contratos', from: proposals, to: contractCount, rate: rCont, drop: 100 - rCont, desc: 'Propostas enviadas que não culminaram em assinatura' }
  ];

  const validStages = stages.filter(s => s.from > 0);
  let weakest = validStages.length ? validStages.reduce((prev, curr) => (curr.drop > prev.drop ? curr : prev)) : stages[2];

  // Status de Saúde Operacional
  let healthKey = 'healthy';
  let healthLabel = 'Saudável (Operação Eficiente)';
  let healthClass = 'healthy';
  let healthBadge = '🟢 Saudável';

  if (sla > 35 || overallRate < 6) {
    healthKey = 'critical';
    healthLabel = 'Crítico (Ruptura Comercial)';
    healthClass = 'critical';
    healthBadge = '🔴 Crítico';
  } else if (sla > 18 || overallRate < 11) {
    healthKey = 'warning';
    healthLabel = 'Atenção (Gargalo Ativo)';
    healthClass = 'warning';
    healthBadge = '🟡 Atenção';
  }

  // Canal campeão
  const sources = d.sources || { ads: 0, organic: 0, referral: 0, other: 0 };
  const sourceList = [
    { key: 'ads', label: 'Anúncios Online', count: Number(sources.ads || 0) },
    { key: 'organic', label: 'Orgânico / Conteúdo', count: Number(sources.organic || 0) },
    { key: 'referral', label: 'Indicações / Parceiros', count: Number(sources.referral || 0) },
    { key: 'other', label: 'Balcão / Outros', count: Number(sources.other || 0) }
  ];
  const totalSrc = sourceList.reduce((acc, s) => acc + s.count, 0) || leads;
  const champion = sourceList.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), sourceList[0]);
  const champPct = totalSrc > 0 ? ((champion.count / totalSrc) * 100).toFixed(0) : '0';

  // Formatar rótulo do mês
  const [y, m] = (d.month || '').split('-');
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const monthLabel = m ? `${monthNames[parseInt(m, 10) - 1]} de ${y}` : 'Período Atual';

  // Geração inteligente de diagnóstico
  let bottleneckText = '';
  let hypothesisText = '';

  if (weakest.id === 'qual') {
    bottleneckText = `Ruptura na <strong>Qualificação (${weakest.drop.toFixed(1)}% de descarte)</strong>. De ${leads} leads recebidos, ${unqualified} contatos foram desqualificados por falta de aderência ao perfil do escritório.`;
    hypothesisText = `<strong>Ação recomendada:</strong> Refinar criativos e segmentação de campanhas. Adicionar perguntas de triagem prévia no formulário/WhatsApp para poupar o tempo da equipe comercial.`;
  } else if (weakest.id === 'sched') {
    bottleneckText = `Gargalo no <strong>Agendamento (${weakest.drop.toFixed(1)}% de perda)</strong>. Houve ${qualified} contatos qualificados, porém apenas ${scheduled} agendaram uma consulta inicial.`;
    hypothesisText = `<strong>Ação recomendada:</strong> Reduzir o tempo de resposta (SLA atual: ${sla} min) para menos de 10 min. Implementar roteiro de ligação imediata ao invés de mensagens passivas.`;
  } else if (weakest.id === 'cond') {
    bottleneckText = `Ruptura no <strong>Comparecimento / No-Show (${weakest.drop.toFixed(1)}% de faltas)</strong>. Das ${scheduled} reuniões agendadas, apenas ${conducted} foram realizadas (${scheduled - conducted} faltas).`;
    hypothesisText = `<strong>Ação recomendada:</strong> Implementar régua de confirmação multicanal via WhatsApp (24 horas antes e 2 horas antes com envio do link da sala/endereço).`;
  } else if (weakest.id === 'prop') {
    bottleneckText = `Queda na <strong>Apresentação de Proposta (${weakest.drop.toFixed(1)}% sem proposta)</strong>. Foram realizadas ${conducted} reuniões, mas somente ${proposals} clientes receberam minuta ou proposta formal de honorários.`;
    hypothesisText = `<strong>Ação recomendada:</strong> Padronizar modelos de propostas com entrega em até 24 horas após a reunião, evitando o esfriamento da urgência do cliente.`;
  } else {
    bottleneckText = `Ruptura no <strong>Fechamento da Proposta (${weakest.drop.toFixed(1)}% de recusa)</strong>. De ${proposals} propostas apresentadas, apenas ${contractCount} contratos foram efetivamente fechados.`;
    hypothesisText = `<strong>Ação recomendada:</strong> Tratar a principal objeção ('${lossReason}'). Testar parcelamento de honorários iniciais ou estruturação mista (fixo menor + êxito).`;
  }

  return {
    leads, qualified, unqualified, scheduled, conducted, proposals, contracts: contractCount,
    sla, lossReason, followUp, overallRate,
    rQual, rSched, rCond, rProp, rCont,
    stages, weakest,
    healthBadge, healthLabel, healthClass,
    champion, champPct, totalSrc, sourceList,
    monthLabel,
    factText: `Em <strong>${monthLabel}</strong>, o escritório registrou <strong>${leads} novos leads</strong> e converteu <strong>${contractCount} contratos</strong> (${overallRate.toFixed(1)}% de conversão geral). O tempo médio de primeiro contato foi de <strong>${sla} minutos</strong>.`,
    bottleneckText,
    lossText: `Principal motivo de perda: <strong>${lossReason}</strong>. Existem atualmente <strong>${followUp} clientes em follow-up ativo</strong> na carteira, com potencial de recuperação direta de honorários.`,
    hypothesisText
  };
}

function renderCommercialHealth(targetMonth) {
  const panel = $('#commercial-health-panel');
  if (!panel) return;

  const currentMonth = targetMonth || $('#health-month-select')?.value || new Date().toISOString().slice(0, 7);
  const mInput = $('#health-month-select');
  if (mInput && mInput.value !== currentMonth) {
    mInput.value = currentMonth;
  }

  const rawData = getCommercialHealthForMonth(currentMonth);
  const insights = calcCommercialInsights(rawData);

  // 1. Render 4 Executive Health KPI Cards
  const kpisHtml = `
    <div class="health-kpi-card">
      <span class="kpi-label">Status da Operação</span>
      <div class="kpi-value">
        <span class="health-badge-status ${insights.healthClass}">${insights.healthBadge}</span>
      </div>
      <span class="kpi-sub">${insights.healthLabel}</span>
    </div>

    <div class="health-kpi-card">
      <span class="kpi-label">Conversão Global</span>
      <div class="kpi-value" style="color:var(--brand-navy,#010E38);">
        ${insights.overallRate.toFixed(1)}%
      </div>
      <span class="kpi-sub">${insights.contracts} contratos de ${insights.leads} leads</span>
    </div>

    <div class="health-kpi-card">
      <span class="kpi-label">SLA / 1º Contato</span>
      <div class="kpi-value" style="color:${insights.sla <= 15 ? '#166534' : (insights.sla <= 30 ? '#d97706' : '#dc2626')};">
        ${insights.sla} min
      </div>
      <span class="kpi-sub">${insights.sla <= 15 ? 'Tempo de resposta excelente' : (insights.sla <= 30 ? 'Dentro do tolerável' : 'Crítico: risco de esfriamento')}</span>
    </div>

    <div class="health-kpi-card">
      <span class="kpi-label">Canal Campeão</span>
      <div class="kpi-value" style="font-size:18px;color:#0284c7;">
        ${esc(insights.champion.label)}
      </div>
      <span class="kpi-sub">${insights.champPct}% do total (${insights.champion.count} leads)</span>
    </div>
  `;
  $('#health-kpis-container').innerHTML = kpisHtml;

  // 2. Render Funnel Stages
  const maxLeads = Math.max(1, insights.leads);
  const funnelStagesDef = [
    { label: '1. Leads Recebidos', iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#0284c7;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', count: insights.leads, base: insights.leads, rateStr: '100% total', isWeakest: false },
    { label: '2. Leads Qualificados', iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#16a34a;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>', count: insights.qualified, base: insights.leads, rateStr: `${insights.rQual.toFixed(1)}% dos leads`, isWeakest: insights.weakest.id === 'qual', dropStr: `-${insights.weakest.id === 'qual' ? insights.weakest.drop.toFixed(1) : (100 - insights.rQual).toFixed(1)}% descarte` },
    { label: '3. Reuniões Agendadas', iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#0284c7;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', count: insights.scheduled, base: insights.qualified, rateStr: `${insights.rSched.toFixed(1)}% dos qualif.`, isWeakest: insights.weakest.id === 'sched', dropStr: `-${(100 - insights.rSched).toFixed(1)}% sem agenda` },
    { label: '4. Reuniões Realizadas', iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#7c3aed;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', count: insights.conducted, base: insights.scheduled, rateStr: `${insights.rCond.toFixed(1)}% presenças`, isWeakest: insights.weakest.id === 'cond', dropStr: `-${(100 - insights.rCond).toFixed(1)}% no-show` },
    { label: '5. Propostas Enviadas', iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#d97706;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', count: insights.proposals, base: insights.conducted, rateStr: `${insights.rProp.toFixed(1)}% das reuniões`, isWeakest: insights.weakest.id === 'prop', dropStr: `-${(100 - insights.rProp).toFixed(1)}% sem proposta` },
    { label: '6. Contratos Assinados', iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#059669;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>', count: insights.contracts, base: insights.proposals, rateStr: `${insights.rCont.toFixed(1)}% fechamento`, isWeakest: insights.weakest.id === 'cont', dropStr: `-${(100 - insights.rCont).toFixed(1)}% perda` }
  ];

  $('#health-funnel-total-badge').textContent = `${insights.leads} Leads Totais`;

  $('#health-funnel-stages').innerHTML = funnelStagesDef.map(st => {
    const fillPct = insights.leads > 0 ? Math.min(100, Math.max(0, (st.count / maxLeads) * 100)) : 0;
    const barClass = st.isWeakest ? 'weakest' : (st.count === insights.contracts ? 'gold' : 'normal');
    return `
      <div class="funnel-stage-item ${st.isWeakest ? 'weakest' : ''}">
        <div class="funnel-stage-header">
          <span class="funnel-stage-title" style="display:inline-flex;align-items:center;gap:6px;">
            <span style="display:inline-flex;align-items:center;">${st.iconSvg}</span>
            <span>${st.label}</span>
            ${st.isWeakest ? '<span class="pill" style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;font-weight:800;">⚠️ MAIOR GARGALO</span>' : ''}
          </span>
          <span class="funnel-stage-count">${st.count}</span>
        </div>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill ${barClass}" style="width:${fillPct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
          <span style="font-size:11px;color:#64748b;font-weight:600;">${st.rateStr}</span>
          ${st.dropStr ? `<span class="funnel-drop-badge ${st.isWeakest ? 'alert' : ''}">${st.dropStr}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // 3. Render Insights Engine Feed
  $('#health-insights-feed').innerHTML = `
    <div class="insight-card-item fact">
      <div style="font-weight:800;color:#0284c7;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
        <span>📌</span> Fato Observado
      </div>
      <div>${insights.factText}</div>
    </div>

    <div class="insight-card-item bottleneck">
      <div style="font-weight:800;color:#ea580c;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
        <span>⚠️</span> Ponto Crítico de Investigação
      </div>
      <div>${insights.bottleneckText}</div>
    </div>

    <div class="insight-card-item loss">
      <div style="font-weight:800;color:#dc2626;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
        <span>📉</span> Diagnóstico de Perda & Follow-up
      </div>
      <div>${insights.lossText}</div>
    </div>

    <div class="insight-card-item hypothesis">
      <div style="font-weight:800;color:#16a34a;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
        <span>💡</span> Hipótese para o Próximo Ciclo
      </div>
      <div>${insights.hypothesisText}</div>
    </div>
  `;

  // 4. Render Channel Breakdown
  $('#health-sources-count').textContent = `Total: ${insights.totalSrc} lead(s) contabilizados`;
  $('#health-sources-grid').innerHTML = insights.sourceList.map(src => {
    const pct = insights.totalSrc > 0 ? ((src.count / insights.totalSrc) * 100).toFixed(1) : '0';
    return `
      <div class="source-pill-card">
        <span style="font-size:11px;color:#64748b;font-weight:700;">${esc(src.label)}</span>
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <strong style="font-size:16px;color:var(--brand-navy,#010E38);">${src.count}</strong>
          <span style="font-size:11px;font-weight:700;color:#0284c7;">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');
}

function openCommercialHealthModal() {
  const modal = $('#commercial-metrics-modal');
  if (!modal) return;
  const currentMonth = $('#health-month-select')?.value || new Date().toISOString().slice(0, 7);
  const data = getCommercialHealthForMonth(currentMonth);

  $('#cm-input-month').value = currentMonth;
  $('#cm-input-sla').value = data.sla || 12;
  $('#cm-input-leads').value = data.leads || 0;
  $('#cm-input-qualified').value = data.qualified || 0;
  $('#cm-input-unqualified').value = data.unqualified || 0;
  $('#cm-input-scheduled').value = data.scheduled || 0;
  $('#cm-input-conducted').value = data.conducted || 0;
  $('#cm-input-proposals').value = data.proposals || 0;
  $('#cm-input-contracts').value = data.contracts || 0;
  $('#cm-input-followup').value = data.follow_up || 0;
  $('#cm-input-loss-reason').value = data.loss_reason || 'Preço / Honorários';

  const src = data.sources || {};
  $('#cm-input-src-ads').value = src.ads || 0;
  $('#cm-input-src-organic').value = src.organic || 0;
  $('#cm-input-src-referral').value = src.referral || 0;
  $('#cm-input-src-other').value = src.other || 0;

  $('#cm-modal-msg').textContent = '';
  modal.showModal();
}

function syncContractsCountForMonth(targetMonth) {
  const m = targetMonth || $('#health-month-select')?.value || new Date().toISOString().slice(0, 7);
  const matched = (contracts || []).filter(c => c.signed_date && c.signed_date.startsWith(m));
  return matched.length;
}

function initCommercialHealth() {
  const mSelect = $('#health-month-select');
  if (mSelect && !mSelect.value) {
    mSelect.value = new Date().toISOString().slice(0, 7);
  }

  mSelect?.addEventListener('change', () => {
    renderCommercialHealth(mSelect.value);
  });

  $('#btn-open-health-modal')?.addEventListener('click', openCommercialHealthModal);
  $('#cm-modal-close')?.addEventListener('click', () => $('#commercial-metrics-modal')?.close());
  $('#cm-modal-cancel')?.addEventListener('click', () => $('#commercial-metrics-modal')?.close());

  // Sincronizar contratos com a base do DRE
  $('#btn-sync-health-contracts')?.addEventListener('click', () => {
    const curMonth = $('#health-month-select')?.value || new Date().toISOString().slice(0, 7);
    const count = syncContractsCountForMonth(curMonth);
    const store = loadCommercialHealthStore();
    const cur = store[curMonth] || getDefaultHealthData(curMonth);
    cur.contracts = count;
    store[curMonth] = cur;
    saveCommercialHealthStore(store);
    renderCommercialHealth(curMonth);
    alert(`Sincronização concluída: ${count} contrato(s) assinado(s) em ${curMonth} puxados diretamente do cadastro.`);
  });

  $('#cm-sync-btn-modal')?.addEventListener('click', () => {
    const m = $('#cm-input-month')?.value || new Date().toISOString().slice(0, 7);
    const count = syncContractsCountForMonth(m);
    $('#cm-input-contracts').value = count;
  });

  // Salvar formulário do modal
  $('#commercial-metrics-form')?.addEventListener('submit', ev => {
    ev.preventDefault();
    const m = $('#cm-input-month').value;
    if (!m) return;

    const store = loadCommercialHealthStore();
    store[m] = {
      month: m,
      leads: Number($('#cm-input-leads').value || 0),
      qualified: Number($('#cm-input-qualified').value || 0),
      unqualified: Number($('#cm-input-unqualified').value || 0),
      scheduled: Number($('#cm-input-scheduled').value || 0),
      conducted: Number($('#cm-input-conducted').value || 0),
      proposals: Number($('#cm-input-proposals').value || 0),
      contracts: Number($('#cm-input-contracts').value || 0),
      sla: Number($('#cm-input-sla').value || 15),
      loss_reason: $('#cm-input-loss-reason').value,
      follow_up: Number($('#cm-input-followup').value || 0),
      sources: {
        ads: Number($('#cm-input-src-ads').value || 0),
        organic: Number($('#cm-input-src-organic').value || 0),
        referral: Number($('#cm-input-src-referral').value || 0),
        other: Number($('#cm-input-src-other').value || 0)
      }
    };

    saveCommercialHealthStore(store);
    $('#commercial-metrics-modal')?.close();
    if ($('#health-month-select')) $('#health-month-select').value = m;
    renderCommercialHealth(m);
  });

  // Hook ribbon button
  $('#r-diag-health')?.addEventListener('click', () => {
    goto('saude-funil');
    $('#commercial-health-panel')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Render initial view
  renderCommercialHealth();
}

// ============================================================================
// MÓDULO 03: INTELIGÊNCIA POR ETAPA PROCESSUAL (DRE Jurídico Scientist)
// ============================================================================

let currentStageReport = null;
let currentStageBenchmarks = null;

function initStageIntelligence() {
  const mInput = $('#stg-month');
  if (mInput && !mInput.value) {
    mInput.value = new Date().toISOString().slice(0, 7);
  }

  mInput?.addEventListener('change', () => refreshStageIntelligence());
  $('#btn-stg-cur-month')?.addEventListener('click', () => {
    if (mInput) { mInput.value = new Date().toISOString().slice(0, 7); refreshStageIntelligence(); }
  });
  $('#btn-stg-all-months')?.addEventListener('click', () => {
    if (mInput) { mInput.value = ''; refreshStageIntelligence(); }
  });
  $('#btn-stg-refresh')?.addEventListener('click', () => refreshStageIntelligence());

  // Sub-tabs navigation (linha de contorno destacada ao clicar)
  document.querySelectorAll('.stg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPane = btn.dataset.stgTab;
      document.querySelectorAll('.stg-tab-btn').forEach(b => {
        const isActive = (b === btn);
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      document.querySelectorAll('.stg-tab-pane').forEach(p => {
        p.style.display = (p.id === targetPane) ? 'block' : 'none';
      });
      if (targetPane === 'tab-stg-benchmarks') {
        refreshStageBenchmarks();
      }
    });
  });

  // Contract selection change
  $('#stg-contract-filter')?.addEventListener('change', ev => {
    renderSelectedContractStages(ev.target.value);
  });

  // Modal budget form handler
  $('#form-stage-budget')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const contractId = $('#mb-contract-id')?.value;
    const stageId = $('#mb-stage-id')?.value;
    const hours = parseFloat($('#mb-stage-hours')?.value || '0');
    const status = $('#mb-stage-status')?.value || 'EM_ANDAMENTO';
    if (!contractId || !stageId) return;

    try {
      await api(`/contracts/${encodeURIComponent(contractId)}/stages/${encodeURIComponent(stageId)}`, {
        method: 'PUT',
        body: JSON.stringify({ planned_hours: hours, status: status })
      });
      $('#modal-stage-budget')?.close();
      await refreshStageIntelligence();
    } catch (err) {
      alert('Erro ao atualizar orçamento da etapa: ' + err.message);
    }
  });

  $('#btn-close-stage-budget')?.addEventListener('click', () => {
    $('#modal-stage-budget')?.close();
  });
}

async function refreshStageIntelligence() {
  const mInput = $('#stg-month');
  const month = mInput ? mInput.value : '';
  const url = '/productivity/stages' + (month ? '?month=' + encodeURIComponent(month) : '');

  try {
    const data = await api(url);
    currentStageReport = data;

    try { renderStageKPIs(data.totals); } catch (e) { console.error('Erro renderStageKPIs:', e); }
    try { renderStageAlerts(data.alerts); } catch (e) { console.error('Erro renderStageAlerts:', e); }
    try { populateStageContracts(data.contracts); } catch (e) { console.error('Erro populateStageContracts:', e); }
    try { renderTeamStages(data.professionals); } catch (e) { console.error('Erro renderTeamStages:', e); }
    try { renderAreasStages(data.areas); } catch (e) { console.error('Erro renderAreasStages:', e); }

    const statusP = $('#prod-status');
    if (statusP) {
      statusP.textContent = `Inteligência por etapas atualizada com sucesso (${data.contracts?.length || 0} processos analisados).`;
    }
  } catch (err) {
    console.error('Falha ao carregar inteligência por etapas:', err);
    const container = $('#stg-table-stages-body');
    if (container) {
      container.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:#ef4444;">Erro ao carregar dados: ${esc(err.message)}</td></tr>`;
    }
  }
}

function renderStageKPIs(totals) {
  const container = $('#stg-kpis-container');
  if (!container || !totals) return;

  const planned = totals.planned_hours || 0;
  const actual = totals.actual_hours || 0;
  const approved = totals.approved_hours || 0;
  const pending = totals.pending_hours || 0;
  const remaining = totals.remaining_hours ?? (totals.saldo_hours ?? (planned - actual));
  const devPct = totals.desvio_percentual ?? (planned > 0 ? ((actual - planned) / planned * 100) : null);
  const cost = totals.approved_cost != null ? totals.approved_cost : (totals.cost_approved_cents ? totals.cost_approved_cents / 100 : 0);

  const devBadge = devPct === null
    ? '<span class="stage-dev-badge stage-dev-muted">Sem orçamento</span>'
    : (devPct > 15
      ? `<span class="stage-dev-badge stage-dev-alert">+${devPct.toFixed(1)}% desvio</span>`
      : `<span class="stage-dev-badge stage-dev-ok">${devPct.toFixed(1)}% desvio</span>`);

  container.innerHTML = `
    <article class="card">
      <div class="label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Horas Previstas</span>
        <span style="font-size:14px;">🎯</span>
      </div>
      <strong style="color:var(--brand-navy,#010E38);">${planned.toFixed(1)}h</strong>
      <div class="meta">Orçamento total planejado de esforço</div>
    </article>

    <article class="card">
      <div class="label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Horas Realizadas</span>
        <span style="font-size:14px;">⏱️</span>
      </div>
      <strong style="color:var(--brand-navy,#010E38);">${actual.toFixed(1)}h</strong>
      <div class="meta" style="display:flex;gap:6px;align-items:center;">
        <span style="color:#15803d;font-weight:700;">${approved.toFixed(1)}h aprov.</span> · 
        <span style="color:#d97706;font-weight:700;">${pending.toFixed(1)}h pend.</span>
      </div>
    </article>

    <article class="card">
      <div class="label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Saldo de Horas</span>
        ${devBadge}
      </div>
      <strong class="${remaining < 0 ? 'negative' : 'positive'}">${remaining >= 0 ? '+' : ''}${remaining.toFixed(1)}h</strong>
      <div class="meta">Saldo de esforço restante na banca</div>
    </article>

    <article class="card">
      <div class="label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Custo Gerencial Aprovado</span>
        <span style="font-size:14px;">💎</span>
      </div>
      <strong style="color:var(--brand-gold,#EBB52C);">${money(cost)}</strong>
      <div class="meta">Mão de obra atribuída (CPC 00 Gerencial)</div>
    </article>
  `;
}

function renderStageAlerts(alerts) {
  const container = $('#stg-alerts-container');
  const badge = $('#stg-alerts-badge');
  if (!container) return;

  const list = alerts || [];
  if (badge) {
    badge.textContent = `${list.length} diagnóstico(s)`;
    badge.style.background = list.length ? '#fee2e2' : '#dcfce7';
    badge.style.color = list.length ? '#b91c1c' : '#15803d';
  }

  if (!list.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">✅</span>
        <div style="font-size:13px;color:#166534;">
          <strong>Equilíbrio Operacional:</strong> Nenhum desvio crítico ou gargalo foi identificado nas etapas dos processos vigentes.
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(a => {
    const isDanger = a.severity === 'danger';
    const isWarning = a.severity === 'warning';
    const bg = isDanger ? '#fef2f2' : (isWarning ? '#fffbeb' : '#f0f9ff');
    const border = isDanger ? '#fecaca' : (isWarning ? '#fde68a' : '#bae6fd');
    const titleColor = isDanger ? '#991b1b' : (isWarning ? '#92400e' : '#075985');
    const icon = isDanger ? '🚨' : (isWarning ? '⚠️' : 'ℹ️');
    const whatHappened = a.message || a.fact || 'Diagnóstico operacional registrado.';
    const actionPlan = a.recommendation || a.recommended_action || '';

    return `
      <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <strong style="font-size:13px;color:${titleColor};display:flex;align-items:center;gap:6px;">
            <span>${icon}</span> ${esc(a.title || a.type || a.category)}
          </strong>
          <span class="pill" style="font-size:10px;background:#fff;border:1px solid ${border};color:${titleColor};font-weight:700;">
            ${esc(String(a.severity || 'info').toUpperCase())}
          </span>
        </div>
        <div style="font-size:12px;color:#334155;line-height:1.4;">
          <strong>O que aconteceu:</strong> ${esc(whatHappened)}
        </div>
        ${a.impact ? `<div style="font-size:11.5px;color:#475569;"><strong>Possível Impacto:</strong> ${esc(a.impact)}</div>` : ''}
        ${actionPlan ? `<div style="font-size:11.5px;color:#15803d;background:rgba(255,255,255,0.7);padding:4px 8px;border-radius:6px;border-left:3px solid #16a34a;margin-top:2px;"><strong>Ação Investigativa:</strong> ${esc(actionPlan)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function populateStageContracts(contracts) {
  const select = $('#stg-contract-filter');
  if (!select) return;

  const currentVal = select.value;
  const list = contracts || [];

  if (!list.length) {
    select.innerHTML = '<option value="">Nenhum processo cadastrado</option>';
    renderSelectedContractStages('');
    return;
  }

  select.innerHTML = list.map(c => {
    const cId = c.contract_id || c.id;
    const cTitle = c.title || c.label || c.code || ('Contrato #' + cId);
    const cArea = formatLegalAreaName(c.area || c.legal_area || 'Geral');
    const cClient = c.customer_name || 'Cliente';
    return `
      <option value="${esc(cId)}">
        ${esc(cTitle)} — ${esc(cArea)} (${esc(cClient)})
      </option>
    `;
  }).join('');

  if (currentVal && list.some(c => String(c.contract_id || c.id) === String(currentVal))) {
    select.value = currentVal;
  } else {
    select.value = list[0].contract_id || list[0].id;
  }

  renderSelectedContractStages(select.value);
}

function renderSelectedContractStages(contractId) {
  const contract = (currentStageReport?.contracts || []).find(c => String(c.contract_id || c.id) === String(contractId));
  const summaryBox = $('#stg-selected-contract-summary');
  const tableBody = $('#stg-table-stages-body');
  const badgesBox = $('#stg-contract-meta-badges');

  if (!contract) {
    if (summaryBox) summaryBox.innerHTML = '';
    if (badgesBox) badgesBox.innerHTML = '';
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#64748b;">Nenhum processo selecionado.</td></tr>';
    return;
  }

  if (badgesBox) {
    const areaName = formatLegalAreaName(contract.area || contract.legal_area);
    badgesBox.innerHTML = `
      <span class="pill" style="font-size:11px;background:#e0e7ff;color:#3730a3;font-weight:700;">Área: ${esc(areaName)}</span>
      <span class="pill" style="font-size:11px;background:#f1f5f9;color:#475569;">Cliente: ${esc(contract.customer_name || 'Não vinculado')}</span>
      ${contract.process_number ? `<span class="pill" style="font-size:11px;background:#ecfdf5;color:#065f46;">Proc: ${esc(contract.process_number)}</span>` : ''}
    `;
  }

  const planned = contract.total_planned_hours ?? contract.planned_hours ?? 0;
  const actual = contract.total_actual_hours ?? contract.actual_hours ?? 0;
  const approved = contract.total_approved_hours ?? contract.approved_hours ?? 0;
  const pending = contract.total_pending_hours ?? contract.pending_hours ?? 0;
  const remaining = contract.total_remaining_hours ?? (contract.saldo_hours ?? (planned - actual));
  const cost = contract.total_approved_cost ?? (contract.approved_cost ?? (contract.cost_approved_cents ? contract.cost_approved_cents / 100 : 0));
  const pct = planned > 0 ? (actual / planned * 100) : null;

  const barColor = pct === null ? '#94a3b8' : (pct > 100 ? '#ef4444' : (pct > 80 ? '#f59e0b' : '#10b981'));

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
          <div>
            <strong style="font-size:15px;color:var(--brand-navy,#010E38);display:block;">${esc(contract.title || contract.label || 'Processo')}</strong>
            <span style="font-size:12px;color:#64748b;">Orçamento do Processo: <strong>${planned.toFixed(1)}h</strong> | Consumido: <strong>${actual.toFixed(1)}h</strong> | Saldo: <strong class="${remaining < 0 ? 'negative' : 'positive'}">${remaining >= 0 ? '+' : ''}${remaining.toFixed(1)}h</strong></span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;">Custo Gerencial Apurado</div>
            <strong style="font-size:17px;color:var(--brand-gold,#EBB52C);">${money(cost)}</strong>
          </div>
        </div>

        <div style="margin-top:8px;">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#475569;margin-bottom:4px;">
            <span>Consumo do Orçamento de Horas</span>
            <strong>${pct !== null ? pct.toFixed(1) + '%' : 'Sem orçamento'}</strong>
          </div>
          <div style="height:10px;background:#e2e8f0;border-radius:6px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(100, pct || 0)}%;background:${barColor};transition:width 0.4s ease;"></div>
          </div>
        </div>
      </div>
    `;
  }

  const stages = contract.stages || [];
  if (!stages.length) {
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#64748b;">Nenhuma etapa processual vinculada a este contrato.</td></tr>';
    return;
  }

  if (tableBody) {
    tableBody.innerHTML = stages.map(s => {
      const sPlanned = s.planned_hours || 0;
      const sActual = s.actual_hours || 0;
      const sApproved = s.approved_hours || 0;
      const sPending = s.pending_hours || 0;
      const sRemaining = s.remaining_hours ?? (s.saldo_hours ?? (sPlanned - sActual));
      const sCost = s.approved_cost ?? (s.cost_approved_cents ? s.cost_approved_cents / 100 : 0);
      const sDev = s.desvio_percentual;

      let devLabel = '<span class="stage-dev-badge stage-dev-muted">Sem orçamento</span>';
      if (sDev !== null && sDev !== undefined) {
        if (sDev > 20) {
          devLabel = `<span class="stage-dev-badge stage-dev-alert">+${sDev.toFixed(1)}%</span>`;
        } else if (sDev < -20) {
          devLabel = `<span class="stage-dev-badge stage-dev-info">${sDev.toFixed(1)}%</span>`;
        } else {
          devLabel = `<span class="stage-dev-badge stage-dev-ok">${sDev.toFixed(1)}%</span>`;
        }
      }

      const statusMap = {
        'PLANEJADA': '<span class="stage-status-badge stage-status-planned"><span style="line-height:1;">📅</span><span>Planejada</span></span>',
        'EM_ANDAMENTO': '<span class="stage-status-badge stage-status-progress"><span style="line-height:1;">⚡</span><span>Em Andamento</span></span>',
        'CONCLUIDA': '<span class="stage-status-badge stage-status-done"><span style="line-height:1;">✓</span><span>Concluída</span></span>',
        'NAO_APLICAVEL': '<span class="stage-status-badge stage-status-na"><span style="line-height:1;">⊘</span><span>Não Aplicável</span></span>'
      };

      const stagePct = sPlanned > 0 ? (sActual / sPlanned * 100) : 0;
      const stageBarColor = stagePct > 100 ? '#ef4444' : (stagePct > 80 ? '#f59e0b' : '#10b981');

      return `
        <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td style="text-align:center;color:#64748b;font-weight:700;white-space:nowrap;vertical-align:middle;">
            ${s.order_index || s.stage_order || 1}
          </td>
          <td style="vertical-align:middle;min-width:200px;">
            <strong style="color:var(--brand-navy,#010E38);display:block;line-height:1.3;">${esc(s.stage_name)}</strong>
            ${s.notes ? `<small style="color:#64748b;display:block;margin-top:2px;">${esc(s.notes)}</small>` : ''}
          </td>
          <td style="text-align:center;white-space:nowrap;vertical-align:middle;">
            ${statusMap[s.status] || `<span class="stage-status-badge stage-status-planned">${esc(s.status)}</span>`}
          </td>
          <td class="num" style="font-weight:700;white-space:nowrap;vertical-align:middle;">
            ${sPlanned.toFixed(1)}h
          </td>
          <td style="vertical-align:middle;min-width:170px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(100, stagePct)}%;background:${stageBarColor};"></div>
              </div>
              <strong style="font-size:12px;width:42px;text-align:right;white-space:nowrap;">${sActual.toFixed(1)}h</strong>
            </div>
          </td>
          <td class="num" style="color:#15803d;font-weight:700;white-space:nowrap;vertical-align:middle;">
            ${sApproved.toFixed(1)}h
          </td>
          <td class="num" style="color:#d97706;font-weight:700;white-space:nowrap;vertical-align:middle;">
            ${sPending.toFixed(1)}h
          </td>
          <td class="num ${sRemaining < 0 ? 'negative' : 'positive'}" style="font-weight:700;white-space:nowrap;vertical-align:middle;">
            ${sRemaining >= 0 ? '+' : ''}${sRemaining.toFixed(1)}h
          </td>
          <td style="text-align:center;white-space:nowrap;vertical-align:middle;">
            ${devLabel}
          </td>
          <td class="num" style="font-weight:700;color:var(--brand-gold,#EBB52C);white-space:nowrap;vertical-align:middle;">
            ${money(sCost)}
          </td>
          <td style="text-align:center;white-space:nowrap;vertical-align:middle;">
            <button type="button" class="btn secondary btn-edit-stage-budget" 
              data-contract-id="${esc(contract.contract_id || contract.id)}"
              data-contract-title="${esc(contract.title || contract.label || 'Contrato')}"
              data-stage-id="${esc(s.stage_id || s.id)}"
              data-stage-name="${esc(s.stage_name)}"
              data-planned-hours="${sPlanned}"
              data-status="${esc(s.status)}"
              title="Ajustar orçamento e status da etapa">
              <span style="font-size:12px;line-height:1;">🎯</span>
              <span>Orçar</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Wire buttons in table
    tableBody.querySelectorAll('.btn-edit-stage-budget').forEach(btn => {
      btn.addEventListener('click', () => {
        openStageBudgetModal({
          contractId: btn.dataset.contractId,
          contractTitle: btn.dataset.contractTitle,
          stageId: btn.dataset.stageId,
          stageName: btn.dataset.stageName,
          plannedHours: btn.dataset.plannedHours,
          status: btn.dataset.status
        });
      });
    });
  }
}

function openStageBudgetModal(data) {
  const modal = $('#modal-stage-budget');
  if (!modal) return;

  $('#mb-contract-id').value = data.contractId || '';
  $('#mb-stage-id').value = data.stageId || '';
  $('#mb-stage-title').textContent = data.stageName || '';
  $('#mb-contract-title').textContent = data.contractTitle || '';
  $('#mb-stage-hours').value = data.plannedHours || '0';
  $('#mb-stage-status').value = data.status || 'EM_ANDAMENTO';

  modal.showModal();
}

function renderTeamStages(professionals) {
  const tbody = $('#stg-table-pros-body');
  if (!tbody) return;

  const list = professionals || [];
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Nenhum apontamento por profissional no período.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => {
    const act = p.actual_hours ?? p.total_hours ?? 0;
    const app = p.approved_hours || 0;
    const pen = p.pending_hours || 0;
    const cost = p.approved_cost ?? (p.cost_approved_cents ? p.cost_approved_cents / 100 : 0);
    const rate = p.hourly_rate ?? (p.hourly_cost_cents ? p.hourly_cost_cents / 100 : 0);

    const stagesList = p.top_stages || p.stages || [];
    const stagesPills = stagesList.map(s => 
      `<span style="display:inline-flex;align-items:center;white-space:nowrap;padding:2px 7px;border-radius:12px;font-size:10.5px;font-weight:600;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;">${esc(s.name)} (${(s.hours || 0).toFixed(1)}h)</span>`
    ).join(' ') || '<span style="color:#94a3b8;font-size:11px;">—</span>';

    const actList = p.top_activities || p.activities || [];
    const actPills = actList.map(a => 
      `<span style="display:inline-flex;align-items:center;white-space:nowrap;padding:2px 7px;border-radius:12px;font-size:10.5px;font-weight:600;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">${esc(a.type || a.name)} (${(a.hours || 0).toFixed(1)}h)</span>`
    ).join(' ') || '<span style="color:#94a3b8;font-size:11px;">—</span>';

    return `
      <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <td style="vertical-align:middle;white-space:nowrap;">
          <strong style="color:var(--brand-navy,#010E38);display:block;">${esc(p.name)}</strong>
          <small style="color:#64748b;">${esc(p.role || 'Advogado')}</small>
        </td>
        <td class="num" style="font-weight:700;white-space:nowrap;vertical-align:middle;">${money(rate)}/h</td>
        <td class="num" style="font-weight:700;white-space:nowrap;vertical-align:middle;">${act.toFixed(1)}h</td>
        <td class="num" style="color:#15803d;font-weight:700;white-space:nowrap;vertical-align:middle;">${app.toFixed(1)}h</td>
        <td class="num" style="color:#d97706;font-weight:700;white-space:nowrap;vertical-align:middle;">${pen.toFixed(1)}h</td>
        <td class="num" style="font-weight:700;color:var(--brand-gold,#EBB52C);white-space:nowrap;vertical-align:middle;">${money(cost)}</td>
        <td style="vertical-align:middle;"><div style="display:flex;gap:4px;flex-wrap:wrap;">${stagesPills}</div></td>
        <td style="vertical-align:middle;"><div style="display:flex;gap:4px;flex-wrap:wrap;">${actPills}</div></td>
      </tr>
    `;
  }).join('');
}

function formatLegalAreaName(rawArea) {
  if (!rawArea) return 'Área Geral';
  const clean = String(rawArea).trim().toLowerCase();
  const dict = {
    'civel': 'Direito Cível',
    'trabalhista': 'Direito Trabalhista',
    'tributario': 'Direito Tributário',
    'previdenciario': 'Direito Previdenciário',
    'societario': 'Direito Societário',
    'empresarial': 'Direito Empresarial',
    'consumidor': 'Direito do Consumidor',
    'familia': 'Família e Sucessões',
    'geral': 'Área Geral'
  };
  if (dict[clean]) return dict[clean];
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function renderAreasStages(areas) {
  const tbody = $('#stg-table-areas-body');
  if (!tbody) return;

  const list = areas || [];
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">Nenhuma atividade por área jurídica no período.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(a => {
    const totH = a.total_hours || 0;
    const avgH = a.avg_hours_per_contract != null ? a.avg_hours_per_contract : (a.contract_count ? totH / a.contract_count : 0);
    const totCost = a.total_cost != null ? a.total_cost : (a.cost_approved_cents ? a.cost_approved_cents / 100 : 0);
    const formattedArea = formatLegalAreaName(a.area || a.legal_area);

    return `
      <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <td style="vertical-align:middle;white-space:nowrap;">
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:#ede9fe;color:#7c3aed;font-size:12px;border:1px solid #ddd6fe;">⚖️</span>
            <strong style="color:var(--brand-navy,#010E38);font-size:13px;">${esc(formattedArea)}</strong>
          </div>
        </td>
        <td class="num" style="font-weight:700;white-space:nowrap;vertical-align:middle;">${a.contract_count} processo(s)</td>
        <td class="num" style="font-weight:700;white-space:nowrap;vertical-align:middle;">${totH.toFixed(1)}h</td>
        <td class="num" style="font-weight:700;color:#0284c7;white-space:nowrap;vertical-align:middle;">${avgH.toFixed(1)}h / proc</td>
        <td class="num" style="font-weight:700;color:var(--brand-gold,#EBB52C);white-space:nowrap;vertical-align:middle;">${money(totCost)}</td>
      </tr>
    `;
  }).join('');
}

async function refreshStageBenchmarks() {
  const container = $('#stg-benchmarks-container');
  if (!container) return;

  container.innerHTML = '<p class="muted" style="text-align:center;padding:24px;">Calculando métricas amostrais e distribuição estatística...</p>';

  try {
    const data = await api('/productivity/stages/benchmarks');
    currentStageBenchmarks = data;

    const cohorts = data.benchmarks || data.cohorts || [];
    if (!cohorts.length) {
      container.innerHTML = `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;text-align:center;color:#64748b;">
          Nenhum grupo amostral possui processos suficientes para cálculo de benchmarking com relevância estatística.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px;">
        ${cohorts.map(c => {
          const relLabel = c.reliability_label || c.reliability_rating || c.reliability || 'Média';
          const isHigh = String(relLabel).toUpperCase().includes('ALTA');
          const isLow = String(relLabel).toUpperCase().includes('INICIAL') || String(relLabel).toUpperCase().includes('BAIXA');
          const relColor = isHigh ? '#15803d' : (isLow ? '#b45309' : '#0369a1');
          const relBg = isHigh ? '#dcfce7' : (isLow ? '#fef3c7' : '#e0f2fe');

          const rawAreaName = c.legal_area || c.area || 'Área Geral';
          const areaName = formatLegalAreaName(rawAreaName);
          const sampleN = c.sample_size_n ?? c.sample_size ?? 0;
          const medianH = c.median_hours ?? 0;
          const meanH = c.average_hours ?? c.mean_hours ?? 0;
          const dispH = c.dispersion_std_dev ?? c.dispersion_hours ?? 0;

          const stagesList = c.stages_breakdown || c.stages_benchmark || [];
          const stagesTable = stagesList.map(sb => {
            const sbMed = sb.median_hours ?? 0;
            const sbMean = sb.average_hours ?? sb.mean_hours ?? 0;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
                <span style="color:#334155;">${esc(sb.stage_name)}</span>
                <div style="display:flex;gap:12px;font-weight:700;">
                  <span style="color:#0284c7;">P50: ${sbMed.toFixed(1)}h</span>
                  <span style="color:#64748b;">Média: ${sbMean.toFixed(1)}h</span>
                </div>
              </div>
            `;
          }).join('');

          return `
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
                <div>
                  <div style="display:inline-flex;align-items:center;gap:6px;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:#ede9fe;color:#7c3aed;font-size:12px;">⚖️</span>
                    <strong style="font-size:15px;color:var(--brand-navy,#010E38);display:block;">${esc(areaName)}</strong>
                  </div>
                  <span style="font-size:12px;color:#64748b;display:block;margin-top:2px;">Rito: ${esc(c.procedure_type || 'Ordinário')} · Complexidade: ${esc(c.complexity || 'Normal')}</span>
                </div>
                <div style="text-align:right;">
                  <span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:14px;font-size:10.5px;background:${relBg};color:${relColor};font-weight:800;white-space:nowrap;">${esc(relLabel)}</span>
                  <div style="font-size:11px;color:#64748b;margin-top:2px;">Amostra: N = <strong>${sampleN}</strong> processos</div>
                </div>
              </div>

              <!-- Indicadores Estatísticos Amostrais -->
              <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:14px;text-align:center;">
                <div>
                  <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Mediana (P50)</div>
                  <strong style="font-size:14px;color:var(--brand-navy,#010E38);">${medianH.toFixed(1)}h</strong>
                </div>
                <div>
                  <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Média Geral</div>
                  <strong style="font-size:14px;color:#0284c7;">${meanH.toFixed(1)}h</strong>
                </div>
                <div>
                  <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Dispersão (σ)</div>
                  <strong style="font-size:14px;color:#64748b;">±${dispH.toFixed(1)}h</strong>
                </div>
              </div>

              <!-- Quebra Mediana por Etapa -->
              <div style="margin-top:8px;">
                <div style="font-size:11.5px;font-weight:700;color:var(--brand-navy,#010E38);margin-bottom:6px;">Esforço Típico por Etapa Processual:</div>
                ${stagesTable || '<p class="muted" style="font-size:11px;">Sem dados detalhados por etapa.</p>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    console.error('Falha ao carregar benchmarks:', err);
    container.innerHTML = `<p style="text-align:center;color:#ef4444;padding:20px;">Erro ao carregar benchmarks: ${esc(err.message)}</p>`;
  }
}



