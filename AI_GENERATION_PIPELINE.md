# AI_GENERATION_PIPELINE.md
1. **Planejamento:** Gemini 3.6 Flash analisa o pedido e gera o `GenerationPlan` estruturado em JSON.
2. **Geração/Edição:** Gemini Nano Banana (`gemini-3.1-flash-lite-image` / `gemini-3.1-flash-image`) gera a imagem com matte sólido.
3. **Pós-processamento:** Limpeza de fundo via Flood Fill, remoção de contaminação e normalização de células.
4. **Validação:** Verificação técnica de dimensão, grid, transparência e palette drift.
5. **Aprovação:** Usuário compara e aprova ou rejeita a nova versão.
