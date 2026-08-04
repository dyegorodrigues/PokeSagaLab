# Auditoria sistêmica — SAGA SpriteLab AI

**Repositório:** `dyegorodrigues/PokeSagaLab`  
**Data da auditoria:** 3–4 de agosto de 2026  
**Branch de recuperação:** `audit/fix-pmd-pipeline`  
**PR:** #1

## 1. Resumo executivo

A aplicação não estava falhando por um único bug visual. O problema principal era a inexistência de um contrato técnico confiável entre cinco camadas:

1. catálogo remoto do PMDCollab;
2. `AnimData.xml`;
3. sheets `Anim`, `Offsets` e `Shadow`;
4. modelo interno de frames;
5. exportação PMD.

A interface escondia essas falhas com fixtures, XML substituto e sprites procedurais. Isso fazia partes da aplicação parecerem funcionais, mas os dados carregados, visualizados e exportados não eram equivalentes ao material de origem.

A recuperação foi iniciada pelo núcleo de dados, e não pelo design. A branch atual substitui os fallbacks silenciosos por erros explícitos, implementa parsing estrito e preserva as três camadas técnicas necessárias para round-trip.

## 2. Causas-raiz confirmadas

### 2.1 Sincronização remota fictícia

O endpoint `/api/spritecollab/index` devolvia uma lista fixa em memória. O botão **Sincronizar** não consultava o catálogo oficial.

### 2.2 Substituição silenciosa de conteúdo

Quando um `AnimData.xml` não era encontrado, o servidor reutilizava dados do Pikachu. Quando uma sheet falhava, a interface desenhava círculos coloridos e continuava o fluxo. Isso mascarava erros de caminho, forma, rede e parsing.

### 2.3 Parser permissivo e destrutivo

O parser anterior:

- não validava XML;
- ignorava `CopyOf`;
- forçava oito direções;
- repetia linhas e colunas por módulo quando as dimensões não coincidiam;
- inventava durações e frames de fallback;
- não preservava sheets de offset e sombra por célula.

### 2.4 Exportação não reversível

O exportador gerava `AnimData.xml` e `*-Anim.png`, mas descartava `*-Offsets.png` e `*-Shadow.png`. Uma importação seguida de exportação perdia alinhamento corporal e posição da sombra.

### 2.5 Temporização incorreta

O Animation Studio e o Behavior Lab interpretavam cada tick PMD como aproximadamente 33,3 ms. O formato usa ticks de 1/60 de segundo, aproximadamente 16,67 ms. As animações eram reproduzidas com metade da velocidade correta.

### 2.6 IA sem contrato de frame

A saída do modelo de imagem podia ser muito maior que a célula lógica e era inserida diretamente no frame. O mesmo desenho era aplicado por padrão às oito direções, destruindo orientação. O limpador de fundo também removia branco mesmo quando o matte escolhido era magenta.

### 2.7 Estado local superficial

A duplicação de personagens reutilizava estruturas aninhadas por referência. E operações IndexedDB eram consideradas concluídas no sucesso da requisição, antes da confirmação da transação.

### 2.8 Crescimento por scripts temporários

Diversas alterações foram realizadas por scripts `patch_*.cjs` e reescritores temporários salvos na raiz. Isso tornou o histórico difícil de auditar e aumentou o risco de aplicar patches fora de ordem.

## 3. Correções implementadas na branch

### 3.1 Integração oficial PMDCollab

- cliente GraphQL para `spriteserver.pmdcollab.org`;
- índice de monstros e formas com cache;
- metadados de commit e atualização da fonte;
- ações reais, `CopyOf`, créditos, portrait e URLs das três sheets;
- proxy de assets limitado por allowlist de hosts;
- falhas remotas retornam erro explícito, sem conteúdo substituto.

### 3.2 Parser e modelo de domínio

- validação sintática de XML;
- validação de dimensões e durações;
- detecção de nomes duplicados, referências ausentes e ciclos de `CopyOf`;
- suporte estrito a uma ou oito direções;
- correspondência exata entre colunas e durações;
- preservação de `Anim`, `Offsets` e `Shadow` por frame;
- armazenamento separado de origem corporal e origem da sombra;
- warnings estruturados, sem criação de frames falsos.

### 3.3 Importação e exportação

- ZIP incompleto é rejeitado;
- busca de arquivos pelo basename, inclusive dentro de subpastas;
- `CopyOf` reutiliza frames internamente, mas não duplica sheets no ZIP;
- exportação inclui `AnimData.xml`, `*-Anim.png`, `*-Offsets.png` e `*-Shadow.png`;
- ações editadas que eram `CopyOf` tornam-se independentes;
- manifesto de exportação ganhou versão de schema e inventário das animações.

### 3.4 Interface principal

- erros remotos são exibidos ao usuário;
- biblioteca paginada em grupos de 48 itens;
- somente retratos da página visível são solicitados;
- formas, fase, shiny, gênero e caminho são preservados;
- criação do zero abre células transparentes, não um boneco procedural falso.

