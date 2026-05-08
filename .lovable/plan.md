
# Timer — foco gamificado com heatmap e metas

## Visão geral

Nova rota `/timer` adicionada ao header (Tarefas · Finanças · Notas · **Timer**). Duas camadas:

1. **Tela de foco (fullscreen branco)** — relógio analógico contando, count-up ou count-down, projeto opcional. Zero ruído visual durante a sessão.
2. **Tela home do Timer** — heatmap estilo GitHub + estatísticas + metas semanais. É o que aparece quando nada está rodando.

## Fluxo de uso

```text
/timer (home)
  ├─ Botão grande "Iniciar foco"
  │     ↓ escolhe modo (livre / 25 / 50 / 90 min) + projeto opcional + tag opcional
  │     ↓ entra em /timer/focus  (tela branca, relógio analógico)
  │           ↓ pausa / retoma / finaliza
  │           ↓ ao zerar (pomodoro): notificação navegador + som + título da aba pisca
  │           ↓ volta para /timer com a sessão salva
  ├─ Heatmap dos últimos ~3 meses (12 semanas × 7 dias)
  ├─ Cards de stats (tempo total, projeto top, horário mais produtivo, streak)
  └─ Bloco de meta semanal (global + por projeto, progresso e ritmo necessário)
```

## Tela de foco (o coração da feature)

Tela 100% branca (`bg-background`), sem header, sem nav. Centro absoluto:

- **Relógio analógico** desenhado em SVG. Mostrador minimalista: 12 traços finos (mais grosso nas posições 12/3/6/9), sem numerais. Ponteiro de minutos e ponteiro de segundos finos em `foreground`. No count-up, ponteiros giram a partir do 12. No count-down, um arco fino preenchendo o restante (visualização do tempo que falta).
- **Tempo digital** abaixo do relógio em fonte tabular grande (`text-7xl tracking-tight font-light tabular-nums`) — `HH:MM:SS`.
- **Linha contextual** acima do relógio: nome do projeto · tag (cinza claro, `text-xs uppercase tracking-widest`).
- **Controles** discretos no rodapé central: Pausar · Finalizar. Ghost buttons, aparecem on-hover/tap. Tecla `espaço` pausa, `esc` abre confirmação de finalizar.
- **Sair sem salvar**: `esc esc` ou ícone × no canto superior direito (o único elemento de UI fixa).
- **Wake lock**: tenta segurar `navigator.wakeLock` para não apagar a tela durante a sessão.
- **Tab title** mostra `25:00 · Manyfesto` para acompanhar com a aba em background.
- **Persistência**: a sessão ativa fica em `localStorage` (start, mode, project, tag, paused intervals) — recarregar a página continua de onde parou.

Justificativa de design: tela branca pura + relógio analógico cria um "ritual de foco". Diferente de qualquer dashboard de produtividade — é um objeto único, intencional. Sem decoração, sem barrinha de progresso colorida, sem motivacional. O relógio é a obra.

## Tela home (`/timer`)

Layout em 3 blocos verticais, alinhados ao container existente:

### 1. Header da seção + CTA
```text
SEU FOCO
Esta semana.                                      [Iniciar foco →]
```
Mesma tipografia do `/finance` ("SEMANA DE..." + título grande). CTA primário sólido à direita.

### 2. Heatmap estilo GitHub
- Grid de 12–14 semanas × 7 dias (linhas = dias da semana, colunas = semanas; última coluna = semana atual).
- 4 níveis (sem incluir o vazio):
  - `0` cinza muito claro (`bg-muted/40`)
  - `<1h` `oklch(0.85 0.04 150)`
  - `1–2h` `oklch(0.72 0.10 150)`
  - `2–3h` `oklch(0.60 0.14 150)`
  - `3h+` `oklch(0.48 0.18 150)` (escala única, verde-sálvia, sem arco-íris)
- Hover/tap mostra tooltip "qua, 7 mai · 1h 23min · 2 sessões".
- Labels mensais sutis em cima (`mai · jun · jul`), labels de dia ("seg, qua, sex") à esquerda em micro caps.

### 3. Stats cards (4 colunas no desktop, 2 no mobile)
- **Tempo total (semana)** — `12h 40min` + delta vs semana anterior em texto pequeno
- **Projeto top** — nome + barra horizontal mini com share %
- **Horário mais produtivo** — faixa "14h–17h" derivada do histograma de sessões dos últimos 30 dias
- **Streak** — "9 dias consecutivos" com pulso sutil

