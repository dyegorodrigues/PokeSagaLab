# Status da recuperação

**Atualizado em:** 4 de agosto de 2026  
**Branch:** `audit/fix-pmd-pipeline`  
**Pull request:** #1  
**Estado:** núcleo reconstruído; aguardando validação visual em preview antes do merge.

## Verificações concluídas

- [x] instalação limpa com `npm ci`;
- [x] TypeScript com `tsc --noEmit`;
- [x] testes unitários do parser PMD;
- [x] testes unitários do motor de comportamento;
- [x] build Vite de produção;
- [x] bundle do servidor Express;
- [x] consulta real à API GraphQL oficial do PMDCollab;
- [x] localização do Pikachu no índice oficial;
- [x] download de uma sheet real;
- [x] validação da assinatura binária PNG;
- [x] remoção da fixture antiga do SpriteCollab;
- [x] remoção de scripts temporários `patch_*.cjs`, reescritores, testes descartáveis e sheet solta.

## O que está comprovado

O código atual compila, os testes passam e a integração de servidor consegue consultar o PMDCollab e baixar um asset verdadeiro. O pipeline interno agora preserva `Anim`, `Offsets`, `Shadow`, durações, direções e `CopyOf`.

## O que ainda precisa ser observado visualmente

Antes de retirar o PR do modo rascunho e fundir no `main`, publicar uma preview da branch e executar:

1. pesquisar e abrir uma forma base;
2. abrir uma forma com caminho aninhado;
3. reproduzir `Idle`, `Walk`, `Attack` e uma ação `CopyOf`;
4. alternar entre `Anim`, `Offsets` e `Shadow`;
5. duplicar o personagem para o banco local;
6. editar um frame e uma âncora;
7. exportar o ZIP;
8. reimportar o ZIP exportado;
9. comparar direções, frames, durações, offsets e sombra;
10. gerar uma única variação por IA e confirmar que somente o frame selecionado muda;
11. testar o Behavior Lab no tablet sem travamentos.

## Política de merge

Não fundir somente porque a CI está verde. O merge deve ocorrer após o roteiro visual acima ou após um teste equivalente em navegador real. Essa restrição protege o `main` de regressões de Canvas, IndexedDB, responsividade e renderização que não aparecem no build automatizado.
