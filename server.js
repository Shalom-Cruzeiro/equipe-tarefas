const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const ARQUIVO = path.join(DATA_DIR, 'tarefas.json');

const STATUS_VALIDOS = ['todo', 'doing', 'review', 'done'];
const PRIORIDADES_VALIDAS = ['alta', 'media', 'baixa'];
const CORES_AREA = ['#3A78C2', '#2E9E69', '#D29A2A', '#8B5CF6', '#E8734A', '#0EA5A5', '#D85742', '#6366F1'];

function hojeStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function maisDias(dataStr, n) {
  const d = new Date(dataStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}
function formatarBR(dataStr) {
  if (!dataStr) return '';
  const d = new Date(dataStr + 'T12:00:00');
  return isNaN(d) ? dataStr : d.toLocaleDateString('pt-BR');
}

// ---------- Carregar dados (com migração) ----------
let dados = { tarefas: [], membros: [], areas: [], config: {} };
try {
  if (fs.existsSync(ARQUIVO)) {
    const parsed = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    if (Array.isArray(parsed)) dados.tarefas = parsed;
    else if (parsed && typeof parsed === 'object') dados = parsed;
  }
} catch (e) { console.error('Aviso: não consegui ler os dados, começando vazio.', e.message); }
dados.tarefas = dados.tarefas || [];
dados.membros = dados.membros || [];
dados.areas = dados.areas || [];
dados.config = dados.config || {};
dados.tarefas.forEach((t) => { if (!('area' in t)) t.area = ''; if (!('concluido_em' in t)) t.concluido_em = ''; });
dados.membros.forEach((m) => { if (!('email' in m)) m.email = ''; });

function salvarDisco() {
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, ARQUIVO);
}