### 3.5 Animation Studio

- reprodução em ticks de 1/60 s;
- ações de uma e oito direções;
- visualização de sprite, offsets e sombra;
- âncoras corporal e da sombra;
- edição de duração e nudges apenas em cópia editável;
- exportação individual de cada camada;
- diagnóstico de `CopyOf` e warnings.

### 3.6 Laboratório de IA

- modelos oficiais configuráveis por variável de ambiente;
- remoção de fallbacks de texto usados como modelos de imagem;
- remoção de SVG procedural apresentado como sucesso da IA;
- geração de apenas um frame por operação;
- referência visual do frame selecionado;
- recorte restrito ao matte conectado ao perímetro;
- preservação de partes brancas do personagem;
- crop e normalização para a dimensão lógica exata;
- aprovação bloqueada quando o alpha é inválido;
- alteração somente da direção e frame selecionados.

### 3.7 Behavior Lab

- reprodução em ticks de 1/60 s;
- intenções comportamentais mapeadas às animações realmente disponíveis;
- fallbacks semânticos, como `Eat → Bite → Idle`;
- atualização React limitada a 20 Hz para reduzir custo no tablet;
- delta de tempo limitado para evitar saltos após aba em segundo plano;
- renderização alinhada pela origem do frame e origem da sombra.

### 3.8 Persistência e qualidade

- duplicação profunda de personagens;
- confirmação real das transações IndexedDB;
- fechamento explícito da conexão;
- testes do parser e do motor comportamental;
- CI com TypeScript, testes e build de produção.

## 4. Arquitetura resultante

```text
PMDCollab GraphQL
        │
        ▼
SpriteCollabService (server)
        │  metadados + URLs verificadas
        ▼
App loader
        │
        ├── AnimData parser ── CopyOf / dimensões / durations
        │
        ├── Sheet slicer ───── Anim + Offsets + Shadow
        │
        ▼
Creature / Animation / Frame
        │
        ├── Animation Studio
        ├── Pixel Editor
        ├── AI Frame Lab
        ├── Behavior Lab
        └── PMD Exporter
```

## 5. Verificação já executada

A GitHub Actions executa em cada commit da branch e do PR:

1. `npm ci`;
2. `tsc --noEmit`;
3. testes unitários;
4. build Vite;
5. bundle do servidor Express.

As execuções registradas durante a recuperação passaram após as principais refatorações.

## 6. Limitações ainda não encerradas

### 6.1 Teste integrado com a API externa

A CI confirma tipos, testes e build, mas não deve depender da disponibilidade do PMDCollab. Ainda é necessário testar manualmente, em ambiente publicado, pelo menos:

- uma forma base simples;
- uma forma com caminho aninhado;
- uma ação de uma direção;
- uma ação com `CopyOf`;
- download das três sheets;
- importação → exportação → reimportação.

### 6.2 Pixel Editor

O editor ainda precisa de uma rodada específica de UX e de consistência técnica para:

- editar também marcadores de mão/cabeça presentes em offsets PMD;
- comparar frame anterior/próximo de forma confiável;
- proteger aliases `CopyOf` antes de alterações;
- controlar paleta por personagem;
- suportar seleção, transformação e ferramentas de desenho mais produtivas.

### 6.3 Geração por IA

A normalização protege o formato, mas não garante consistência artística. O pipeline ainda precisa de:

- conjunto de referências por direção;
- validação de silhueta e paleta;
- comparação perceptual com o frame original;
- aprovação humana antes de substituir qualquer frame;
- geração em lote com fila, retries e orçamento explícito.

### 6.4 Licenças e publicação

O sistema deve conservar créditos e licença por asset. Assets de Pokémon e contribuições PMDCollab não devem ser tratados como arte própria do SAGA nem como autorização automática para uso comercial.

### 6.5 Limpeza do repositório

Scripts temporários `patch_*.cjs`, reescritores e assets de teste ainda precisam ser removidos da raiz em um commit de housekeeping. Eles não fazem parte da aplicação final.

## 7. Ordem recomendada para as próximas fases

1. publicar a branch em ambiente de preview e executar o roteiro integrado;
2. corrigir qualquer diferença real da API/asset observada no preview;
3. implementar teste de round-trip com um fixture PMD pequeno e autorizado;
4. revisar Pixel Editor;
5. adicionar projeto persistente de comportamento/Tamagotchi;
6. implementar fila de geração IA com orçamento e versões;
7. só então realizar a revisão visual completa da marca e das telas.

## 8. Critério de conclusão desta recuperação

A recuperação do núcleo só deve ser considerada concluída quando um personagem puder ser:

1. localizado no catálogo oficial;
2. carregado sem fallback;
3. reproduzido na velocidade correta;
4. inspecionado nas três camadas;
5. duplicado para edição;
6. alterado em um frame específico;
7. exportado;
8. reimportado sem mudança de dimensões, direções, durações, offsets ou sombra.
