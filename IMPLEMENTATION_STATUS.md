# IMPLEMENTATION_STATUS.md

| Recurso | Planejado | Implementado | Testado | Evidência | Limitações |
| --- | --- | --- | --- | --- | --- |
| Sincronização e Busca SpriteCollab | Sim | Sim | Sim | Proxy Express + Cache | Rate limit do GitHub mitigado por cache e fixtures de fallback |
| Parser AnimData.xml | Sim | Sim | Sim | Leitura de 8 direções e durations | Suporte para tags extras em extra fields |
| Biblioteca Unificada | Sim | Sim | Sim | Unificação de 4 fontes no IndexedDB | Suporte local-first |
| Editor de Pixel Art e Offsets | Sim | Sim | Sim | Lápis, borracha, balde, undo/redo, offsets | Resolução lógica mantida |
| IA Gemini / Nano Banana | Sim | Sim | Sim | Planos de Geração e limpeza de Alpha | Exige API Key server-side |
| Laboratório de NPC | Sim | Sim | Sim | Wandering, eating, sleeping, touch reaction | Física 2D simplificada |
| Exportação/Importação ZIP | Sim | Sim | Sim | Zip contendo AnimData.xml + PNGs | Validação de round-trip integrada |
