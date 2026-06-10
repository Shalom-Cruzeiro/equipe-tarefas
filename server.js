const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Os dados ficam num arquivo JSON dentro da pasta de dados.
// No Render, aponte DATA_DIR para o disco persistente (ex.: /var/data),
// assim as tarefas nunca se perdem entre deploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const ARQUIVO = path.join(DATA_DIR, 'tarefas.json');

const STATUS_VALIDOS = ['todo', 'doing', 'review', 'done'];
const PRIORIDADES_VALIDAS = ['alta', 'media', 'baixa'];

// Carrega tudo na memória no início.
let tarefas = [];
try {
  if (fs.existsSync(ARQUIVO)) tarefas = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) || [];
} catch (e) {
  console.error('Aviso: não consegui ler o arquivo de dados, começando vazio.', e.message);
}

// Salva no disco de forma atômica (escreve num temporário e renomeia).
// Como o Node é mono-thread e fazemos tudo de forma síncrona dentro de cada
// requisição, não há risco de duas gravações se misturarem.
function salvarDisco() {
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tarefas, null, 2));
  fs.renameSync(tmp, ARQUIVO);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Listar
app.get('/api/tarefas', (req, res) => {
  res.json(tarefas);
});

// Criar
app.post('/api/tarefas', (req, res) => {
  const corpo = req.body || {};
  const titulo = (corpo.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'O título é obrigatório.' });

  const tarefa = {
    id: crypto.randomUUID(),
    titulo,
    responsavel: (corpo.responsavel || '').trim(),
    prazo: corpo.prazo || '',
    prioridade: PRIORIDADES_VALIDAS.includes(corpo.prioridade) ? corpo.prioridade : 'media',
    status: STATUS_VALIDOS.includes(corpo.status) ? corpo.status : 'todo',
    criado_em: new Date().toISOString(),
  };
  tarefas.push(tarefa);
  salvarDisco();
  res.json(tarefa);
});

// Atualizar (qualquer campo)
app.patch('/api/tarefas/:id', (req, res) => {
  const t = tarefas.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ erro: 'Tarefa não encontrada.' });

  const corpo = req.body || {};
  if ('titulo' in corpo) {
    const novo = (corpo.titulo || '').trim();
    if (!novo) return res.status(400).json({ erro: 'O título não pode ficar vazio.' });
    t.titulo = novo;
  }
  if ('responsavel' in corpo) t.responsavel = (corpo.responsavel || '').trim();
  if ('prazo' in corpo) t.prazo = corpo.prazo || '';
  if ('prioridade' in corpo && PRIORIDADES_VALIDAS.includes(corpo.prioridade)) t.prioridade = corpo.prioridade;
  if ('status' in corpo && STATUS_VALIDOS.includes(corpo.status)) t.status = corpo.status;

  salvarDisco();
  res.json(t);
});

// Excluir
app.delete('/api/tarefas/:id', (req, res) => {
  const antes = tarefas.length;
  tarefas = tarefas.filter((x) => x.id !== req.params.id);
  if (tarefas.length !== antes) salvarDisco();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Quadro da equipe rodando na porta ' + PORT));
