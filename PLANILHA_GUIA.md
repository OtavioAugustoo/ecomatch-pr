# Eco Impact — Guia da Planilha Google Sheets

## Estrutura do projeto

```
eco-impact/
├── index.html          ← interface HTML (5 perguntas, branding Eco Impact)
├── style.css           ← estilos customizados (radio-cards, animações)
├── script.js           ← lógica JavaScript (fetch transposto, match 5 critérios, 3 abas)
└── PLANILHA_GUIA.md    ← este arquivo
```

---

## 1. Nova estrutura da planilha — Formato TRANSPOSTO

A planilha do **Mapeamento de Oportunidades de Financiamento Climático** usa formato **transposto**:
cada campo é uma **linha** e cada oportunidade é uma **coluna**.

| Dimensão | Localização na planilha |
|---|---|
| Nome dos campos | **Coluna B** (uma linha por campo) |
| Oportunidade 1 | **Coluna D** |
| Oportunidade 2 | **Coluna E** |
| … | … |
| Oportunidade 10 | **Coluna M** |

### Estrutura de linhas obrigatória

```
Linha 1-2 → metadados/cabeçalhos gerais (não processados pelo script)
Linha 3   → "Oportunidade 1" em D3, "Oportunidade 2" em E3, ..., "Oportunidade 10" em M3
Linha 4+  → campos: coluna B = nome do campo, colunas D–M = valores por oportunidade
```

> **Atenção:** A linha 3 é a âncora que o script usa para identificar quais colunas
> são oportunidades. Não deixe as células D3:M3 vazias.

---

## 2. Tabela completa de campos (nome exato na coluna B)

O nome do campo na **coluna B** deve ser idêntico ao listado abaixo — inclusive maiúsculas,
acentos e parênteses. O script usa esses nomes como chave de cada objeto de oportunidade.

### BLOCO 1 — Identificação

| Campo (coluna B) | Descrição | Exemplo |
|---|---|---|
| `Nome da Oportunidade` | Nome completo do fundo ou edital | `Vox Capital — Tech for Good Growth II` |
| `Instituição` | Razão social ou nome da gestora | `Vox Capital Gestão de Recursos Ltda.` |
| `Descrição da Oportunidade` | Texto descritivo exibido na Aba 1 do card | `Fundo de equity focado em empresas tech de impacto...` |
| `Link do Edital` | URL completa com https:// | `https://voxcapital.com.br/tech-for-good` |
| `Link do Site` | URL completa com https:// | `https://voxcapital.com.br` |

### BLOCO 2 — Temporalidade e Abrangência

| Campo (coluna B) | Descrição | Exemplo |
|---|---|---|
| `Status` | Situação atual do processo | `Aberto` / `A abrir` / `Fechado` |
| `Data de Abertura` | Data de início das inscrições | `01/03/2026` |
| `Data de Encerramento` | Prazo final (exibido no card) | `30/06/2026` |
| `Recorrência` | Frequência de abertura | `Contínuo` / `Anual` / `Bienal` |
| `País/Região de Origem do Recurso` | Procedência dos recursos | `Brasil` / `EUA / Europa` |
| `Área Geográfica Elegível` | Onde o projeto pode ser executado | `Brasil` / `América Latina` |
| `Período de Execução do Projeto` | Duração máxima do projeto apoiado | `Até 5 anos` |

### BLOCO 3 — Foco Temático

| Campo (coluna B) | Descrição | Exemplo |
|---|---|---|
| `Setor` | Setor(es) elegíveis — **usado no match** | `Saúde, Educação, Agronegócio Sustentável` |
| `Frente de Atuação` | Detalhamento do foco | `Tecnologia para impacto social` |
| `Tipo de Impacto Esperado` | Impacto primário esperado | `Redução de emissões / Inclusão financeira` |
| `Co-benefícios Socioambientais` | Externalidades positivas | `Geração de emprego, restauração florestal` |
| `Escala de Intervenção Esperada` | Abrangência geográfica do impacto | `Municipal` / `Nacional` / `Regional` |

