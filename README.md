# Quadro da Equipe

Um quadro de tarefas compartilhado para a equipe. Uma página única (HTML) que todos
acessam pelo mesmo link, editam ao mesmo tempo e veem as mudanças uns dos outros.
As tarefas ficam guardadas em disco persistente — não se perdem.

## Como funciona

- **`server.js`** — servidor Node/Express. Serve a página e oferece a API (criar, ler, editar, excluir tarefas).
- **`public/index.html`** — a interface do quadro (quatro colunas: A fazer, Fazendo, Em revisão, Concluído).
- **Dados** — guardados num arquivo dentro do disco persistente do Render. Sobrevivem a reinícios e deploys.
- **Sincronização** — cada navegador busca novidades a cada 5 segundos, então todos veem as atualizações da equipe.

## Rodar no seu computador (opcional, para testar antes)

```bash
npm install
npm start
```

Abra http://localhost:3000. Localmente os dados ficam na pasta `data/`.

## Publicar no Render

1. Suba esta pasta para um repositório no **GitHub**.
2. No painel do Render, clique em **New → Blueprint** e selecione o repositório.
   O Render lê o arquivo `render.yaml` e cria automaticamente o serviço web **com o disco persistente** já configurado.
   - (Alternativa manual: **New → Web Service**, build `npm install`, start `npm start`,
     adicione um **Disk** montado em `/var/data` e a variável de ambiente `DATA_DIR=/var/data`.)
3. Aguarde o deploy. O Render dá uma URL com HTTPS (ex.: `https://quadro-equipe.onrender.com`).
4. Compartilhe esse link com a equipe. Pronto — todos usam o mesmo quadro.

## Notas

- O disco persistente é o que garante que as tarefas **não somem** entre deploys.
- Quem tiver o link consegue ver e editar (não há login). Bom para uso interno;
  dá para adicionar uma senha/login depois, se precisar.
- Backup é simples: os dados ficam no arquivo `tarefas.json` dentro do disco.