// ---------- Envio de e-mail (Brevo) ----------
function emailConfigurado() {
  return !!(process.env.BREVO_API_KEY && process.env.REMETENTE_EMAIL);
}
function emailDoMembro(nome) {
  const m = dados.membros.find((x) => x.nome === nome);
  return m && m.email ? m.email : null;
}
async function enviarEmail(destino, nomeDestino, assunto, html) {
  if (!emailConfigurado() || !destino) return { ok: false, motivo: 'E-mail não configurado ou destinatário sem e-mail.' };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.REMETENTE_NOME || 'Gestão de Tarefas Shalom', email: process.env.REMETENTE_EMAIL },
        to: [{ email: destino, name: nomeDestino || destino }],
        subject: assunto,
        htmlContent: html,
      }),
    });
    if (!r.ok) { const txt = await r.text().catch(() => ''); console.error('Falha e-mail:', r.status, txt); return { ok: false, motivo: 'Provedor recusou (' + r.status + '). ' + txt }; }
    return { ok: true };
  } catch (e) { console.error('Erro e-mail:', e.message); return { ok: false, motivo: e.message }; }
}
function moldura(titulo, corpoHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1A2A3A">
    <div style="background:#102E4D;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${titulo}</div>
    <div style="border:1px solid #DBE2E8;border-top:none;border-radius:0 0 12px 12px;padding:22px">${corpoHtml}
      <p style="color:#6A7C8C;font-size:12px;margin-top:22px">Gestão de Tarefas Shalom</p>
    </div></div>`;
}
function avisarNovaTarefa(t) {
  const email = emailDoMembro(t.responsavel);
  if (!email || t.status === 'done') return;
  const prazo = t.prazo ? ' · Prazo: <b>' + formatarBR(t.prazo) + '</b>' : '';
  const html = moldura('Nova tarefa para você', `<p>Uma nova tarefa foi atribuída a você:</p>
    <p style="font-size:16px;font-weight:bold;margin:12px 0">${t.titulo}</p>
    <p>Prioridade: ${({alta:'Alta',media:'Média',baixa:'Baixa'})[t.prioridade]||t.prioridade}${prazo}${t.area ? ' · Área: ' + t.area : ''}</p>`);
  enviarEmail(email, t.responsavel, 'Nova tarefa: ' + t.titulo, html);
}

// ---------- Resumo diário (prazos e atrasos) ----------
function enviarResumosDiarios() {
  const hoje = hojeStr();
  const amanha = maisDias(hoje, 1);
  const porMembro = {};
  for (const t of dados.tarefas) {
    if (t.status === 'done' || !t.responsavel || !t.prazo) continue;
    if (!emailDoMembro(t.responsavel)) continue;
    if (!porMembro[t.responsavel]) porMembro[t.responsavel] = { atrasadas: [], proximas: [] };
    if (t.prazo < hoje) porMembro[t.responsavel].atrasadas.push(t);
    else if (t.prazo === hoje || t.prazo === amanha) porMembro[t.responsavel].proximas.push(t);
  }
  for (const nome of Object.keys(porMembro)) {
    const { atrasadas, proximas } = porMembro[nome];
    if (!atrasadas.length && !proximas.length) continue;
    const li = (t, cor) => `<li style="margin:6px 0"><b style="color:${cor}">${formatarBR(t.prazo)}</b> — ${t.titulo}</li>`;
    let corpo = '';
    if (atrasadas.length) corpo += `<p style="font-weight:bold;color:#D85742">Atrasadas (${atrasadas.length})</p><ul>${atrasadas.map((t) => li(t, '#D85742')).join('')}</ul>`;
    if (proximas.length) corpo += `<p style="font-weight:bold;color:#D29A2A">Prazo chegando (${proximas.length})</p><ul>${proximas.map((t) => li(t, '#D29A2A')).join('')}</ul>`;
    const html = moldura('Seu resumo de tarefas', corpo);
    enviarEmail(emailDoMembro(nome), nome, 'Resumo de tarefas — ' + formatarBR(hoje), html);
  }
}
function checarResumoDiario() {
  if (!emailConfigurado()) return;
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  const hoje = hojeStr();
  if (hora < 8) return;
  if (dados.config.ultimoResumo === hoje) return;
  dados.config.ultimoResumo = hoje;
  salvarDisco();
  enviarResumosDiarios();
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// devolve só o que a tela precisa (não expõe config)
app.get('/api/dados', (req, res) => res.json({ tarefas: dados.tarefas, membros: dados.membros, areas: dados.areas, emailAtivo: emailConfigurado() }));

// ---------- Tarefas ----------
app.post('/api/tarefas', (req, res) => {
  const c = req.body || {};
  const titulo = (c.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'O título é obrigatório.' });
  const status = STATUS_VALIDOS.includes(c.status) ? c.status : 'todo';
  const tarefa = {
    id: crypto.randomUUID(), titulo,
    responsavel: (c.responsavel || '').trim(), area: (c.area || '').trim(),
    prazo: c.prazo || '', prioridade: PRIORIDADES_VALIDAS.includes(c.prioridade) ? c.prioridade : 'media',
    status, criado_em: new Date().toISOString(), concluido_em: status === 'done' ? hojeStr() : '',
  };
  dados.tarefas.push(tarefa);
  salvarDisco();
  avisarNovaTarefa(tarefa);
  res.json(tarefa);
});

app.patch('/api/tarefas/:id', (req, res) => {
  const t = dados.tarefas.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const c = req.body || {};
  const eraDone = t.status === 'done';
  const respAntigo = t.responsavel;

  if ('titulo' in c) { const novo = (c.titulo || '').trim(); if (!novo) return res.status(400).json({ erro: 'O título não pode ficar vazio.' }); t.titulo = novo; }
  if ('responsavel' in c) t.responsavel = (c.responsavel || '').trim();
  if ('area' in c) t.area = (c.area || '').trim();
  // Prazo é TRAVADO: definido só na criação, nunca alterado depois.
  if ('prioridade' in c && PRIORIDADES_VALIDAS.includes(c.prioridade)) t.prioridade = c.prioridade;
  if ('status' in c && STATUS_VALIDOS.includes(c.status)) t.status = c.status;

  const agoraDone = t.status === 'done';
  if (!eraDone && agoraDone) t.concluido_em = hojeStr();
  if (eraDone && !agoraDone) t.concluido_em = '';
  salvarDisco();

  // avisa se a tarefa passou a ser de outra pessoa
  if (t.responsavel && t.responsavel !== respAntigo) avisarNovaTarefa(t);
  res.json(t);
});

app.delete('/api/tarefas/:id', (req, res) => {
  const antes = dados.tarefas.length;
  dados.tarefas = dados.tarefas.filter((x) => x.id !== req.params.id);
  if (dados.tarefas.length !== antes) salvarDisco();
  res.json({ ok: true });
});

// ---------- Membros ----------
app.post('/api/membros', (req, res) => {
  const b = req.body || {};
  const nome = (b.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'O nome é obrigatório.' });
  if (dados.membros.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) return res.status(400).json({ erro: 'Esse membro já está cadastrado.' });
  const membro = { id: crypto.randomUUID(), nome, funcao: (b.funcao || '').trim(), email: (b.email || '').trim() };
  dados.membros.push(membro);
  salvarDisco();
  res.json(membro);
});

app.patch('/api/membros/:id', (req, res) => {
  const m = dados.membros.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Membro não encontrado.' });
  const b = req.body || {};
  if ('email' in b) m.email = (b.email || '').trim();
  if ('funcao' in b) m.funcao = (b.funcao || '').trim();
  if ('nome' in b) { const n = (b.nome || '').trim(); if (n) m.nome = n; }
  salvarDisco();
  res.json(m);
});

app.delete('/api/membros/:id', (req, res) => {
  dados.membros = dados.membros.filter((m) => m.id !== req.params.id);
  salvarDisco();
  res.json({ ok: true });
});

// ---------- Áreas ----------
app.post('/api/areas', (req, res) => {
  const nome = ((req.body || {}).nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'O nome da área é obrigatório.' });
  if (dados.areas.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) return res.status(400).json({ erro: 'Essa área já existe.' });
  const area = { id: crypto.randomUUID(), nome, cor: CORES_AREA[dados.areas.length % CORES_AREA.length] };
  dados.areas.push(area);
  salvarDisco();
  res.json(area);
});

app.delete('/api/areas/:id', (req, res) => {
  dados.areas = dados.areas.filter((a) => a.id !== req.params.id);
  salvarDisco();
  res.json({ ok: true });
});

// ---------- Teste de e-mail ----------
app.post('/api/email/teste', async (req, res) => {
  if (!emailConfigurado()) return res.status(400).json({ erro: 'E-mail ainda não configurado no servidor (faltam as variáveis BREVO_API_KEY e REMETENTE_EMAIL).' });
  const m = dados.membros.find((x) => x.id === (req.body || {}).id);
  if (!m || !m.email) return res.status(400).json({ erro: 'Esse membro não tem e-mail cadastrado.' });
  const html = moldura('E-mail de teste', '<p>Funcionou! As notificações por e-mail estão ativas para você.</p>');
  const r = await enviarEmail(m.email, m.nome, 'Teste — Gestão de Tarefas Shalom', html);
  if (!r.ok) return res.status(502).json({ erro: 'Não foi possível enviar: ' + r.motivo });
  res.json({ ok: true });
});

// agendador: verifica a cada 30 min e envia o resumo uma vez por dia, de manhã
setInterval(checarResumoDiario, 30 * 60 * 1000);
checarResumoDiario();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Gestão de Tarefas Shalom rodando na porta ' + PORT + (emailConfigurado() ? ' (e-mail ativo)' : ' (e-mail desativado)')));
