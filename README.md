# SAGA SpriteLab AI

Editor experimental de sprites PMD para pesquisar personagens, inspecionar animações, editar frames, testar comportamentos, gerar variações com IA e exportar pacotes compatíveis com a estrutura SpriteBot/PMDCollab.

> O projeto está em recuperação técnica. Consulte [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) antes de expandir funcionalidades.

## O que esta branch implementa

- catálogo remoto pela API GraphQL oficial do PMDCollab;
- leitura estrita de `AnimData.xml`;
- suporte a ações reais e `CopyOf`;
- sheets com uma ou oito direções;
- preservação de `Anim`, `Offsets` e `Shadow`;
- Animation Studio com timing PMD de 1/60 s;
- Pixel Editor e persistência local em IndexedDB;
- geração de um frame por vez com Gemini/Nano Banana;
- recorte de matte e normalização para a célula lógica;
- Behavior Lab ligado às animações disponíveis;
- importação e exportação ZIP;
- testes, typecheck e build automatizados no GitHub Actions.

## Requisitos

- Node.js 22;
- npm;
- navegador com Canvas 2D e IndexedDB;
- `GEMINI_API_KEY` apenas para recursos de IA.

## Executar localmente

```bash
npm ci
cp .env.example .env
npm run dev
```

A aplicação e a API Express são servidas em `http://localhost:3000` por padrão.

## Verificações

```bash
npm run lint
npm test
npm run build
```

Ou execute tudo:

```bash
npm run check
```

## Estrutura principal

```text
server.ts
server/services/
  geminiService.ts
  spritecollabService.ts
src/
  components/
  domain/parser/
  domain/behavior/
  services/
  stores/
  types/
tests/
docs/
```

## Fluxo PMD

```text
API oficial PMDCollab
  → metadados e URLs verificadas
  → AnimData.xml
  → Anim + Offsets + Shadow
  → Creature / Animation / Frame
  → edição, comportamento e IA
  → exportação ZIP PMD
```

## Variáveis de ambiente

Consulte [`.env.example`](.env.example). Os modelos padrão são:

- planejamento: `gemini-3.5-flash`;
- geração principal: `gemini-3.1-flash-image`;
- geração econômica: `gemini-3.1-flash-lite-image`;
- fallback legado: `gemini-2.5-flash-image`.

Falhas de API são retornadas explicitamente. A aplicação não cria mais sprites procedurais para simular sucesso da IA.

## Licenças e propriedade intelectual

O código deste repositório e os assets carregados remotamente são assuntos distintos.

- preserve os créditos e termos de cada contribuição do PMDCollab;
- não trate personagens ou sprites de Pokémon como propriedade do SAGA;
- não presuma autorização comercial por um asset estar publicamente acessível;
- para produto próprio, use criaturas e animações originais ou assets com licença compatível.

## Status

A branch `audit/fix-pmd-pipeline` está sendo validada no PR #1. O critério técnico de conclusão é realizar um round-trip real — carregar, editar, exportar e reimportar — sem perder dimensões, direções, durações, offsets ou sombra.
