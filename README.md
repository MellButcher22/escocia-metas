# Escócia — Login real compartilhado

Esta versão troca o login de demonstração por autenticação no servidor, com sessão e banco SQLite.

## Contas iniciais
- Usuário: `gabi`
- Usuário: `lider`
- A senha inicial das duas contas é `troque-esta-senha`.

**Troque as senhas antes de publicar.** Também altere `SESSION_SECRET` no ambiente do servidor.

## Rodar no computador
1. Instale Node.js.
2. Abra um terminal nesta pasta.
3. Rode `npm install`.
4. Rode `npm start`.
5. Abra `http://localhost:3000`.

## Para você e o líder acessarem pela internet
Esse projeto precisa ser publicado em um servidor (por exemplo, Render, Railway ou outro serviço que rode Node.js). O arquivo `escocia.db` ficará no servidor. Depois da publicação, vocês usam o mesmo link.

Importante: esta etapa já tem autenticação real, mas o gerenciamento completo de membros/metas ainda deve ser ligado às tabelas do banco. O visual permanece o modelo da Escócia com lobos.
