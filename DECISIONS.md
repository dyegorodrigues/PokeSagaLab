# DECISIONS.md - Registro de Decisões Técnicas

1. **Persistência Local-First**: Utilização do IndexedDB no cliente para garantir autonomia, sem dependência obrigatória de banco externo antes do funcionamento local.
2. **Modelo do Gemini Centralizado**: `ModelRegistry` no servidor com suporte a `gemini-3.6-flash` para inteligência e `gemini-3.1-flash-lite-image` / `gemini-3.1-flash-image` para imagem (Nano Banana), com fallbacks configuráveis.
3. **Limpeza de Alpha Determinística**: O resultado da IA passa por pós-processamento determinístico com algoritmo flood-fill de borda e chaveamento matte (magenta/verde/ciano) para remoção de fundos e decontaminação de bordas.
4. **Proxy GitHub Server-Side**: As requisições para o repositório PMDCollab/SpriteCollab são feitas pelo servidor Express com suporte a cabeçalhos ETag, protegendo o token e contornando limites do navegador.
5. **Fixtures de Fallback**: Caso a API do GitHub limite requisições, o servidor possui dados e assets pré-carregados para o Sprite 0025 (Pikachu), garantindo que o primeiro fluxo vertical nunca falhe.
