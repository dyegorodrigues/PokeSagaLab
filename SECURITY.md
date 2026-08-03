# SECURITY.md, PERFORMANCE.md & DATA_MIGRATIONS.md

## Segurança
- Segredos mantidos no servidor (process.env.GEMINI_API_KEY e GITHUB_TOKEN).
- Sanitização de arquivos XML/HJSON e proteção contra Path Traversal em ZIPs.

## Desempenho
- Cache local e carregamento sob demanda para o SpriteCollab.
- Processamento de imagem acelerado em Canvas 2D/Web Workers.

## Migrações
- Schema versão 1.0 com compatibilidade retroativa para versões locais de personagens no IndexedDB.