### BLOCO 4 — Financeiro

| Campo (coluna B) | Descrição | Exemplo |
|---|---|---|
| `Moeda` | Moeda dos recursos | `BRL` / `USD` / `EUR` |
| `Valor por Projeto (Mín./Máx.)` | Faixa de aporte por empresa | `R$ 10 milhões – R$ 40 milhões` |
| `Volume Total do Fundo/Edital` | Envelope total disponível | `R$ 300 milhões` |
| `Natureza do Apoio` | Reembolsável, não reembolsável ou ambos | `Não reembolsável` / `Reembolsável` / `Ambos` |
| `Modalidade de Apoio` | Instrumento financeiro — **usado no match** | `Equity` / `Grant` / `Mezzanine / Blended Finance` / `Loan` |

### BLOCO 5 — Critérios e Condições

| Campo (coluna B) | Descrição | Onde aparece no card |
|---|---|---|
| `Principais Requisitos Técnicos e Institucionais` | Pré-requisitos obrigatórios | Aba 3 — seção "Requisitos" |
| `Critérios Básicos de Avaliação` | O que será avaliado na seleção | Aba 3 — seção "Critérios de Avaliação" |
| `Contrapartida Exigida` | Coparticipação financeira obrigatória | Aba 3 — seção "Contrapartida" |
| `Condições Financeiras` | Taxas, carências, garantias | Aba 3 — caixa amarela GSGA |
| `Maturidade do Projeto` | Estágio exigido da empresa | Aba 2 — campo Maturidade |
| `Tipo de Beneficiário Elegível` | Forma jurídica aceita | Aba 2 — campo Beneficiário |
| `Porte` | Porte elegível — **usado no match** | Aba 2 — campo Porte + match |

---

## 3. Como o algoritmo lê o formato transposto

### Etapa 1 — Apps Script retorna array 2D

O Apps Script deve ser configurado para retornar a planilha como **array bidimensional**
(não o formato antigo de objetos). Cole este código no Apps Script:

