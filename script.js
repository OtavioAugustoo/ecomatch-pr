/**
 * EcoMatch PR — script.js
 * ─────────────────────────────────────────────────────────────
 * Toda a lógica de negócio da plataforma:
 *   1. Configuração das URLs de dados (Google Sheets / Apps Script)
 *   2. parseCSV()             — converte texto CSV em array de objetos
 *   3. fetchFinanciamentos()  — busca dados (Apps Script ou CSV direto)
 *   4. normalizeStr()         — normaliza strings para comparação flexível
 *   5. matchFinanciamentos()  — algoritmo de match Setor + Porte
 *   6. renderResultados()     — gera os cards de resultado no DOM
 *   7. renderErro()           — exibe cards de erro amigáveis
 *   8. escapeHTML()           — previne XSS ao inserir dados da planilha
 *   9. switchTab()            — alterna abas dentro de um card
 *  10. onSelectionChange()    — atualiza progresso e habilita botão
 *  11. Event listener submit  — orquestra o fluxo completo
 *  12. resetDiagnostico()     — limpa estado e volta ao formulário
 * ─────────────────────────────────────────────────────────────
 */


/* =============================================================
   1. CONFIGURAÇÃO — FONTE DE DADOS
   =============================================================
   OPÇÃO A (recomendada): Google Apps Script como proxy
   ──────────────────────────────────────────────────────────
   Funciona ao abrir o arquivo direto no navegador (file://)
   sem precisar de servidor local. Retorna JSON sem CORS.

   Como criar:
     1. Abra sua planilha → Extensions → Apps Script
     2. Apague o código e cole:

        function doGet() {
          var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
          var data  = sheet.getDataRange().getValues();
          var headers = data[0];
          var rows = [];
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

     3. Deploy → New Deployment → Web App
     4. "Who has access" → Anyone → Deploy
     5. Cole a URL gerada em APPS_SCRIPT_URL abaixo

   OPÇÃO B: URL CSV do Google Sheets
   ──────────────────────────────────────────────────────────
   Arquivo > Compartilhar > Publicar na Web > CSV
   Funciona via VS Code Live Server (http://).
   NÃO funciona ao abrir direto no navegador (file://).
   ============================================================= */
const APPS_SCRIPT_URL      = 'https://script.google.com/macros/s/AKfycbwuATCARar_r4x4iVqbU-TdIxjQwu0_hAdfEG5tiMklPj-elSw9Xil3iGyY5JMhbLnY/exec'; // <-- OPÇÃO A
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtSwKC-PE1IoYGZZj23-hacJvFpwChIOkXqcX2POJsSOi-lUxEDnld7ENUGk9AFJv5IWnonolmXt5l/pub?output=csv'; // OPÇÃO B


/* =============================================================
   2. parseCSV(text)
   Converte o texto bruto de um CSV em um Array de Objetos.

   Segue o padrão RFC 4180 simplificado:
   - Suporta campos entre aspas com vírgulas internas
   - Suporta aspas duplas escapadas ("") dentro de campos
   - Remove o BOM (Byte Order Mark) do cabeçalho se presente
   ============================================================= */
