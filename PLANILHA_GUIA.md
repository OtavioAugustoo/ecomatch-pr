# EcoMatch PR — Guia da Planilha Google Sheets

## Estrutura do projeto

```
Projeto Inova/
├── index.html          ← estrutura HTML da interface
├── style.css           ← estilos customizados (radio-cards, animações, etc.)
├── script.js           ← toda a lógica JavaScript (fetch, match, render)
└── PLANILHA_GUIA.md    ← este arquivo
```

---

## Estrutura obrigatória da planilha

A **linha 1** deve ter exatamente estes cabeçalhos (já configurados na sua planilha):

```
Nome_Financiamento | Setor | Porte | Beneficios | Alerta_GSGA
```

A partir da **linha 2**, cada linha é uma oportunidade de financiamento.

---

## Coluna `Setor`

O site oferece 4 opções ao usuário. O valor digitado na planilha é comparado
de forma **flexível**: o algoritmo remove acentos, ignora maiúsculas e
caracteres especiais antes de comparar. Basta que um valor **contenha** o outro.

| Opção no site                          | Exemplos válidos na planilha              |
|----------------------------------------|-------------------------------------------|
| Bioeconomia                            | `Bioeconomia`                             |
| Agricultura de Baixo Carbono (ABC)     | `Agricultura de Baixo Carbono (ABC)` / `ABC` |
| Indústria / CCUS                       | `Indústria/CCUS` / `Industria`            |
| Serviços                               | `Serviços` / `Servicos`                   |
| *(aparece para qualquer setor)*        | `Todos`                                   |

---

## Coluna `Porte`

| Opção no site    | Exemplos válidos na planilha          |
|------------------|---------------------------------------|
| Microempresa     | `Microempresa` / `Micro`              |
| Pequena Empresa  | `Pequena Empresa` / `Pequena`         |
| Média Empresa    | `Média Empresa` / `Media`             |
| *(qualquer porte)* | `Todos`                             |

> **Dica:** Use `Todos` quando uma linha de crédito for elegível para qualquer
> porte de empresa. Ela aparecerá no resultado independente do que o usuário
> selecionar no formulário.

---

## Coluna `Beneficios`

Texto livre exibido no painel **Viabilidade Financeira** do card de resultado.

Para exibir como **lista com checkmarks**, separe cada item com `|`:

```
Taxa 7% a.a. | Carência de até 3 anos | Prazo total de 10 anos | Até R$ 850 mil
```

Se não usar `|`, o texto aparece como parágrafo único.

---

## Coluna `Alerta_GSGA`

Texto livre exibido dentro da **caixa amarela de alerta jurídico** no painel
"Viabilidade Jurídica" do card de resultado.

Descreva aqui quais requisitos legais ou ambientais essa linha exige e como
o escritório **Gaia Silva Gaede Advogados (GSGA)** pode ajudar.

---

## Exemplo completo de planilha

| Nome_Financiamento              | Setor                              | Porte          | Beneficios                                                                          | Alerta_GSGA                                                                                                      |
|---------------------------------|------------------------------------|----------------|-------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Plano Safra — Programa ABC+     | Agricultura de Baixo Carbono (ABC) | Pequena Empresa | Taxa 7% a.a. \| Carência 3 anos \| Prazo 10 anos \| Foco em ILPF e pastagens        | O acesso exige CAR regular e ausência de embargos. O GSGA atua na regularização fundiária e ambiental.            |
| BRDE PCS — Produção Sustentável | Indústria/CCUS                     | Média Empresa  | Financia 100% do projeto \| Prazo até 12 anos \| Recursos de fundos europeus          | Projetos CCUS demandam licenciamento IAT/IBAMA. O GSGA garante conformidade antes da submissão ao banco.           |
| FINEP Inovação e Bioeconomia    | Bioeconomia                        | Todos          | Taxas abaixo do mercado \| Prazos longos \| Foco em produtos biodegradáveis          | Envolve riscos de Propriedade Intelectual. O GSGA protege patentes e contratos de transferência de tecnologia.    |
| Banco Verde — Fomento Paraná    | Serviços                           | Microempresa   | Crédito ágil \| Taxas estaduais incentivadas \| Solar, frotas e eficiência energética | Exige CNDs impecáveis. O GSGA auxilia na regularização fiscal e tributária da microempresa.                       |