```javascript
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data  = sheet.getDataRange().getValues();
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

O JSON retornado é uma lista de listas: `[[linha1col1, linha1col2, ...], [linha2col1, ...], ...]`

### Etapa 2 — parseTransposedSheet() monta os objetos

A função `parseTransposedSheet(rawRows)` em `script.js`:

1. Lê `rawRows[2]` (linha 3) para encontrar as colunas de oportunidade (índices D=3 até M=12)
2. Para cada linha seguinte (`rawRows[3]` em diante), lê `rawRows[row][1]` (coluna B) como nome do campo
3. Para cada coluna de oportunidade encontrada, lê o valor e adiciona ao objeto `{campo: valor}`
4. Filtra objetos onde `Nome da Oportunidade` está vazio (colunas sem dados)

**Resultado:** array de objetos, um por oportunidade:

```json
[
  {
    "Nome da Oportunidade": "Vox Capital — Tech for Good Growth II",
    "Instituição": "Vox Capital Gestão de Recursos Ltda.",
    "Status": "Aberto",
    "Setor": "Saúde, Educação, Finanças Inclusivas, Agronegócio Sustentável",
    "Porte": "Pequena Empresa / Média Empresa",
    "Modalidade de Apoio": "Equity",
    "Valor por Projeto (Mín./Máx.)": "R$ 10 milhões – R$ 40 milhões por empresa"
  },
  { ... }
]
```

### Etapa 3 — matchFinanciamentos() aplica os filtros

O array de objetos é então passado para `matchFinanciamentos()` que aplica os 4 critérios ativos.

---

## 4. Os 5 critérios do diagnóstico

| # | Pergunta no formulário | Campo na planilha | Lógica de match |
|---|---|---|---|
| 1 | Setor de atuação | `Setor` | Planilha **contém** o valor selecionado, ou é `Todos` |
| 2 | Porte da empresa | `Porte` | Planilha **contém** o valor selecionado, ou é `Todos` |
| 3 | Desafio principal | *(informativo)* | **Não filtra** — apenas coletado para contexto |
| 4 | Tipo de capital buscado | `Modalidade de Apoio` | Planilha **contém** a modalidade, ou usuário escolheu `Qualquer modalidade` |
| 5 | Status desejado | `Status` | Ver tabela abaixo |

### Regras do filtro de Status

| Opção selecionada pelo usuário | Comportamento |
|---|---|
| ✅ Apenas oportunidades abertas agora | Mostra só `Status = "Aberto"` |
| 📅 Abertas e a abrir em breve | Mostra `Status = "Aberto"` **ou** `"A abrir"` |
| 🔍 Todas (incluindo fechadas) | Sem filtro — retorna todas |

### Valores válidos por campo de match

**Campo `Setor`** — valores que o usuário pode selecionar:

| Opção no formulário | Valor interno | Exemplos válidos na planilha |
|---|---|---|
| 🌱 Bioeconomia | `bioeconomia` | `Bioeconomia` / `Todos` |
| 🌾 Agricultura de Baixo Carbono (ABC) | `abc` | `Agricultura de Baixo Carbono (ABC)` / `ABC` / `Todos` |
| 🏭 Indústria / CCUS | `industria` | `Indústria/CCUS` / `Industria` / `Todos` |
| 💚 Saúde & Bem-estar | `saude` | `Saúde` / `Saúde, Educação` / `Todos` |
| 📚 Educação & Inclusão Social | `educacao` | `Educação` / `Educação & Inclusão Social` / `Todos` |
| 💼 Serviços & Tecnologia | `servicos` | `Serviços` / `Tecnologia` / `Todos` |

**Campo `Porte`** — valores que o usuário pode selecionar:

| Opção no formulário | Valor interno | Exemplos válidos na planilha |
|---|---|---|
| MEI / Microempresa | `micro` | `MEI / Microempresa` / `Microempresa` / `Todos` |
| Pequena Empresa | `pequena` | `Pequena Empresa` / `Pequena` / `Todos` |
| Média Empresa | `media` | `Média Empresa` / `Media` / `Todos` |
| Grande Empresa | `grande` | `Grande Empresa` / `Grande` / `Todos` |

**Campo `Modalidade de Apoio`** — valores válidos na planilha:

| Modalidade | Como escrever na planilha |
|---|---|
| Equity | `Equity` ou `Equity / Participação societária` |
| Mezzanine / Blended Finance | `Mezzanine` ou `Blended Finance` ou `Mezzanine / Blended Finance` |
| Grant | `Grant` ou `Grant / Doação` |
| Loan / Crédito | `Loan` ou `Crédito` |
| Disponível para qualquer modalidade | `Todos` |

> **Dica:** Use `Todos` em qualquer campo de match quando a oportunidade for elegível
> para qualquer combinação. Ela aparecerá independente do que o usuário selecionar.

---

## 5. Os 10 fundos mapeados — resumo

| # | Nome da Oportunidade | Instituição | Modalidade | Ticket Estimado | Status |
|---|---|---|---|---|---|
| 1 | Tech for Good Growth II | Vox Capital | Equity | R$ 10M – R$ 40M | Aberto |
| 2 | Fundo de Impacto Ventures | Rise Ventures | Equity | A confirmar | A abrir |
| 3 | LAC Blended Finance Fund | Blue like an Orange | Blended Finance | A confirmar | Aberto |
| 4 | Fundo Brasil Clima & Direitos | Fundo Brasil | Grant | R$ 50K – R$ 500K | A abrir |
| 5 | FSA CAIXA Sustentável | FSA CAIXA | Loan | A confirmar | A confirmar |
| 6–10 | *(preencher na planilha)* | — | — | — | — |

> Atualize esta tabela conforme as oportunidades forem mapeadas e validadas pelo GSGA.
> Os campos da planilha determinam o que o algoritmo lê — esta tabela é apenas para referência.

---

## 6. Como conectar a planilha ao sistema

O sistema suporta **duas fontes de dados**, configuradas em `script.js`:

```js
const APPS_SCRIPT_URL      = '...'; // Opção A (recomendada)
const GOOGLE_SHEET_CSV_URL = '...'; // Opção B
```

### Opção A — Google Apps Script (recomendada)

Funciona ao abrir o `index.html` **diretamente no navegador** (`file://`) sem servidor local.
Resolve CORS automaticamente.

