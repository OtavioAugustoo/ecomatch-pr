# EcoMatch PR

> Plataforma de mapeamento inteligente de capital catalítico para PMEs sustentáveis de Curitiba.

![Status](https://img.shields.io/badge/status-protótipo%20funcional-green)
![Licença](https://img.shields.io/badge/licença-MIT-blue)
![Projeto](https://img.shields.io/badge/tipo-extensão%20universitária-orange)

---

## Sobre o Projeto

**EcoMatch PR** é um protótipo funcional desenvolvido como projeto de extensão universitária. A plataforma atua como um sistema de matchmaking entre Pequenas e Médias Empresas (PMEs) de Curitiba e linhas de financiamento sustentável — o chamado **capital catalítico**.

O usuário responde um diagnóstico de 3 perguntas sobre o perfil da sua empresa. O sistema consulta uma base de dados mantida no Google Sheets, aplica um algoritmo de match e exibe as linhas de crédito mais compatíveis com o perfil informado, junto com uma análise de viabilidade financeira e jurídica para cada resultado.

A análise jurídica é feita em parceria com o escritório **Gaia Silva Gaede Advogados (GSGA)**, especializado em direito ambiental e tributário.

---

## Demonstração

### Fluxo principal

```
Usuário preenche o diagnóstico (Setor + Porte + Desafio)
        ↓
Sistema consulta o Google Sheets via Apps Script
        ↓
Algoritmo de match filtra as linhas compatíveis
        ↓
Cards de resultado são renderizados dinamicamente
        ↓
Usuário visualiza Viabilidade Financeira e Alerta Jurídico (GSGA)
```

### Ecossistema de parceiros

| Instituição | Papel |
|---|---|
| BRDE | Banco Regional de Desenvolvimento |
| FINEP | Financiadora de Estudos e Projetos |
| BNDES | Fundo Clima e outros programas |
| GSGA | Análise jurídica e compliance ambiental |
| SEBRAE-PR | Apoio às PMEs |

---

## Funcionalidades

- **Formulário de diagnóstico** com 3 perguntas em radio-cards interativos e indicador de progresso visual
- **Loading animado** com textos sequenciais simulando o processamento da IA
- **Algoritmo de match flexível** — compara Setor e Porte sem distinção de acentos, maiúsculas ou caracteres especiais
- **Cards de resultado dinâmicos** renderizados a partir dos dados da planilha, com suporte a múltiplos resultados simultâneos
- **Abas por card** — Viabilidade Financeira e Viabilidade Jurídica (Alerta GSGA)
- **Lista de benefícios** formatada automaticamente quando separada por `|` na planilha
- **Tratamento de erros** com mensagens amigáveis para 3 cenários distintos (sem URL, sem match, erro de rede)
- **Diagnóstico no console** (F12) para facilitar manutenção e depuração

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Markup | HTML5 semântico |
| Estilo | Tailwind CSS via CDN + CSS customizado |
| Scripts | JavaScript vanilla (ES2017+) |
| Tipografia | Google Fonts — Inter |
| Back-end | Google Sheets + Google Apps Script |

Nenhuma dependência de `npm`, `node_modules` ou framework JavaScript. O projeto roda abrindo o `index.html` diretamente no navegador.

---

## Estrutura do Projeto

```
ecomatch-pr/
├── index.html          # Estrutura HTML da interface
├── style.css           # Estilos customizados (radio-cards, animações, gradientes)
├── script.js           # Lógica JavaScript (fetch, match, render, reset)
├── PLANILHA_GUIA.md    # Guia completo para alimentar a planilha Google Sheets
└── README.md           # Este arquivo
```

---

## Como Executar

### Opção 1 — Abrir diretamente no navegador (requer Apps Script configurado)

```bash
# Clone o repositório
git clone https://github.com/OtavioAugustoo/ecomatch-pr.git

# Abra o arquivo no navegador
# Windows
start index.html
```

> Para funcionar sem servidor local, é necessário configurar o Google Apps Script
> como fonte de dados (veja seção **Configuração** abaixo).

### Opção 2 — VS Code Live Server

1. Instale a extensão **Live Server** no VS Code
2. Clique com botão direito em `index.html` → **Open with Live Server**
3. O site abre em `http://127.0.0.1:5500` — a URL CSV do Google Sheets funciona normalmente nesse contexto

---

## Configuração

### 1. Estrutura da planilha Google Sheets

Crie uma planilha com os seguintes cabeçalhos na **linha 1**:

| Nome_Financiamento | Setor | Porte | Beneficios | Alerta_GSGA |
|---|---|---|---|---|

**Valores aceitos em `Setor`:** `Bioeconomia`, `Agricultura de Baixo Carbono (ABC)`, `Indústria/CCUS`, `Serviços`, `Todos`

**Valores aceitos em `Porte`:** `Microempresa`, `Pequena Empresa`, `Média Empresa`, `Todos`

> `Todos` funciona como curinga — a linha aparece para qualquer valor selecionado no formulário.

Para exibir benefícios como lista, separe os itens com `|`:
```
Taxa 7% a.a. | Carência 3 anos | Prazo 10 anos | Até R$ 850 mil
```

Consulte o [PLANILHA_GUIA.md](PLANILHA_GUIA.md) para documentação completa.

---

### 2. Conectar ao Google Sheets

Abra o arquivo `script.js` e localize o bloco de configuração no topo:

```js
const APPS_SCRIPT_URL      = ''; // Opção A — recomendada
const GOOGLE_SHEET_CSV_URL = ''; // Opção B — requer Live Server
```

#### Opção A — Google Apps Script (recomendada)

Funciona ao abrir o arquivo diretamente no navegador (`file://`). Resolve o
problema de CORS do Google Sheets automaticamente.

1. Na sua planilha, vá em **Extensions → Apps Script**
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

3. **Deploy → New Deployment → Web App**
4. Em *"Who has access"* → **Anyone**
5. Clique em **Deploy** e copie a URL gerada
6. Cole em `APPS_SCRIPT_URL` no `script.js`

#### Opção B — URL CSV do Google Sheets

1. Na planilha: **Arquivo → Compartilhar → Publicar na Web**
2. Selecione a aba → formato **CSV** → Publicar
3. Cole a URL gerada em `GOOGLE_SHEET_CSV_URL` no `script.js`
4. Abra o projeto via **VS Code Live Server** (não funciona via `file://`)

---

## Algoritmo de Match

A função `matchFinanciamentos()` em `script.js` percorre todas as linhas da
planilha e inclui no resultado aquelas onde:

- `Setor` da planilha **contém** o setor selecionado, ou é igual a `Todos`
- **E** `Porte` da planilha **contém** o porte selecionado, ou é igual a `Todos`

A comparação usa `normalizeStr()`, que remove acentos, converte para minúsculas
e ignora caracteres especiais antes de comparar. Assim, `"Indústria/CCUS"` faz
match com `"industria"` sem nenhuma configuração adicional.

```
"Agricultura de Baixo Carbono (ABC)"
        ↓ normalizeStr()
"agricultura de baixo carbono abc"
        ↓ .includes("abc")
✅ MATCH
```

**Dica de depuração:** abra o console do navegador (**F12 → Console**) durante
um diagnóstico para ver o log completo de match linha a linha.

---

## Design

- **Paleta de cores:** Verde Floresta (`#1B4332`), Azul Marinho (`#1E3A5F`), Cinza Claro, Branco
- **Tipografia:** Inter (Google Fonts)
- **Estilo:** Dashboard fintech corporativo — limpo, responsivo e com animações suaves
- **Animações:** `fadeInUp` nos cards de resultado, `float` nos ícones decorativos do hero, spinner duplo no loading

---

## Contexto Acadêmico

Este projeto foi desenvolvido como protótipo funcional para a disciplina de
**Projeto Empreendedor** do curso de Engenharia de Software — 1º semestre de 2026.

O EcoMatch PR integra conceitos de:
- Finanças sustentáveis e capital catalítico
- UX/UI para plataformas B2B
- Integração com APIs externas sem back-end próprio
- Segurança jurídica em projetos de impacto ambiental (parceria GSGA)

---

## Licença

Este projeto é de uso acadêmico. Distribuído sob a licença MIT.
