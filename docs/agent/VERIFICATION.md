# VERIFICATION

- Sincronização: LocalStore index
- Personagem Remoto (0025): Busca raw assets validada via api
- AnimData.xml: Parsing refatorado validado para grid real
- Reprodução de Animações (Offsets): Extracao de `originX/Y` da cor verde (`0, 255, 0`) validado no `test-parse.cjs`. Pivot compensa a diferença entre os eixos.
- Duplicação Local: Correção da propagação de evento `onClick`.
- IA: Troca do gerador procedural pelo arremesso de erro (throw) quando `GEMINI_API_KEY` for nulo, garantindo que o usuário veja que não está utilizando o Nano Banana de fato quando as chaves não estão informadas.
