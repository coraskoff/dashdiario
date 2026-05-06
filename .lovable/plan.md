## Notas — nova seção

Módulo de notas inspirado no Apple Notes: lista densa, pastas opcionais, editor markdown simples com toggle de preview, mobile como experiência principal.

### Backend (migration)

Duas tabelas no schema público, RLS public (mesmo padrão das outras tabelas do app):

- **`note_folders`**: `id`, `name`, `created_at`, `updated_at`
- **`notes`**: `id`, `folder_id` (nullable, FK→note_folders, ON DELETE SET NULL), `title`, `content` (text, markdown cru), `created_at`, `updated_at`
- Trigger `update_updated_at_column` em ambas
- Índice em `notes(folder_id)` e `notes(updated_at DESC)`

### Rota e arquitetura

- `src/routes/notes.tsx` — nova rota, link "Notas" adicionado no header (`__root.tsx`)
- `src/modules/notes/api.ts` — CRUD de pastas e notas
- `src/modules/notes/types.ts` — tipos `Note`, `NoteFolder`
- Estado de seleção via URL search params (`?folder=<id|all>&note=<id>`) — permite deep link e back/forward funcionam

### Layout — Desktop (≥768px)

Três colunas, sem decoração desnecessária, hairlines `border-border/60`:

```text
┌──────────┬──────────────────┬──────────────────────────┐
│ Pastas   │ Notas (lista)    │ Editor                   │
│          │                  │                          │
│ Todas    │ ── Título        │ [Editar] [Preview] ⋯ ⬇   │
│ • Ideias │   snippet…       │ ────────────────────     │
│ • Diário │   30 abr         │ # Título                 │
│ + Nova   │ ── Título        │ Conteúdo markdown…       │
│          │ ── ...           │                          │
└──────────┴──────────────────┴──────────────────────────┘
   220px         320px              flex-1
```

- **Sidebar pastas**: "Todas as notas" sempre no topo, depois pastas ordenadas por nome, contador de notas à direita em `text-muted-foreground`. Ação "Nova pasta" inline (input que aparece ao clicar em `+`). Hover/active = `bg-secondary`.
- **Lista de notas (estilo Apple Notes)**: linhas de ~76px com título (`text-[14px] font-medium`), snippet de 1 linha (`text-[12px] text-muted-foreground` com markdown stripado), data relativa em `text-[11px]`. Divider hairline. Selecionada = `bg-secondary`. Topo da coluna: busca discreta (`Input` ghost).
- **Editor**: header com título inline editável (input sem borda, `text-xl font-semibold`), toggle segmented `Editar | Preview` à direita, menu `⋯` (mover para pasta, duplicar, deletar) e botão download. Body: textarea full-height monoespaçada sutil (`font-mono text-[14px] leading-relaxed`) OU preview renderizado (react-markdown + remark-gfm).
- **CTA Nova nota**: botão primário discreto no topo da coluna do meio, `+ Nova nota`.

### Layout — Mobile (<768px) — Apple Notes-like

Navegação em 3 telas que deslizam (controladas por estado/URL, não router):

1. **Pastas** (raiz `/notes`): lista de pastas full-width, linhas grandes (52px) com chevron `›`. "Todas as notas" no topo destacada. FAB inferior `+` para nova pasta.
2. **Lista de notas** (com `?folder=`): header com back chevron + nome da pasta, busca pinned no topo, lista densa de notas. FAB grande circular (56px) inferior-direito com `+` (lápis no ícone) para nova nota — segue padrão do FAB de Finanças.
3. **Editor** (com `?note=`): full-screen, header sticky com back, título editável centralizado, ações `⋯` e download. Toggle Editar/Preview como segmented control compacto abaixo do header. Textarea ocupa o resto da viewport com `min-height: calc(100dvh - header)`. Sem zoom em foco (`text-base` no input).

Transições suaves: `translate-x` com `transition-transform duration-300 ease-out` ao avançar/voltar entre telas (sensação iOS).

### Editor markdown

- Textarea simples (sem dependências pesadas), salva markdown cru
- Toggle **Editar / Preview** (segmented control de 2 opções, estado local)
- Preview: `react-markdown` + `remark-gfm` (instalar via `bun add react-markdown remark-gfm`), estilizado com `prose prose-sm dark:prose-invert max-w-none` (Tailwind typography já está? — verificar; se não, estilos manuais com tokens semânticos para h1-h3, code, blockquote, listas)
- **Autosave**: debounce 600ms via `useEffect` → update no Supabase, indicador discreto "Salvo" → "Salvando…" no header
- Título: input separado, salva on blur ou debounce

### Download

- **Por nota**: botão `↓` no header do editor → gera `.txt` com `# {título}\n\n{content}` → blob download. Nome: `{slug-do-titulo}-{YYYY-MM-DD}.txt`
- **Pasta inteira**: no menu `⋯` da pasta (ou botão no header da lista mobile) → `Exportar pasta` → gera `.zip` com todas as notas via `jszip` (`bun add jszip`). Nome: `{nome-da-pasta}-{YYYY-MM-DD}.zip`. "Todas as notas" também exportável.

### Diretrizes visuais aplicadas

- Tipografia primeiro: hierarquia por peso/tamanho, não por cor de fundo
- Hairlines `border-border/60` ao invés de cards com sombra dentro do módulo
- Cor com restrição: foreground/muted-foreground/secondary; nenhum acento colorido (notas não têm semântica de cor)
- Sem ícones genéricos coloridos: ícones lucide em `text-muted-foreground` tamanho 16px
- Empty states autorais: "Nenhuma nota ainda" com glifo `·` e CTA inline (não ilustração genérica)
- Microinterações: hover sutil (`bg-secondary/60`), focus-visible com `ring-1 ring-ring`
- Mobile: respeita safe-area (`pb-[env(safe-area-inset-bottom)]`), targets ≥44px

### Arquivos a criar/editar

- `supabase/migrations/<ts>_notes.sql` (nova migration)
- `src/modules/notes/api.ts` (novo)
- `src/modules/notes/types.ts` (novo)
- `src/modules/notes/markdown.ts` (helper: strip markdown para snippet, slugify)
- `src/modules/notes/export.ts` (helper: gerar .txt e .zip)
- `src/routes/notes.tsx` (novo — orquestra desktop/mobile, search params)
- `src/components/notes/FoldersSidebar.tsx`
- `src/components/notes/NotesList.tsx`
- `src/components/notes/NoteEditor.tsx`
- `src/components/notes/MobileNotesShell.tsx` (gerencia as 3 telas mobile)
- `src/routes/__root.tsx` (adicionar `<NavLink to="/notes">Notas</NavLink>`)
- `package.json` (adicionar `react-markdown`, `remark-gfm`, `jszip`)

### Confirmação antes de implementar

A migration precisa ser aprovada por você antes do código rodar. Posso prosseguir?
