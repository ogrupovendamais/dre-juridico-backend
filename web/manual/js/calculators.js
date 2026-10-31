/**
 * DRE Jurídico — Simuladores Contábeis e Financeiros
 * Venda+ Tech
 */

// 1. DRE Simulator (10 Grupos CPC)
function updateDreSim() {
  const g01 = parseFloat(document.getElementById('dreG01')?.value) || 0;
  const g02 = parseFloat(document.getElementById('dreG02')?.value) || 0;
  const g03 = parseFloat(document.getElementById('dreG03')?.value) || 0;
  const desp = parseFloat(document.getElementById('dreDespesas')?.value) || 0;
  const g09 = parseFloat(document.getElementById('dreG09')?.value) || 0;
  const g10 = parseFloat(document.getElementById('dreG10')?.value) || 0;

  const recLiq = g01 - g02;
  const lucroBruto = recLiq - g03;
  const ebit = lucroBruto - desp;
  const lair = ebit + g09;
  const lucroLiq = lair - g10;

  const margemBruta = recLiq > 0 ? ((lucroBruto / recLiq) * 100).toFixed(1) : 0;
  const margemLiq = g01 > 0 ? ((lucroLiq / g01) * 100).toFixed(1) : 0;

  const elRecLiq = document.getElementById('resRecLiquida');
  const elLucroBruto = document.getElementById('resLucroBruto');
  const elEbit = document.getElementById('resEbit');
  const elLiq = document.getElementById('resLucroLiquido');

  if (elRecLiq) elRecLiq.textContent = 'R$ ' + recLiq.toLocaleString('pt-BR', {minimumFractionDigits: 2});
  if (elLucroBruto) elLucroBruto.textContent = 'R$ ' + lucroBruto.toLocaleString('pt-BR', {minimumFractionDigits: 2}) + ' (' + margemBruta + '%)';
  if (elEbit) elEbit.textContent = 'R$ ' + ebit.toLocaleString('pt-BR', {minimumFractionDigits: 2});
  
  if (elLiq) {
    elLiq.textContent = 'R$ ' + lucroLiq.toLocaleString('pt-BR', {minimumFractionDigits: 2}) + ' (' + margemLiq + '%)';
    elLiq.className = (lucroLiq >= 0) ? 'result-value success' : 'result-value danger';
  }
}

// 2. Runway & Burn Rate Simulator
function updateRunwaySim() {
  const saldo = parseFloat(document.getElementById('burnSaldo')?.value) || 0;
  const rate = parseFloat(document.getElementById('burnRate')?.value) || 0;
  const rec = parseFloat(document.getElementById('burnReceita')?.value) || 0;

  const queimaLiq = rate - rec;
  const elQueima = document.getElementById('resQueimaLiquida');
  const elAutonomia = document.getElementById('resAutonomia');
  const elStatus = document.getElementById('resStatusRunway');

  if (elQueima) {
    elQueima.textContent = 'R$ ' + Math.max(0, queimaLiq).toLocaleString('pt-BR', {minimumFractionDigits: 2});
  }

  if (queimaLiq <= 0) {
    if (elAutonomia) elAutonomia.textContent = 'Infinita (Superávit)';
    if (elStatus) {
      elStatus.textContent = 'Operação Superavitária';
      elStatus.className = 'result-value success';
    }
  } else if (saldo <= 0) {
    if (elAutonomia) elAutonomia.textContent = '0,0 Meses';
    if (elStatus) {
      elStatus.textContent = 'Caixa Zerado / Crítico';
      elStatus.className = 'result-value danger';
    }
  } else {
    const meses = (saldo / queimaLiq).toFixed(1);
    if (elAutonomia) elAutonomia.textContent = meses + ' Meses';
    if (elStatus) {
      if (meses < 3) {
        elStatus.textContent = 'Alerta: Caixa Baixo';
        elStatus.className = 'result-value danger';
      } else if (meses < 6) {
        elStatus.textContent = 'Atenção Operacional';
        elStatus.className = 'result-value';
      } else {
        elStatus.textContent = 'Equilíbrio Estável';
        elStatus.className = 'result-value success';
      }
    }
  }
}

// 3. Funil Jurídico Simulator
function updateFunilSim() {
  const leads = parseFloat(document.getElementById('funilLeads')?.value) || 1;
  const qualif = parseFloat(document.getElementById('funilQualif')?.value) || 0;
  const agendadas = parseFloat(document.getElementById('funilAgendadas')?.value) || 0;
  const realizadas = parseFloat(document.getElementById('funilRealizadas')?.value) || 0;
  const propostas = parseFloat(document.getElementById('funilPropostas')?.value) || 0;
  const contratos = parseFloat(document.getElementById('funilContratos')?.value) || 0;

  const convGlobal = ((contratos / leads) * 100).toFixed(1) + '%';
  const fechProp = propostas > 0 ? ((contratos / propostas) * 100).toFixed(1) + '%' : '0%';
  const perdaProp = propostas > 0 ? (((propostas - contratos) / propostas) * 100).toFixed(1) + '%' : '0%';
  const compRec = agendadas > 0 ? ((realizadas / agendadas) * 100).toFixed(1) + '%' : '0%';

  const elConvGlobal = document.getElementById('resConvGlobal');
  const elFechProp = document.getElementById('resFechPropostas');
  const elPerdaProp = document.getElementById('resPerdaPropostas');
  const elCompRec = document.getElementById('resComparecimento');

  if (elConvGlobal) elConvGlobal.textContent = convGlobal;
  if (elFechProp) elFechProp.textContent = fechProp;
  if (elPerdaProp) elPerdaProp.textContent = perdaProp + ' (Gargalo)';
  if (elCompRec) elCompRec.textContent = compRec;
}

// Initialize simulator event listeners
document.addEventListener('DOMContentLoaded', () => {
  ['dreG01', 'dreG02', 'dreG03', 'dreDespesas', 'dreG09', 'dreG10'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateDreSim);
  });

  ['burnSaldo', 'burnRate', 'burnReceita'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateRunwaySim);
  });

  ['funilLeads', 'funilQualif', 'funilAgendadas', 'funilRealizadas', 'funilPropostas', 'funilContratos'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateFunilSim);
  });
});
