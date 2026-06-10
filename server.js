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

// Data de hoje no fuso de São Paulo (YYYY-MM-DD), para comparar prazos corretamente.
function hojeStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ---------- Carregar dados (com migração do formato antigo) ----------
let dados = { tarefas: [], membros: [], areas: [] };
try {
  if (fs.existsSync(ARQUIVO)) {
    const parsed = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    if (Array.isArray(parsed)) {
      dados.tarefas = parsed; // formato antigo: só uma lista de tarefas
    } else if (parsed && typeof parsed === 'object') {
      dados = { tarefas: parsed.tarefas || [], membros: parsed.membros || [], areas: parsed.areas || [] };
    }
  }
} catch (e) {
  console.error('Aviso: não consegui ler os dados, começando vazio.', e.message);
}
// Garante que toda tarefa tenha os campos novos.
dados.tarefas.forEach((t) => {
  if (!('area' in t)) t.area = '';
  if (!('concluido_em' in t)) t.concluido_em = '';
});

function salvarDisco() {
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, ARQUIVO);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Tudo de uma vez ----------
app.get('/api/dados', (req, res) => res.json(dados));

// ---------- Tarefas ----------
app.post('/api/tarefas', (req, res) => {
  const c = req.body || {};
  const titulo = (c.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'O título é obrigatório.' });
  const status = STATUS_VALIDOS.includes(c.status) ? c.status : 'todo';
  const tarefa = {
    id: crypto.randomUUID(),
    titulo,
    responsavel: (c.responsavel || '').trim(),
    area: (c.area || '').trim(),
    prazo: c.prazo || '',
    prioridade: PRIORIDADES_VALIDAS.includes(c.prioridade) ? c.prioridade : 'media',
    status,
    criado_em: new Date().toISOString(),
    concluido_em: status === 'done' ? hojeStr() : '',
  };
  dados.tarefas.push(tarefa);
  salvarDisco();
  res.json(tarefa);
});

app.patch('/api/tarefas/:id', (req, res) => {
  const t = dados.tarefas.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  const c = req.body || {};
  const eraDone = t.status === 'done';

  if ('titulo' in c) {
    const novo = (c.titulo || '').trim();
    if (!novo) return res.status(400).json({ erro: 'O título não pode ficar vazio.' });
    t.titulo = novo;
  }
  if ('responsavel' in c) t.responsavel = (c.responsavel || '').trim();
  if ('area' in c) t.area = (c.area || '').trim();
  if ('prazo' in c) t.prazo = c.prazo || '';
  if ('prioridade' in c && PRIORIDADES_VALIDAS.includes(c.prioridade)) t.prioridade = c.prioridade;
  if ('status' in c && STATUS_VALIDOS.includes(c.status)) t.status = c.status;

  const agoraDone = t.status === 'done';
  if (!eraDone && agoraDone) t.concluido_em = hojeStr();
  if (eraDone && !agoraDone) t.concluido_em = '';

  salvarDisco();
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
  const nome = ((req.body || {}).nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'O nome é obrigatório.' });
  if (dados.membros.some((m) => m.nome.toLowerCase() === nome.toLowerCase()))
    return res.status(400).json({ erro: 'Esse membro já está cadastrado.' });
  const membro = { id: crypto.randomUUID(), nome, funcao: ((req.body || {}).funcao || '').trim() };
  dados.membros.push(membro);
  salvarDisco();
  res.json(membro);
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
  if (dados.areas.some((a) => a.nome.toLowerCase() === nome.toLowerCase()))
    return res.status(400).json({ erro: 'Essa área já existe.' });
  const cor = CORES_AREA[dados.areas.length % CORES_AREA.length];
  const area = { id: crypto.randomUUID(), nome, cor };
  dados.areas.push(area);
  salvarDisco();
  res.json(area);
});

app.delete('/api/areas/:id', (req, res) => {
  dados.areas = dados.areas.filter((a) => a.id !== req.params.id);
  salvarDisco();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Quadro da equipe rodando na porta ' + PORT));