---

## Como conectar a planilha ao sistema

O sistema suporta **duas formas** de buscar os dados, configuradas no arquivo
`script.js` nas variáveis do topo:

```js
const APPS_SCRIPT_URL      = '...'; // Opção A (recomendada)
const GOOGLE_SHEET_CSV_URL = '...'; // Opção B
```

### Opção A — Google Apps Script (recomendada)

Funciona ao abrir o `index.html` **diretamente no navegador** (`file://`),
sem precisar de servidor local. Resolve o problema de CORS automaticamente.

**Passo a passo:**

1. Abra sua planilha → menu **Extensions → Apps Script**
2. Apague o código existente e cole:

```javascript
function doGet() {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows    = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return ContentService
    .createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Clique em **Deploy → New Deployment**
4. Tipo: **Web App**
5. Em *"Who has access"* → selecione **Anyone**
6. Clique em **Deploy** e copie a URL gerada
7. Cole a URL em `APPS_SCRIPT_URL` no arquivo `script.js`

> Quando `APPS_SCRIPT_URL` está preenchida, o sistema a usa automaticamente
> e ignora `GOOGLE_SHEET_CSV_URL`.

---

### Opção B — URL CSV do Google Sheets

Funciona se o `index.html` for aberto via **VS Code Live Server** (`http://`).
**Não funciona** ao abrir direto no navegador (`file://`) por restrições de
CORS do Google.

**Passo a passo:**

1. Abra a planilha → **Arquivo → Compartilhar → Publicar na Web**
2. Selecione a aba com os dados
3. Escolha o formato **Valores separados por vírgula (.csv)**
4. Clique em **Publicar** e confirme
5. Copie a URL gerada e cole em `GOOGLE_SHEET_CSV_URL` no arquivo `script.js`

A URL atual configurada no projeto:
```
https://docs.google.com/spreadsheets/d/e/2PACX-1vTtSwKC-PE1IoYGZZj23-hacJvFpwChIOkXqcX2POJsSOi-lUxEDnld7ENUGk9AFJv5IWnonolmXt5l/pub?output=csv
```

---

## Como o algoritmo de match funciona

O `script.js` executa a função `matchFinanciamentos()` que percorre todas as
linhas da planilha e inclui no resultado aquelas onde:

- A coluna `Setor` **contém** o setor selecionado (ou tem `Todos`)
- **E** a coluna `Porte` **contém** o porte selecionado (ou tem `Todos`)

A comparação usa `normalizeStr()`, que:
- Remove acentos (`Indústria` → `industria`)
- Remove caracteres especiais (`/`, `(`, `)`)
- Converte tudo para minúsculas

Portanto, **não é necessário que os valores sejam idênticos** — basta que
um contenha o outro após a normalização.

**Diagnóstico:** abra o console do navegador com **F12 → aba Console** durante
um diagnóstico para ver linha a linha quais registros deram match e por quê.

---

## Erros comuns

| Sintoma no site                    | Causa provável                                              | Solução                                                         |
|------------------------------------|-------------------------------------------------------------|-----------------------------------------------------------------|
| "Nenhuma Linha Encontrada"         | Combinação Setor+Porte sem correspondência na planilha      | Use `Todos` no Porte ou adicione mais linhas; verifique o console (F12) |
| "Erro ao Acessar a Planilha"       | Abrindo via `file://` sem Apps Script configurado           | Configure `APPS_SCRIPT_URL` no `script.js` ou use Live Server   |
| "Fonte de Dados Não Configurada"   | Ambas as variáveis de URL estão vazias no `script.js`       | Preencha `APPS_SCRIPT_URL` ou `GOOGLE_SHEET_CSV_URL`            |
| Dados desatualizados no site       | Google Sheets tem cache de alguns minutos                   | Aguardar até 5 minutos após salvar a planilha                   |
| Card aparece mas sem conteúdo      | Nome das colunas diferente do esperado                      | Confirmar que a linha 1 tem exatamente: `Nome_Financiamento`, `Setor`, `Porte`, `Beneficios`, `Alerta_GSGA` |