**Passo a passo:**

1. Abra a planilha → **Extensions → Apps Script**
2. Apague o código existente e cole:

```javascript
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data  = sheet.getDataRange().getValues();
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New Deployment → Web App**
4. *Who has access* → **Anyone** → **Deploy**
5. Copie a URL gerada e cole em `APPS_SCRIPT_URL` no `script.js`

> **Atenção:** Este Apps Script retorna o array 2D bruto da planilha (não os objetos
> do formato antigo). Se você tinha um script anterior, **substitua completamente**.

---

### Opção B — URL CSV do Google Sheets

Funciona se o `index.html` for aberto via **VS Code Live Server** (`http://`).
**Não funciona** ao abrir direto no navegador (`file://`) por restrições de CORS.

**Passo a passo:**

1. Abra a planilha → **Arquivo → Compartilhar → Publicar na Web**
2. Selecione a aba com os dados
3. Formato: **Valores separados por vírgula (.csv)**
4. **Publicar** → copie a URL → cole em `GOOGLE_SHEET_CSV_URL` no `script.js`

O script converte o CSV em array 2D com `parseCSVRaw()` antes de passar para
`parseTransposedSheet()`, replicando o mesmo comportamento da Opção A.

A URL atual configurada no projeto:
```
https://docs.google.com/spreadsheets/d/e/2PACX-1vRLYx5dDYydLOqBrZu_ZS5jsXHnOPUmN1HsTXK-aYH5quXNagNg2dnjy4SPzszyKeWrOneLAOnKgXMu/pub?output=csv
```

---

## 7. Erros comuns e como diagnosticar

Abra o console do navegador com **F12 → aba Console** durante um diagnóstico.
O script imprime logs detalhados de cada etapa.

| Sintoma no site | Causa provável | Solução |
|---|---|---|
| "Nenhuma Oportunidade Encontrada" | Filtros muito restritivos ou dados incorretos na planilha | Escolha "Qualquer modalidade" + "Todas" e tente novamente; verifique o console (F12) |
| "Erro ao Acessar a Planilha" | Abrindo via `file://` sem Apps Script configurado | Configure `APPS_SCRIPT_URL` ou abra via Live Server |
| "Fonte de Dados Não Configurada" | Ambas as variáveis de URL estão vazias no `script.js` | Preencha `APPS_SCRIPT_URL` ou `GOOGLE_SHEET_CSV_URL` |
| `parseTransposedSheet: 0 oportunidades` | Linha 3 (D3:M3) está vazia na planilha | Adicione "Oportunidade 1", "Oportunidade 2"... nas células D3 a M3 |
| Card sem dados (campos "—") | Nome do campo na coluna B diferente do esperado | Confirme os nomes exatos da tabela da Seção 2 deste guia |
| Apps Script retorna erro | Script antigo (formato de objetos) ainda instalado | Substitua o código do Apps Script pelo da Seção 6 deste guia |
| Dados desatualizados | Cache do Google Sheets (~5 minutos) | Aguarde até 5 minutos após salvar a planilha |
| Botão "Mapear" não habilita | Alguma das 5 perguntas não foi respondida | Verifique se todas as 5 perguntas têm uma opção selecionada |
