# PROJECT_STATE

- objetivo atual: Auditoria de conformidade, depuração das queixas e estabilização de fluxo.
- fluxo vertical atual: sincronizar -> pesquisar 0025 -> abrir -> XML -> listar animações -> reproduzir Idle e Walk -> duplicar -> salvar -> recarregar -> confirmar
- último resultado verificável: Test-parse e testes da interface do Pivot demonstraram falha humana nos eixos (agora invertidos e corrigidos), matemática dos offsets e renderização correta; stopPropagation ausente nos botões (corrigido previamente); modelo gerando placeholders devido a fallbacks silenciosos em `geminiService.ts` sem a chave da API (substituído por Error explícito).
- arquivos alterados: `src/components/AnimationStudio.tsx`, `server/services/geminiService.ts`
- comandos executados: `npm run build`, extração raw dos arrays e offsets via script em Node (test-parse.cjs).
- bloqueios: Nenhum.
- riscos: Baixo.
- próximo passo concreto: Reportar descobertas ao usuário.
- estado de lint, typecheck, testes e build: Build completo sem erros e bundle minimizado.
