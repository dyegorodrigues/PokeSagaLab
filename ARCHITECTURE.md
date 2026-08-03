# ARCHITECTURE.md - SAGA SpriteLab AI

## Arquitetura Full-Stack
- **Servidor:** Node.js + Express (porta 3000, 0.0.0.0)
  - Endpoint Proxy GitHub para SpriteCollab (`/api/spritecollab/*`)
  - Endpoint Gemini AI para Geração e Análise (`/api/gemini/*`)
  - Pipeline de Tratamento Determinístico de Imagem e Alpha (`/api/image/*`)
- **Cliente:** React 19 + TypeScript + Tailwind CSS + Lucide Icons + Motion
  - Biblioteca Unificada com 4 fontes (Remoto, Local, Gerado, Importado)
  - Persistência Local via IndexedDB (Dexie / Raw IDB)
  - Interpretador de AnimData.xml
  - Editor de Pixel Art e Timeline
  - Laboratório de Comportamento de NPC (Máquina de Estados)
  - Exportador e Importador de Pacotes ZIP