### 4. Meta semanal (bloco destacado, hairline `border-border/60`)
```text
META · 25H ESTA SEMANA                                    Editar metas
─────────────────────────────────────────────
12h 40min  ·········  25h
[barra de progresso fina, ~50%]
Faltam 12h 20min em 3 dias  ·  ~4h 07min/dia para bater
```
Abaixo, **metas por projeto** em lista densa (apenas projetos com meta definida):
```text
Manyfesto    8h / 12h    ▓▓▓▓▓▓░░░░  faltam 4h
Arko         3h / 5h     ▓▓▓▓▓▓░░░░  faltam 2h
Severino     1h 40min    sem meta · definir →
```

### 5. Sessões recentes (lista densa, opcional/colapsável)
Estilo Apple Notes: linha por sessão, tempo · projeto · horário · duração. Permite deletar/editar duração caso esqueça de finalizar.

## Mobile

- Home: header + heatmap (scroll horizontal se não couber) + cards empilhados + meta + FAB grande "Iniciar foco" fixo no rodapé central (consistente com Finanças).
- Tela de foco: idêntica ao desktop — branca, relógio centralizado, controles no rodapé acima da safe-area.
- Notificações: pede permissão na primeira tentativa de pomodoro.

## Modelo de dados (Supabase)

Três tabelas novas, RLS público (consistente com o resto do projeto):

**`timer_sessions`**
- `project_id` uuid nullable (FK lógica para `projects`)
- `tag` text nullable
- `mode` text — `'count_up' | 'count_down'`
- `planned_seconds` int nullable (só para count-down)
- `started_at` timestamptz
- `ended_at` timestamptz nullable (null = sessão em andamento, recuperável)
- `duration_seconds` int — tempo efetivo (descontando pausas)
- `completed` bool — chegou ao fim do pomodoro?
- Índices em `started_at desc` e `project_id`

**`timer_goals`** — meta global semanal
- `weekly_seconds` int
- linha única (upsert), sem `user_id` no padrão atual do projeto

**`timer_project_goals`**
- `project_id` uuid
- `weekly_seconds` int
- unique (`project_id`)

Trigger `update_updated_at_column` em todas. Sem CHECK constraints temporais.

## Notificações

- `Notification.requestPermission()` na primeira sessão de pomodoro.
- Ao zerar: `new Notification("Foco concluído · 25min em Manyfesto")` + Web Audio API tocando um sino curto (gerado, sem asset externo) + título da aba pisca entre `✓ Concluído` e o original por 8s.
- Toast in-app via sonner quando a aba está em foreground.

## Arquitetura

```text
src/modules/timer/
  ├─ types.ts              TimerSession, TimerGoal, ProjectGoal, Mode
  ├─ api.ts                CRUD (fetchSessions, startSession, finishSession, getGoals, setGoals)
  ├─ stats.ts              agregações: heatmapBuckets, weeklyTotal, topProject, peakHours, streak
  ├─ notify.ts             permission, fire notification, beep via WebAudio, tab-title flasher
  ├─ wake-lock.ts          acquire/release com fallback silencioso
  └─ active-session.ts     localStorage persistence da sessão em curso

src/components/timer/
  ├─ AnalogClock.tsx       SVG, count-up & count-down (arco), tamanho responsivo
  ├─ Heatmap.tsx           grid + tooltip
  ├─ StatCard.tsx
  ├─ WeeklyGoalBar.tsx
  ├─ ProjectGoalRow.tsx
  ├─ StartFocusDialog.tsx  escolhe modo + projeto + tag, abre /timer/focus
  └─ FocusOverlay.tsx      tela branca fullscreen (usada em /timer/focus)

src/routes/
  ├─ timer.tsx             home
  └─ timer.focus.tsx       tela de foco fullscreen
```

`__root.tsx`: adicionar item "Timer" na nav (entre Finanças e Notas, ou depois de Notas — manter ordem do produto).

## Consistência visual

- Hairlines `border-border/60`, sem cards coloridos.
- Tipografia: títulos no mesmo padrão de `/finance` e `/tasks`.
- Verde do heatmap em uma única matiz (sálvia), respeitando a regra do projeto de cor com restrição.
- Nada de gradiente, glow, ou "celebração colorida". Gamificação vem da clareza dos números (faltam X · ritmo Y · streak Z), não de confete.

## O que está fora do escopo

- Integração com tarefas (iniciar timer a partir de uma task) — pode vir depois.
- Compartilhamento social do heatmap.
- Histórico exportável (.csv).
- Multi-device sync em tempo real durante a sessão (localStorage cobre o caso comum de F5).