function parseCSV(text) {
  // Normaliza quebras de linha de diferentes sistemas operacionais
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  /**
   * splitRow(row)
   * Divide uma linha CSV em campos, respeitando campos entre aspas.
   * @param {string} row - Uma linha do CSV
   * @returns {string[]} Array de valores da linha
   */
  function splitRow(row) {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        // Aspas duplas dentro de campo entre aspas ("") → literal "
        if (insideQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (ch === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const lines = normalized.split('\n');
  if (lines.length < 2) return []; // Planilha vazia ou só cabeçalho

  // Primeira linha = cabeçalhos das colunas
  const headers = splitRow(lines[0]);

  // Demais linhas = dados
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Ignora linhas em branco

    const values = splitRow(line);
    const obj = {};
    headers.forEach(function (header, idx) {
      // Remove BOM e espaços extras do nome da coluna
      const cleanHeader = header.replace(/^\uFEFF/, '').trim();
      obj[cleanHeader] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
}


/* =============================================================
   3. fetchFinanciamentos()
   Busca os dados de financiamento. Estratégia em duas etapas:

   Etapa 1 — Apps Script (APPS_SCRIPT_URL preenchida):
     Retorna JSON diretamente, sem problemas de CORS.
     Funciona tanto via file:// quanto via http://.

   Etapa 2 — CSV direto (fallback):
     Funciona via Live Server (http://).
     Falha ao abrir direto no navegador (file://) por causa do
     redirecionamento do Google Sheets para googleusercontent.com,
     que bloqueia requisições com Origin: null.
   ============================================================= */
async function fetchFinanciamentos() {

  // ── Etapa 1: Apps Script (preferido) ──────────────────────
  if (APPS_SCRIPT_URL) {
    console.log('[EcoMatch PR] Fonte: Apps Script');
    const response = await fetch(APPS_SCRIPT_URL);
    if (!response.ok) throw new Error('FETCH_ERROR');
    const json = await response.json();
    console.log('[EcoMatch PR] Apps Script OK — ' + json.length + ' linhas recebidas.');
    return json;
  }

  // ── Etapa 2: CSV direto (fallback) ────────────────────────
  if (!GOOGLE_SHEET_CSV_URL) {
    throw new Error('URL_NAO_CONFIGURADA');
  }
  console.log('[EcoMatch PR] Fonte: CSV direto (requer Live Server)');
  const response = await fetch(GOOGLE_SHEET_CSV_URL);
  if (!response.ok) throw new Error('FETCH_ERROR');
  const text = await response.text();
  return parseCSV(text);
}


/* =============================================================
   4. normalizeStr(str)
   Normaliza uma string para comparação flexível:
   - Converte para minúsculas
   - Remove acentos (NFD + strip diacríticos)
   - Substitui caracteres não-alfanuméricos por espaço
   - Colapsa espaços múltiplos

   Exemplo:
     "Indústria/CCUS"                   → "industria ccus"
     "Agricultura de Baixo Carbono (ABC)" → "agricultura de baixo carbono abc"
   ============================================================= */
function normalizeStr(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[^a-z0-9]/g, ' ')      // não-alfanumérico → espaço
    .replace(/\s+/g, ' ')            // colapsa espaços
    .trim();
}


/* =============================================================
   5. matchFinanciamentos(financiamentos, setor, porte)
   Filtra o array de financiamentos pelo perfil do usuário.

   Regras de match:
   - Coluna "Setor" da planilha contém o setor selecionado,
     OU o setor selecionado contém o valor da planilha,
     OU a planilha tem "Todos" → aceita qualquer setor.
   - Mesma lógica para "Porte".

   A comparação usa normalizeStr() — não é necessário que os
   valores sejam idênticos. "Agricultura de Baixo Carbono (ABC)"
   faz match com "abc" porque após normalizar ambos, "abc"
   está contido na string normalizada da planilha.

   Logs de diagnóstico disponíveis no console do navegador (F12).
   ============================================================= */
function matchFinanciamentos(financiamentos, setor, porte) {
  const normSetor = normalizeStr(setor);
  const normPorte = normalizeStr(porte);

  // Diagnóstico no console (F12 → Console)
  console.group('[EcoMatch PR] Diagnóstico de Match');
  console.log('Selecionado → Setor: "' + setor + '" | Porte: "' + porte + '"');
  console.log('Total de linhas na planilha:', financiamentos.length);
  console.table(financiamentos.map(function (item) {
    return { Nome: item['Nome_Financiamento'], Setor: item['Setor'], Porte: item['Porte'] };
  }));

  const resultado = financiamentos.filter(function (item) {
    const itemSetor = normalizeStr(item['Setor'] || '');
    const itemPorte = normalizeStr(item['Porte'] || '');

    const setorMatch = itemSetor === 'todos'
      || itemSetor.includes(normSetor)
      || normSetor.includes(itemSetor);

    const porteMatch = itemPorte === 'todos'
      || itemPorte.includes(normPorte)
      || normPorte.includes(itemPorte);

    const match = setorMatch && porteMatch;
    console.log(
      (match ? '✅ MATCH' : '❌ sem match') +
      ' → "' + item['Nome_Financiamento'] + '"' +
      ' | Setor: "' + item['Setor'] + '" (ok=' + setorMatch + ')' +
      ' | Porte: "' + item['Porte'] + '" (ok=' + porteMatch + ')'
    );
    return match;
  });

  console.log('Resultado: ' + resultado.length + ' linha(s) encontrada(s)');
  console.groupEnd();
  return resultado;
}


/* =============================================================
   6. renderResultados(matches)
   Gera dinamicamente os cards de resultado no DOM.

   Para cada item do array de matches, cria um card com:
   - Header com gradiente (nome da linha + número)
   - Aba A: Viabilidade Financeira (coluna Beneficios)
   - Aba B: Viabilidade Jurídica   (coluna Alerta_GSGA)
   - Rodapé com botão "Gerar PDF"

   A coluna Beneficios pode usar "|" como separador de itens
   para renderizar uma lista com checkmarks.
   ============================================================= */
function renderResultados(matches) {
  const container = document.getElementById('resultados-container');
  const header    = document.getElementById('resultado-header');
  container.innerHTML = '';

  // Cabeçalho da seção de resultados
  header.innerHTML = `
    <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 border border-green-200 mb-4">
      <svg class="w-4 h-4 text-forest" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
      </svg>
      <span class="text-forest text-sm font-bold uppercase tracking-wide">
        ${matches.length} ${matches.length === 1 ? 'Match Encontrado' : 'Matches Encontrados'}
      </span>
    </div>
    <h2 class="text-2xl sm:text-3xl font-extrabold text-navy mb-2">
      ${matches.length === 1 ? 'Oportunidade Identificada' : 'Oportunidades Identificadas'}
    </h2>
    <p class="text-gray-500 text-sm">
      Nossa IA cruzou seu perfil com a base de financiamentos sustentáveis
    </p>
  `;

  // Gera um card para cada resultado
  matches.forEach(function (item, idx) {
    // Diagnóstico: exibe os dados brutos recebidos do CSV/JSON
    console.group('[EcoMatch PR] Dados do item ' + (idx + 1));
    console.log('Chaves encontradas:', Object.keys(item));
    console.log('Objeto completo:', item);
    console.groupEnd();

    const nome       = item['Nome_Financiamento'] || 'Linha de Financiamento';
    const beneficios = item['Beneficios']         || 'Consulte os detalhes com nosso time.';
    const alertaGSGA = item['Alerta_GSGA']        || 'O acesso a este capital pode exigir conformidade ambiental e tributária. Recomendamos orientação jurídica especializada.';

    // Converte benefícios em lista se usar "|" como separador
    const beneficiosItens = beneficios
      .split(/[|\n]/)
      .map(function (b) { return b.trim(); })
      .filter(function (b) { return b.length > 0; });

    const beneficiosHTML = beneficiosItens.length > 1
      ? `<ul class="beneficios-lista divide-y divide-gray-100">${
          beneficiosItens.map(function (b) {
            return `<li class="flex items-start gap-2 py-2">
              <svg class="w-4 h-4 text-forest flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
              <span class="text-gray-700 text-sm">${escapeHTML(b)}</span>
            </li>`;
          }).join('')
        }</ul>`
      : `<p class="text-gray-700 text-sm leading-relaxed">${escapeHTML(beneficios)}</p>`;

    // Delay escalonado para animação em cascata
    const delay = (idx * 0.12) + 's';

    const cardHTML = `
      <div class="result-card-enter bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
           style="animation-delay: ${delay}">

        <!-- Header do card -->
        <div class="bg-gradient-to-r from-navy to-forest p-6 sm:p-8 text-white">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <p class="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Linha Recomendada</p>
              <h3 class="text-xl sm:text-2xl font-extrabold leading-tight">${escapeHTML(nome)}</h3>
            </div>
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-white/15 border border-white/25 flex items-center justify-center">
              <span class="text-white font-bold text-sm">${idx + 1}</span>
            </div>
          </div>
        </div>

        <!-- Abas de navegação -->
        <div class="flex border-b border-gray-100">
          <button id="tab-fin-btn-${idx}"
            class="flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold border-b-2 border-forest text-forest transition-all"
            onclick="switchTab(${idx}, 'financeiro')">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Viabilidade Financeira
          </button>
          <button id="tab-jur-btn-${idx}"
            class="flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold text-gray-500 hover:text-navy border-b-2 border-transparent hover:border-gray-200 transition-all"
            onclick="switchTab(${idx}, 'juridico')">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
            </svg>
            Viabilidade Jurídica
          </button>
        </div>

        <!-- Painel A: Viabilidade Financeira -->
        <div id="panel-fin-${idx}" class="tab-panel active p-6 sm:p-8">
          <h4 class="text-sm font-bold text-navy mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
            </svg>
            Benefícios e Condições
          </h4>
          ${beneficiosHTML}
        </div>

        <!-- Painel B: Viabilidade Jurídica -->
        <div id="panel-jur-${idx}" class="tab-panel p-6 sm:p-8">

          <!-- Caixa de alerta GSGA — texto vem da coluna Alerta_GSGA da planilha -->
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-5">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-0.5">
                <div class="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                  <span class="text-lg">⚠️</span>
                </div>
              </div>
              <div>
                <h4 class="font-bold text-amber-900 mb-2">Análise Regulatória Necessária — Alerta GSGA</h4>
                <p class="text-amber-800 text-sm leading-relaxed">${escapeHTML(alertaGSGA)}</p>
              </div>
            </div>
          </div>

          <!-- CTA GSGA -->
          <div class="p-4 rounded-xl bg-slate-50 border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-navy">Precisa de orientação jurídica especializada?</p>
              <p class="text-xs text-gray-500 mt-0.5">
                <strong>Gaia Silva Gaede Advogados (GSGA)</strong> oferece triagem para PMEs parceiras da EcoMatch PR
              </p>
            </div>
            <button
              onclick="alert('Integração com agenda GSGA em desenvolvimento pela equipe EcoMatch PR.')"
              class="flex-shrink-0 px-4 py-2.5 rounded-lg bg-navy text-white text-xs font-bold hover:bg-navy-700 transition-colors whitespace-nowrap">
              Contatar GSGA →
            </button>
          </div>
        </div>

        <!-- Rodapé do card: botão Gerar PDF -->
        <div class="border-t border-gray-100 p-5 sm:p-6 bg-gray-50">
          <button
            onclick="alert('Integração com gerador de Plano de Negócios em desenvolvimento pela equipe EcoMatch PR.')"
            class="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-forest text-white font-bold text-sm hover:bg-forest-700 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Gerar Plano de Negócios (PDF) — ${escapeHTML(nome)}
          </button>
        </div>

      </div>
    `;

    container.insertAdjacentHTML('beforeend', cardHTML);
  });
}


/* =============================================================
   7. renderErro(tipo)
   Exibe um card de erro amigável no lugar dos resultados.

   Tipos disponíveis:
   - 'URL_NAO_CONFIGURADA' — nenhuma URL configurada no script
   - 'SEM_RESULTADOS'      — fetch OK mas nenhum match encontrado
   - 'FETCH_ERROR'         — falha de rede ou CORS
   ============================================================= */
function renderErro(tipo) {
  const container = document.getElementById('resultados-container');
  const header    = document.getElementById('resultado-header');
  header.innerHTML = '';

  const mensagens = {
    URL_NAO_CONFIGURADA: {
      titulo: 'Fonte de Dados Não Configurada',
      texto:  'Nenhuma URL de dados foi configurada. Abra o arquivo <code class="bg-gray-100 px-1 rounded text-xs font-mono">script.js</code> e preencha a variável <code class="bg-gray-100 px-1 rounded text-xs font-mono">APPS_SCRIPT_URL</code> ou <code class="bg-gray-100 px-1 rounded text-xs font-mono">GOOGLE_SHEET_CSV_URL</code>.',
      icone:  '🔧',
      cor:    'blue',
    },
    SEM_RESULTADOS: {
      titulo: 'Nenhuma Linha Encontrada',
      texto:  'Não encontramos financiamentos na planilha que correspondam ao seu perfil. Verifique os valores nas colunas <strong>Setor</strong> e <strong>Porte</strong> da planilha (consulte o arquivo PLANILHA_GUIA.md).',
      icone:  '🔍',
      cor:    'yellow',
    },
    FETCH_ERROR: {
      titulo: 'Erro ao Acessar a Planilha',
      texto:  'Não foi possível conectar à fonte de dados. Se estiver usando a URL CSV, abra o arquivo via VS Code Live Server (http://). Se estiver usando o Apps Script, verifique se o deploy está com acesso "Anyone".',
      icone:  '🌐',
      cor:    'red',
    },
  };

  const m = mensagens[tipo] || mensagens['FETCH_ERROR'];
  const corMap = {
    blue:   'bg-blue-50 border-blue-200 text-blue-900',
    yellow: 'bg-amber-50 border-amber-200 text-amber-900',
    red:    'bg-red-50 border-red-200 text-red-900',
  };

  container.innerHTML = `
    <div class="rounded-2xl border ${corMap[m.cor]} p-8 text-center">
      <div class="text-5xl mb-4">${m.icone}</div>
      <h3 class="text-lg font-bold mb-2">${m.titulo}</h3>
      <p class="text-sm leading-relaxed opacity-80">${m.texto}</p>
      <button onclick="resetDiagnostico()"
        class="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:shadow-md transition-all">
        ← Voltar ao formulário
      </button>
    </div>
  `;
}


/* =============================================================
   8. escapeHTML(str)
   Sanitiza strings antes de inseri-las no DOM via innerHTML.
   Previne XSS caso a planilha contenha caracteres especiais.
   ============================================================= */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}


/* =============================================================
   9. switchTab(idx, aba)
   Alterna entre as abas "Viabilidade Financeira" e "Viabilidade
   Jurídica" de um card específico, identificado pelo índice idx.
   ============================================================= */
function switchTab(idx, aba) {
  const btnFin = document.getElementById('tab-fin-btn-' + idx);
  const btnJur = document.getElementById('tab-jur-btn-' + idx);
  const panFin = document.getElementById('panel-fin-' + idx);
  const panJur = document.getElementById('panel-jur-' + idx);

  const ativoClass   = 'flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold border-b-2 border-forest text-forest transition-all';
  const inativoClass = 'flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold text-gray-500 hover:text-navy border-b-2 border-transparent hover:border-gray-200 transition-all';

  if (aba === 'financeiro') {
    btnFin.className = ativoClass;
    btnJur.className = inativoClass;
    panFin.classList.add('active');
    panJur.classList.remove('active');
  } else {
    btnJur.className = ativoClass;
    btnFin.className = inativoClass;
    panJur.classList.add('active');
    panFin.classList.remove('active');
  }
}


/* =============================================================
   10. onSelectionChange()
   Chamada via onchange em cada radio input do formulário.
   - Atualiza os indicadores visuais de progresso (steps 1-2-3)
   - Habilita o botão "Mapear" quando as 3 perguntas estão respondidas
   ============================================================= */
function onSelectionChange() {
  const setor   = document.querySelector('input[name="setor"]:checked');
  const porte   = document.querySelector('input[name="porte"]:checked');
  const desafio = document.querySelector('input[name="desafio"]:checked');

  /**
   * ativarStep(stepId, labelId, lineId)
   * Pinta o círculo numerado e a linha conectora na cor forest (verde).
   */
  function ativarStep(stepId, labelId, lineId) {
    const el    = document.getElementById(stepId);
    const label = labelId ? document.getElementById(labelId) : null;
    const line  = lineId  ? document.getElementById(lineId)  : null;
    el.className = 'w-8 h-8 rounded-full bg-forest text-white text-sm font-bold flex items-center justify-center transition-all';
    if (label) label.className = 'text-xs font-medium text-forest hidden sm:block';
    if (line)  line.className  = 'h-0.5 w-8 bg-forest transition-all';
  }

  if (setor)   ativarStep('step-1', null,          'line-1-2');
  if (porte)   ativarStep('step-2', 'step-2-label', 'line-2-3');
  if (desafio) ativarStep('step-3', 'step-3-label', null);

  const btn  = document.getElementById('btn-mapear');
  const hint = document.getElementById('btn-hint');

  if (setor && porte && desafio) {
    btn.disabled  = false;
    btn.className = 'w-full flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base bg-forest text-white cursor-pointer shadow-lg hover:bg-forest-700 hover:shadow-xl hover:-translate-y-0.5 transform transition-all duration-300';
    hint.textContent = 'Pronto! Clique para mapear suas oportunidades.';
    hint.className   = 'text-center text-xs text-forest mt-3 font-medium';
  }
}


/* =============================================================
   11. EVENT LISTENER — Submissão do formulário
   Orquestra o fluxo completo:
     1. Exibe overlay de loading com textos sequenciais
     2. Chama fetchFinanciamentos() em paralelo com delay mínimo
     3. Executa matchFinanciamentos() com os dados retornados
     4. Renderiza resultado (cards) ou erro (card de erro)
     5. Faz scroll suave até a seção de resultados
   ============================================================= */
document.getElementById('diagnostico-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const setorVal = document.querySelector('input[name="setor"]:checked').value;
  const porteVal = document.querySelector('input[name="porte"]:checked').value;

  // Esmaece o formulário durante o processamento
  document.getElementById('form-card').classList.add('opacity-50', 'pointer-events-none');

  // Exibe o overlay de loading
  const overlay  = document.getElementById('loading-overlay');
  const loadText = document.getElementById('loading-text');
  const loadBar  = document.getElementById('loading-bar');
  overlay.classList.remove('hidden');

  // Textos sequenciais exibidos durante o loading
  const etapas = [
    { texto: 'Conectando ao Google Sheets...',     pct: 15  },
    { texto: 'Baixando base de financiamentos...', pct: 40  },
    { texto: 'Analisando perfil empresarial...',   pct: 65  },
    { texto: 'Calculando compatibilidade...',      pct: 85  },
    { texto: 'Finalizando recomendações...',       pct: 100 },
  ];

  let etapaIdx = 0;
  const loadingInterval = setInterval(function () {
    if (etapaIdx < etapas.length) {
      loadText.textContent = etapas[etapaIdx].texto;
      loadBar.style.width  = etapas[etapaIdx].pct + '%';
      etapaIdx++;
    }
  }, 500);

  // Fetch + delay mínimo de 2.5s para a animação ser visível
  const [financiamentos] = await Promise.allSettled([
    fetchFinanciamentos(),
    new Promise(function (r) { setTimeout(r, 2500); }),
  ]);

  clearInterval(loadingInterval);

  // Esconde loading e formulário
  overlay.classList.add('hidden');
  loadBar.style.width = '0%';
  document.getElementById('diagnostico').classList.add('hidden');

  // Exibe seção de resultados
  const secaoResultado = document.getElementById('resultado-section');
  secaoResultado.classList.remove('hidden');

  // Processa resultado ou erro
  if (financiamentos.status === 'rejected') {
    const errMsg = financiamentos.reason.message || '';
    renderErro(errMsg === 'URL_NAO_CONFIGURADA' ? 'URL_NAO_CONFIGURADA' : 'FETCH_ERROR');
    console.error('[EcoMatch PR] Erro:', financiamentos.reason);
  } else {
    const matches = matchFinanciamentos(financiamentos.value, setorVal, porteVal);
    matches.length === 0 ? renderErro('SEM_RESULTADOS') : renderResultados(matches);
  }

  // Scroll suave até os resultados
  setTimeout(function () {
    secaoResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
});


/* =============================================================
   12. resetDiagnostico()
   Limpa todo o estado da interface e volta ao formulário inicial:
   - Desmarca todos os radio inputs
   - Reseta os indicadores de progresso para o estado inicial
   - Desabilita o botão "Mapear"
   - Limpa os containers de resultado
   - Alterna a visibilidade das seções
   ============================================================= */
function resetDiagnostico() {
  // Limpa os radio inputs
  document.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = false; });

  // Reseta indicadores de progresso
  const inativo = 'w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-sm font-bold flex items-center justify-center transition-all';
  ['step-2', 'step-3'].forEach(function (id) {
    document.getElementById(id).className = inativo;
  });
  document.getElementById('step-1').className = 'w-8 h-8 rounded-full bg-navy text-white text-sm font-bold flex items-center justify-center transition-all';
  ['line-1-2', 'line-2-3'].forEach(function (id) {
    document.getElementById(id).className = 'h-0.5 w-8 bg-gray-200 transition-all';
  });
  document.getElementById('step-2-label').className = 'text-xs font-medium text-gray-400 hidden sm:block';
  document.getElementById('step-3-label').className = 'text-xs font-medium text-gray-400 hidden sm:block';

  // Reseta o botão
  const btn = document.getElementById('btn-mapear');
  btn.disabled  = true;
  btn.className = 'w-full flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base bg-gray-100 text-gray-400 cursor-not-allowed transition-all duration-300';
  document.getElementById('btn-hint').textContent = 'Preencha as 3 perguntas para habilitar o mapeamento';
  document.getElementById('btn-hint').className   = 'text-center text-xs text-gray-400 mt-3';

  // Limpa os resultados
  document.getElementById('resultados-container').innerHTML = '';
  document.getElementById('resultado-header').innerHTML     = '';

  // Restaura o form-card
  document.getElementById('form-card').classList.remove('opacity-50', 'pointer-events-none');

  // Alterna seções
  document.getElementById('resultado-section').classList.add('hidden');
  document.getElementById('diagnostico').classList.remove('hidden');

  // Scroll de volta ao formulário
  setTimeout(function () {
    document.getElementById('diagnostico').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}
