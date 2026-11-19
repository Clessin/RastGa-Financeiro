# RastGa — Controle Financeiro Pessoal (PWA)

Aplicação web responsiva (**Mobile-First / PWA**) de controle financeiro pessoal integrada ao **Supabase** (`@supabase/supabase-js`), com tema **Azul Cereja Profundo (`#1E1B4B` / `#2A1B4E`) + Clean Body (`#F8F9FA`)**.

## Funcionalidades Principais

- **Cabeçalho de Salário e Saldo Disponível (Exclusivo na Home)**:
  - Alteração de salário base em **2 etapas obrigatórias** (confirmação + input).
  - Cálculo automático de **Saldo Atual Disponível** (`Salário Base + Entradas Extras - Dívidas Pagas - Gastos`).
  - Toggle de privacidade (ícone de olho) para ocultar/exibir valores (`R$ ••••`).
- **Controle de Dívidas e Tempo de Vida (Parcelamentos)**:
  - Cadastro de contas fixas (`total_installments = 1`) ou compras parceladas (`current_installment` / `total_installments`).
  - Cálculo automático de parcelas restantes (*"Faltam X parcelas"*), previsão de término (*"Acaba em Mês/Ano"*) e barra de progresso em Azul Cereja.
  - Botão **[Pagar]** e botão **[↺ Desfazer]** para reverter pagamentos marcados por engano.
- **Gastos Rápidos e Entradas Extras**:
  - Categorias com ícones dedicados (**Carrinho**, **Moto**, **Alimentação**, **Outros**) e filtro por **TAGs**.
- **Relatórios Minimalistas**:
  - **Gasto Total com Gasolina**: Filtro automático no mês vigente por tag ou descrição contendo *"gasolina"* ou *"combustível"*.
  - **Termômetro de Sobra Real do Mês**.
  - **Ranking de Gastos por TAG**.
  - **Radar de Vencimentos e Progresso de Quitação**.
  - **Raio-X: Custo Fixo vs. Gastos do Dia a Dia**.
  - **Resumo de Entradas**.
  - **Fim dos Parcelamentos** (total comprometido nos próximos meses e data de término).

## Como Executar

### Opção 1: Versão Standalone PWA (Sem precisar instalar Node.js)
Basta abrir o arquivo [`index.html`](./index.html) ou executar [`Iniciar_Controle_Financeiro.bat`](./Iniciar_Controle_Financeiro.bat).

### Opção 2: Next.js / React
1. Copie `.env.example` para `.env.local` e configure suas chaves do Supabase:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua_chave_publishable_ou_anon
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_publishable_ou_anon
   ```
2. Instale as dependências e inicie o servidor:
   ```bash
   npm install
   npm run dev
   ```

## Estrutura do Banco de Dados (Supabase)
O script SQL completo para criação das tabelas `incomes` e `transactions` (incluindo `total_installments` e `current_installment`) está em [`supabase/schema.sql`](./supabase/schema.sql).
