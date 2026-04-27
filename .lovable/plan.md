## O que muda

### 1. Header de métricas (topo)

Substituir o atual "Saldo + Planejado/Realizado/Projeção" por **4 métricas pareadas** (prévia vs atual), no estilo "valor grande + delta sutil abaixo":

- **Entradas** — soma das transações `income` do mês. (sem par prévia/atual — é só um número)
- **Saídas** — soma de tudo que saiu: realizado das categorias variáveis + transações `expense` avulsas.
- **Variáveis** — duas linhas:
  - Prévia: total planejado do mês (ex.: R$ 2.000)
  - Atual: projeção híbrida = realizado + (média diária restante × dias que faltam)
- **Média diária** — duas linhas:
  - Prévia: `planejado_total / dias_no_mês` (ex.: 2000/31 ≈ R$ 64,52)
  - Atual: `(planejado_total − realizado_até_ontem) / dias_restantes_incluindo_hoje` — esta é a métrica que **redistribui automaticamente** quando o usuário gasta menos/mais que a prévia do dia.

Layout: linha horizontal com 4 blocos separados por divisores verticais finos. Cada bloco: rótulo eyebrow pequeno, número dominante tabular-nums, e abaixo a comparação prévia↔atual em cinza com um delta colorido (verde se sobrando, vermelho se estourando).

### 2. Lógica de cálculo (`calculations.ts`)

Reformular `CategoryBreakdown` e adicionar funções no nível do mês:

- `plannedDaily` continua sendo a **prévia fixa** = `planned / totalDays`.
- Adicionar `currentDaily` = média diária **dinâmica**: `max(0, (planned − realizadoAcumulado) / max(1, diasRestantesIncluindoHoje))`.
  - Se referência é mês passado: 0. Se mês futuro: igual à prévia.
- `projected` (= "Variáveis atual") passa a ser: `realizadoAcumulado + currentDaily × diasRestantesIncluindoHoje`. Para uma categoria sem desvios, isso bate com o `planned` original — exatamente o comportamento que o usuário descreveu (sobra de hoje se redistribui).
- Nova função `buildMonthTotals(breakdowns, transactions, month, refDate)` retornando `{ income, expenseTotal, plannedVariables, currentVariables, plannedDaily, currentDaily }`.

### 3. Linha de cada categoria (Plan section)

Hoje mostra "X/dia previsto · Y/dia real". Trocar para refletir o mesmo modelo:
- "prévia: R$ 64,52/dia · agora: R$ 61,80/dia" (com cor no "agora" se subiu/desceu).
- Mantém a barra de progresso realizado vs planejado.

### 4. Exemplo numérico (validação mental)

Plano: Variáveis = R$ 2000, mês 30 dias, hoje dia 10.
- Prévia diária = 2000/30 = R$ 66,67.
- Prévia até hoje (dia 10): 10 × 66,67 = R$ 666,67. Hoje "esperava" gastar R$ 66,67.
- Usuário registra que gastou R$ 43 hoje. Realizado acumulado = 9×66,67 (dias 1–9 ainda sem registro, usam prévia) + 43… 

**Detalhe importante**: no modelo híbrido atual, dias passados sem registro contam como prévia. Isso vai inflar o "realizado" artificialmente. Proposta: o **realizado real** usado na média diária atual deve contar **apenas registros reais** (não a prévia dos dias passados). A "Variáveis atual" continua usando a regra híbrida (real + prévia para dias sem registro), o que mantém consistência: se você não registrou nada, projeção = plano.

Então:
- `realizadoReal` = soma só de `daily_expenses` do mês (43 no exemplo).
- `currentDaily` = (2000 − 43) / 21 dias restantes = R$ 93,19/dia → mas isso fica esquisito porque inclui dias 1–9 sem registro como "ainda disponíveis".

**Decisão**: usar a regra **híbrida também na média diária atual**, para coerência:
- `gastoEfetivoAteOntem` = soma híbrida dos dias < hoje (real onde existe, prévia onde não existe).
- `currentDaily` = `(planned − gastoEfetivoAteOntem) / diasRestantesIncluindoHoje`.
- No exemplo: dias 1–9 = 9 × 66,67 = 600 (prévia, pois sem registro). Restam 21 dias. `currentDaily` = (2000 − 600) / 21 = R$ 66,67. Igual à prévia ✓.
- Quando o usuário registra hoje (dia 10) R$ 43 em vez dos 66,67 previstos, o cálculo de amanhã (dia 11) será: gasto efetivo até dia 10 = 600 + 43 = 643. Restam 20 dias. `currentDaily` = (2000 − 643)/20 = R$ 67,85. **Subiu** porque sobrou orçamento → ✓ exatamente o comportamento pedido.

### 5. Arquivos afetados

- `src/modules/finance/calculations.ts` — adicionar `currentDaily`, `gastoEfetivoAteOntem`, `buildMonthTotals`. Manter compat onde possível.
- `src/routes/finance.tsx` — substituir `HeadlineNumbers` por novo `MetricsBar` com 4 blocos pareados; ajustar texto da linha de categoria.
- Remover do header o "Saldo do mês" (não foi pedido). Saldo continua derivável (Entradas − Saídas) mas não é destaque.

### 6. Decisões visuais (intencionais)

- 4 métricas em linha horizontal (não cards), divididas por linhas verticais finas — ritmo de "leitura tabular", não dashboard genérico.
- Cada par prévia↔atual em uma única linha pequena abaixo do número, com seta `↑`/`↓` colorida e o delta absoluto. Reduz carga cognitiva: o usuário lê o número grande e, se quiser entender o porquê, olha a linha de baixo.
- Tipografia tabular-nums em todos os valores monetários.
