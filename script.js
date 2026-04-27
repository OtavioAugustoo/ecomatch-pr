/**
 * Eco Impact — script.js
 * ─────────────────────────────────────────────────────────────
 * Toda a lógica de negócio da plataforma:
 *   1.  Configuração das URLs de dados (Google Sheets / Apps Script)
 *   2.  parseCSV()               — converte texto CSV em array de objetos (legado)
 *   3.  parseCSVRaw()            — converte texto CSV em array de arrays (2D)
 *   4.  parseTransposedSheet()   — lê planilha transposta e retorna array de oportunidades
 *   5.  fetchFinanciamentos()    — busca dados (Apps Script ou CSV direto)
 *   6.  normalizeStr()           — normaliza strings para comparação flexível
 *   7.  safeHref()               — valida URLs antes de inserir em href (anti-XSS)
 *   8.  matchFinanciamentos()    — algoritmo de match: Setor + Porte + Modalidade + Status
 *   9.  renderResultados()       — gera os cards de resultado no DOM (3 abas)
 *   10. renderErro()             — exibe cards de erro amigáveis
 *   11. escapeHTML()             — previne XSS ao inserir dados da planilha
 *   12. switchTab()              — alterna abas dentro de um card (3 abas)
 *   13. onSelectionChange()      — atualiza progresso e habilita botão (5 perguntas)
 *   14. Event listener submit    — orquestra o fluxo completo
 *   15. resetDiagnostico()       — limpa estado e volta ao formulário (5 perguntas)
 * ─────────────────────────────────────────────────────────────
 */


/* =============================================================
   1. CONFIGURAÇÃO — FONTE DE DADOS
   =============================================================
   IMPORTANTE: A planilha agora usa formato TRANSPOSTO.
   Cada LINHA = 1 campo. Cada COLUNA (D a M) = 1 oportunidade.

   O Apps Script precisa ser atualizado para retornar o array
   bidimensional bruto (não mais JSON de objetos). Use o código:

        function doGet() {
          var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
          var data  = sheet.getDataRange().getValues();
          return ContentService
            .createTextOutput(JSON.stringify(data))
            .setMimeType(ContentService.MimeType.JSON);
        }

   OPÇÃO B — URL CSV do Google Sheets:
   Arquivo > Compartilhar > Publicar na Web > CSV
   Funciona via VS Code Live Server (http://).
   NÃO funciona ao abrir direto no navegador (file://).
   ============================================================= */
const APPS_SCRIPT_URL      = ''; // deixe vazio para usar o CSV abaixo
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRLYx5dDYydLOqBrZu_ZS5jsXHnOPUmN1HsTXK-aYH5quXNagNg2dnjy4SPzszyKeWrOneLAOnKgXMu/pub?output=csv';


/* =============================================================
   2. parseCSV(text)  — MANTIDO para compatibilidade
   Converte texto CSV em Array de Objetos (formato antigo, linha = fundo).
   ============================================================= */
function parseCSV(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  function splitRow(row) {
    const result = [];
    let current = '';
    let insideQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (insideQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else { insideQuotes = !insideQuotes; }
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
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitRow(line);
    const obj = {};
    headers.forEach(function (header, idx) {
      const cleanHeader = header.replace(/^﻿/, '').trim();
      obj[cleanHeader] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
}


/* =============================================================
   3. parseCSVRaw(text)
   Converte texto CSV em array de arrays (2D).
   Usado como etapa intermediária para parseTransposedSheet().
   ============================================================= */
function parseCSVRaw(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  function splitRow(row) {
    const result = [];
    let current = '';
    let insideQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (insideQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else { insideQuotes = !insideQuotes; }
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

  return normalized
    .split('\n')
    .filter(function (line) { return line.trim().length > 0; })
    .map(function (line) { return splitRow(line); });
}


/* =============================================================
   4. parseTransposedSheet(rawRows)
   Lê a planilha no formato TRANSPOSTO e retorna array de oportunidades.

   Estrutura esperada da planilha:
   - Linha 3 (índice 2): cabeçalhos das oportunidades nas colunas D a M
                          ex: "Oportunidade 1", "Oportunidade 2", ...
   - Coluna B (índice 1): nome do campo em cada linha (ex: "Setor", "Status")
   - Colunas D–M (índices 3–12): valores de cada campo por oportunidade

   Retorna array de objetos, um por oportunidade, com chave = nome do campo.
   ============================================================= */
function parseTransposedSheet(rawRows) {
  if (!rawRows || rawRows.length < 3) {
    console.warn('[Eco Impact] parseTransposedSheet: menos de 3 linhas recebidas.');
    return [];
  }

  // Linha 3 (índice 2) identifica as colunas de oportunidade (D em diante = índice 3+)
  const headerRow = rawRows[2];
  const oppCols = [];
  for (var col = 3; col < headerRow.length; col++) {
    var cell = String(headerRow[col] || '').trim();
    if (cell !== '') oppCols.push(col);
  }

  console.log('[Eco Impact] Colunas de oportunidade identificadas:', oppCols.length, '→ índices', oppCols);

  if (oppCols.length === 0) {
    console.warn('[Eco Impact] Nenhuma coluna de oportunidade encontrada na linha 3 (colunas D+).');
    return [];
  }

  // Inicializa um objeto vazio para cada oportunidade
  var opportunities = oppCols.map(function () { return {}; });

  // Percorre as linhas de dados (a partir da linha 4 = índice 3)
  for (var row = 3; row < rawRows.length; row++) {
    var fieldName = String(rawRows[row][1] || '').trim(); // coluna B
    if (!fieldName) continue;

    oppCols.forEach(function (col, i) {
      var val = rawRows[row][col];
      opportunities[i][fieldName] = (val !== undefined && val !== null) ? String(val).trim() : '';
    });
  }

  // Filtra oportunidades sem nome (colunas vazias)
  var result = opportunities.filter(function (o) {
    return (o['Nome da Oportunidade'] || '').trim() !== '';
  });

  console.log('[Eco Impact] parseTransposedSheet: ' + result.length + ' oportunidade(s) válida(s) extraída(s).');
  return result;
}


/* =============================================================
   5. fetchFinanciamentos()
   Busca os dados de financiamento. Estratégia em duas etapas:

   Etapa 1 — Apps Script (APPS_SCRIPT_URL preenchida):
     O Apps Script deve retornar o array 2D bruto da planilha (JSON).
     Funciona tanto via file:// quanto via http://.

   Etapa 2 — CSV direto (fallback):
     Funciona via Live Server (http://).
     Falha ao abrir direto no navegador (file://) por causa do
     redirecionamento do Google Sheets.
   ============================================================= */
async function fetchFinanciamentos() {

  // ── Etapa 1: Apps Script (preferido) ──────────────────────
  if (APPS_SCRIPT_URL) {
    console.log('[Eco Impact] Fonte: Apps Script');
    const response = await fetch(APPS_SCRIPT_URL);
    if (!response.ok) throw new Error('FETCH_ERROR');
    const rawData = await response.json();
    console.log('[Eco Impact] Apps Script OK — ' + rawData.length + ' linhas recebidas.');
    return parseTransposedSheet(rawData);
  }

  // ── Etapa 2: CSV direto (fallback) ────────────────────────
  if (!GOOGLE_SHEET_CSV_URL) {
    throw new Error('URL_NAO_CONFIGURADA');
  }
  console.log('[Eco Impact] Fonte: CSV direto (requer Live Server)');
  const response = await fetch(GOOGLE_SHEET_CSV_URL);
  if (!response.ok) throw new Error('FETCH_ERROR');
  const text = await response.text();
  const rawRows = parseCSVRaw(text);
  return parseTransposedSheet(rawRows);
}


/* =============================================================
   6. normalizeStr(str)
   Normaliza uma string para comparação flexível:
   - Converte para minúsculas
   - Remove acentos (NFD + strip diacríticos)
   - Substitui caracteres não-alfanuméricos por espaço
   - Colapsa espaços múltiplos

   Exemplo:
     "Indústria/CCUS"                    → "industria ccus"
     "Agricultura de Baixo Carbono (ABC)" → "agricultura de baixo carbono abc"
   ============================================================= */
function normalizeStr(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/* =============================================================
   7. safeHref(url)
   Valida URLs antes de inserir em atributos href.
   Aceita apenas http:// e https:// — bloqueia javascript: e outros.
   ============================================================= */
function safeHref(url) {
  var u = String(url || '').trim();
  if (!u || u === '#') return '#';
  if (u.startsWith('http://') || u.startsWith('https://')) return escapeHTML(u);
  return '#';
}


/* =============================================================
   8. matchFinanciamentos(financiamentos, setor, porte, modalidade, statusFiltro)
   Filtra oportunidades pelo perfil do usuário com 4 critérios ativos:

   Critério 1 — Setor:
     Planilha "Setor" contém o setor selecionado, ou é "Todos".
   Critério 2 — Porte:
     Planilha "Porte" contém o porte selecionado, ou é "Todos".
   Critério 3 — Modalidade:
     Planilha "Modalidade de Apoio" contém a modalidade selecionada.
     Se usuário escolheu "qualquer" → sem filtro.
   Critério 4 — Status:
     "aberto"  → só Status = "Aberto"
     "abrir"   → Status = "Aberto" ou "A abrir"
     "todos"   → sem filtro

   O desafio (Pergunta 3) é informativo — não filtra o match.
   Logs de diagnóstico disponíveis no console (F12 → Console).
   ============================================================= */
function matchFinanciamentos(financiamentos, setor, porte, modalidade, statusFiltro) {
  const normSetor      = normalizeStr(setor);
  const normPorte      = normalizeStr(porte);
  const normModalidade = normalizeStr(modalidade);

  console.group('[Eco Impact] Diagnóstico de Match');
  console.log(
    'Selecionado →' +
    ' Setor: "' + setor + '"' +
    ' | Porte: "' + porte + '"' +
    ' | Modalidade: "' + modalidade + '"' +
    ' | Status: "' + statusFiltro + '"'
  );
  console.log('Total de oportunidades na planilha:', financiamentos.length);
  console.table(financiamentos.map(function (item) {
    return {
      Nome:       item['Nome da Oportunidade'],
      Setor:      item['Setor'],
      Porte:      item['Porte'],
      Modalidade: item['Modalidade de Apoio'],
      Status:     item['Status'],
    };
  }));

  const resultado = financiamentos.filter(function (item) {

    // ── Critério 1: Setor ──────────────────────────────────
    const itemSetor = normalizeStr(item['Setor'] || '');
    const setorMatch = itemSetor === 'todos'
      || itemSetor.includes(normSetor)
      || normSetor.includes(itemSetor);

    // ── Critério 2: Porte ──────────────────────────────────
    const itemPorte = normalizeStr(item['Porte'] || '');
    const porteMatch = itemPorte === 'todos'
      || itemPorte.includes(normPorte)
      || normPorte.includes(itemPorte);

    // ── Critério 3: Modalidade ─────────────────────────────
    var modalidadeMatch = true;
    if (modalidade !== 'qualquer') {
      const itemMod = normalizeStr(item['Modalidade de Apoio'] || '');
      modalidadeMatch = itemMod === 'todos'
        || itemMod.includes(normModalidade)
        || normModalidade.includes(itemMod);
    }

    // ── Critério 4: Status ─────────────────────────────────
    var statusMatch = true;
    const itemStatus = normalizeStr(item['Status'] || '');
    if (statusFiltro === 'aberto') {
      statusMatch = itemStatus === 'aberto';
    } else if (statusFiltro === 'abrir') {
      statusMatch = itemStatus === 'aberto' || itemStatus.includes('abrir');
    }
    // 'todos' → statusMatch permanece true

    const match = setorMatch && porteMatch && modalidadeMatch && statusMatch;
    console.log(
      (match ? '✅ MATCH' : '❌ sem match') +
      ' → "' + (item['Nome da Oportunidade'] || '') + '"' +
      ' | setor=' + setorMatch +
      ' | porte=' + porteMatch +
      ' | modalidade=' + modalidadeMatch +
      ' | status=' + statusMatch
    );
    return match;
  });

  console.log('Resultado: ' + resultado.length + ' oportunidade(s) encontrada(s)');
  console.groupEnd();
  return resultado;
}


/* =============================================================
   9. renderResultados(matches)
   Gera dinamicamente os cards de resultado no DOM.

   Cada card tem 3 abas:
   - Visão Geral:             descrição, links edital e site
   - Financeiro & Elegibilidade: dados financeiros e critérios de elegibilidade
   - Análise Jurídica GSGA:   requisitos, critérios de avaliação, alerta
   ============================================================= */
function renderResultados(matches) {
  const container = document.getElementById('resultados-container');
  const header    = document.getElementById('resultado-header');
  container.innerHTML = '';

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
      Nossa IA cruzou seu perfil com o Mapeamento de Oportunidades de Financiamento Climático
    </p>
  `;

  matches.forEach(function (item, idx) {
    console.group('[Eco Impact] Dados do item ' + (idx + 1));
    console.log('Chaves encontradas:', Object.keys(item));
    console.log('Objeto completo:', item);
    console.groupEnd();

    // ── Extração dos campos ────────────────────────────────
    const nome        = item['Nome da Oportunidade']    || 'Oportunidade de Financiamento';
    const instituicao = item['Instituição']             || '';
    const descricao   = item['Descrição da Oportunidade'] || 'Consulte os detalhes no edital ou site oficial.';
    const linkEdital  = safeHref(item['Link do Edital']);
    const linkSite    = safeHref(item['Link do Site']);
    const status      = item['Status']                  || '';
    const modalidade  = item['Modalidade de Apoio']     || '';

    const valorProjeto   = item['Valor por Projeto (Mín./Máx.)']        || '—';
    const volumeTotal    = item['Volume Total do Fundo/Edital']          || '—';
    const moeda          = item['Moeda']                                 || '—';
    const natureza       = item['Natureza do Apoio']                     || '—';
    const encerramento   = item['Data de Encerramento']                  || '—';
    const execucao       = item['Período de Execução do Projeto']        || '—';
    const porteEleg      = item['Porte']                                 || '—';
    const maturidade     = item['Maturidade do Projeto']                 || '—';
    const beneficiario   = item['Tipo de Beneficiário Elegível']         || '—';

    const requisitos     = item['Principais Requisitos Técnicos e Institucionais'] || '—';
    const criterios      = item['Critérios Básicos de Avaliação']        || '—';
    const contrapartida  = item['Contrapartida Exigida']                 || '—';
    const condicoes      = item['Condições Financeiras']                 || '—';

    // ── Badges de Status e Modalidade ─────────────────────
    const statusNorm = normalizeStr(status);
    var statusClass, statusLabel;
    if (statusNorm === 'aberto') {
      statusClass = 'bg-green-100 text-green-800 border border-green-200';
      statusLabel = '● Aberto';
    } else if (statusNorm.includes('abrir')) {
      statusClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      statusLabel = '◐ A abrir';
    } else {
      statusClass = 'bg-gray-100 text-gray-500 border border-gray-200';
      statusLabel = '○ Fechado';
    }

    const modNorm = normalizeStr(modalidade);
    var modClass;
    if (modNorm.includes('equity'))                           modClass = 'bg-blue-100 text-blue-800 border border-blue-200';
    else if (modNorm.includes('grant') || modNorm.includes('nao reembolsavel')) modClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    else if (modNorm.includes('mezzanine') || modNorm.includes('blended'))      modClass = 'bg-purple-100 text-purple-800 border border-purple-200';
    else if (modNorm.includes('loan') || modNorm.includes('credito'))           modClass = 'bg-indigo-100 text-indigo-800 border border-indigo-200';
    else                                                                         modClass = 'bg-gray-100 text-gray-600 border border-gray-200';

    const delay = (idx * 0.12) + 's';

    // ── Linha financeira auxiliar ──────────────────────────
    function finRow(emoji, label, value) {
      return `
        <div class="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
          <span class="text-base flex-shrink-0 mt-0.5">${emoji}</span>
          <div class="min-w-0">
            <dt class="text-xs font-bold text-gray-400 uppercase tracking-wide">${label}</dt>
            <dd class="text-sm text-gray-700 mt-0.5">${escapeHTML(value)}</dd>
          </div>
        </div>`;
    }

    const cardHTML = `
      <div class="result-card-enter bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
           style="animation-delay: ${delay}">

        <!-- Header do card -->
        <div class="bg-gradient-to-r from-navy to-forest p-6 sm:p-8 text-white">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap gap-2 mb-3">
                <span class="${statusClass} px-2.5 py-0.5 rounded-full text-xs font-bold">${escapeHTML(statusLabel)}</span>
                ${modalidade ? `<span class="${modClass} px-2.5 py-0.5 rounded-full text-xs font-bold">${escapeHTML(modalidade)}</span>` : ''}
              </div>
              ${instituicao ? `<p class="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">${escapeHTML(instituicao)}</p>` : ''}
              <h3 class="text-xl sm:text-2xl font-extrabold leading-tight">${escapeHTML(nome)}</h3>
            </div>
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-white/15 border border-white/25 flex items-center justify-center">
              <span class="text-white font-bold text-sm">${idx + 1}</span>
            </div>
          </div>
        </div>

        <!-- Abas de navegação -->
        <div class="flex border-b border-gray-100">
          <button id="tab-geral-btn-${idx}"
            class="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-semibold border-b-2 border-forest text-forest transition-all"
            onclick="switchTab(${idx}, 'geral')">
            📋 <span class="hidden sm:inline">Visão Geral</span><span class="sm:hidden">Geral</span>
          </button>
          <button id="tab-fin-btn-${idx}"
            class="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-semibold text-gray-500 hover:text-navy border-b-2 border-transparent hover:border-gray-200 transition-all"
            onclick="switchTab(${idx}, 'financeiro')">
            💰 <span class="hidden sm:inline">Financeiro & Elegibilidade</span><span class="sm:hidden">Financeiro</span>
          </button>
          <button id="tab-jur-btn-${idx}"
            class="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-semibold text-gray-500 hover:text-navy border-b-2 border-transparent hover:border-gray-200 transition-all"
            onclick="switchTab(${idx}, 'juridico')">
            ⚖️ <span class="hidden sm:inline">Análise Jurídica GSGA</span><span class="sm:hidden">GSGA</span>
          </button>
        </div>

        <!-- ABA 1: Visão Geral -->
        <div id="panel-geral-${idx}" class="tab-panel active p-6 sm:p-8">
          <p class="text-gray-700 text-sm leading-relaxed mb-6">${escapeHTML(descricao)}</p>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="${linkEdital}" target="_blank" rel="noopener noreferrer"
               class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-700 transition-colors ${linkEdital === '#' ? 'opacity-50 pointer-events-none' : ''}">
              🔗 Ver Edital
            </a>
            <a href="${linkSite}" target="_blank" rel="noopener noreferrer"
               class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-navy text-navy text-sm font-semibold hover:bg-navy-50 transition-colors ${linkSite === '#' ? 'opacity-50 pointer-events-none' : ''}">
              🌐 Site Oficial
            </a>
          </div>
        </div>

        <!-- ABA 2: Financeiro & Elegibilidade -->
        <div id="panel-fin-${idx}" class="tab-panel p-6 sm:p-8">
          <dl class="divide-y divide-gray-50">
            ${finRow('💰', 'Valor por Projeto', valorProjeto)}
            ${finRow('🏦', 'Volume Total do Fundo/Edital', volumeTotal)}
            ${finRow('💱', 'Moeda', moeda)}
            ${finRow('♻️', 'Natureza do Apoio', natureza)}
            ${finRow('📋', 'Modalidade de Apoio', modalidade || '—')}
            ${finRow('📅', 'Data de Encerramento', encerramento)}
            ${finRow('⏱️', 'Período de Execução', execucao)}
            ${finRow('🏢', 'Porte Elegível', porteEleg)}
            ${finRow('🌱', 'Maturidade do Projeto', maturidade)}
            ${finRow('👥', 'Tipo de Beneficiário', beneficiario)}
          </dl>
        </div>

        <!-- ABA 3: Análise Jurídica GSGA -->
        <div id="panel-jur-${idx}" class="tab-panel p-6 sm:p-8">

          <div class="space-y-5 mb-6">
            <div>
              <h5 class="text-sm font-bold text-navy mb-1.5 flex items-center gap-2">
                <span class="w-5 h-5 rounded bg-navy-50 flex items-center justify-center text-xs">📌</span>
                Requisitos Técnicos e Institucionais
              </h5>
              <p class="text-sm text-gray-700 leading-relaxed pl-7">${escapeHTML(requisitos)}</p>
            </div>
            <div>
              <h5 class="text-sm font-bold text-navy mb-1.5 flex items-center gap-2">
                <span class="w-5 h-5 rounded bg-navy-50 flex items-center justify-center text-xs">🏆</span>
                Critérios de Avaliação
              </h5>
              <p class="text-sm text-gray-700 leading-relaxed pl-7">${escapeHTML(criterios)}</p>
            </div>
            <div>
              <h5 class="text-sm font-bold text-navy mb-1.5 flex items-center gap-2">
                <span class="w-5 h-5 rounded bg-navy-50 flex items-center justify-center text-xs">🤝</span>
                Contrapartida Exigida
              </h5>
              <p class="text-sm text-gray-700 leading-relaxed pl-7">${escapeHTML(contrapartida)}</p>
            </div>
          </div>

          <!-- Caixa amarela de alerta GSGA -->
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-5">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-0.5">
                <div class="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                  <span class="text-lg">⚠️</span>
                </div>
              </div>
              <div>
                <h4 class="font-bold text-amber-900 mb-2">Alerta GSGA — Condições Financeiras</h4>
                <p class="text-amber-800 text-sm leading-relaxed">${escapeHTML(condicoes)}</p>
                <p class="text-amber-700 text-sm mt-2 italic">O escritório Gaia Silva Gaede Advogados (GSGA) pode auxiliar na análise e adequação aos requisitos acima.</p>
              </div>
            </div>
          </div>

          <!-- CTA GSGA -->
          <div class="p-4 rounded-xl bg-slate-50 border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-navy">Precisa de orientação jurídica especializada?</p>
              <p class="text-xs text-gray-500 mt-0.5">
                <strong>Gaia Silva Gaede Advogados (GSGA)</strong> oferece triagem para PMEs parceiras do Eco Impact
              </p>
            </div>
            <button
              onclick="alert('Integração com agenda GSGA em desenvolvimento pela equipe Eco Impact.')"
              class="flex-shrink-0 px-4 py-2.5 rounded-lg bg-navy text-white text-xs font-bold hover:bg-navy-700 transition-colors whitespace-nowrap">
              Contatar GSGA →
            </button>
          </div>
        </div>

        <!-- Rodapé do card -->
        <div class="border-t border-gray-100 p-5 sm:p-6 bg-gray-50">
          <button
            onclick="alert('Integração com gerador de Plano de Negócios em desenvolvimento pela equipe Eco Impact.')"
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
   10. renderErro(tipo)
   Exibe um card de erro amigável no lugar dos resultados.
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
      titulo: 'Nenhuma Oportunidade Encontrada',
      texto:  'Não encontramos oportunidades que correspondam ao perfil selecionado. Tente ampliar os filtros (ex: escolha "Qualquer modalidade" ou "Todas" no status). Consulte também o arquivo PLANILHA_GUIA.md para verificar o preenchimento dos campos Setor, Porte, Modalidade de Apoio e Status.',
      icone:  '🔍',
      cor:    'yellow',
    },
    FETCH_ERROR: {
      titulo: 'Erro ao Acessar a Planilha',
      texto:  'Não foi possível conectar à fonte de dados. Se estiver usando a URL CSV, abra o arquivo via VS Code Live Server (http://). Se estiver usando o Apps Script, verifique se o deploy está com acesso "Anyone" e se o script retorna o array 2D (veja PLANILHA_GUIA.md).',
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
   11. escapeHTML(str)
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
   12. switchTab(idx, aba)
   Alterna entre as 3 abas de um card específico (identificado por idx).
   Parâmetro aba: 'geral' | 'financeiro' | 'juridico'
   ============================================================= */
function switchTab(idx, aba) {
  var tabs = [
    { key: 'geral',      seg: 'geral' },
    { key: 'financeiro', seg: 'fin'   },
    { key: 'juridico',   seg: 'jur'   },
  ];

  var ativoClass   = 'flex-1 flex items-center justify-center gap-1 py-3 text-xs font-semibold border-b-2 border-forest text-forest transition-all';
  var inativoClass = 'flex-1 flex items-center justify-center gap-1 py-3 text-xs font-semibold text-gray-500 hover:text-navy border-b-2 border-transparent hover:border-gray-200 transition-all';

  tabs.forEach(function (t) {
    var btn   = document.getElementById('tab-' + t.seg + '-btn-' + idx);
    var panel = document.getElementById('panel-' + t.seg + '-' + idx);
    if (t.key === aba) {
      btn.className = ativoClass;
      panel.classList.add('active');
    } else {
      btn.className = inativoClass;
      panel.classList.remove('active');
    }
  });
}


/* =============================================================
   13. onSelectionChange()
   Chamada via onchange em cada radio input do formulário.
   - Atualiza os indicadores visuais de progresso (steps 1–5)
   - Habilita o botão "Mapear" somente quando as 5 perguntas estão respondidas
   ============================================================= */
function onSelectionChange() {
  const setor      = document.querySelector('input[name="setor"]:checked');
  const porte      = document.querySelector('input[name="porte"]:checked');
  const desafio    = document.querySelector('input[name="desafio"]:checked');
  const modalidade = document.querySelector('input[name="modalidade"]:checked');
  const statusF    = document.querySelector('input[name="status_filtro"]:checked');

  function ativarStep(stepId, labelId, lineId) {
    const el    = document.getElementById(stepId);
    const label = labelId ? document.getElementById(labelId) : null;
    const line  = lineId  ? document.getElementById(lineId)  : null;
    el.className    = 'w-8 h-8 rounded-full bg-forest text-white text-sm font-bold flex items-center justify-center transition-all';
    if (label) label.className = 'text-xs font-medium text-forest hidden sm:block';
    if (line)  line.className  = 'h-0.5 w-6 bg-forest transition-all flex-shrink-0';
  }

  if (setor)      ativarStep('step-1', null,           'line-1-2');
  if (porte)      ativarStep('step-2', 'step-2-label', 'line-2-3');
  if (desafio)    ativarStep('step-3', 'step-3-label', 'line-3-4');
  if (modalidade) ativarStep('step-4', 'step-4-label', 'line-4-5');
  if (statusF)    ativarStep('step-5', 'step-5-label', null);

  const btn  = document.getElementById('btn-mapear');
  const hint = document.getElementById('btn-hint');

  if (setor && porte && desafio && modalidade && statusF) {
    btn.disabled  = false;
    btn.className = 'w-full flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base bg-forest text-white cursor-pointer shadow-lg hover:bg-forest-700 hover:shadow-xl hover:-translate-y-0.5 transform transition-all duration-300';
    hint.textContent = 'Pronto! Clique para mapear suas oportunidades.';
    hint.className   = 'text-center text-xs text-forest mt-3 font-medium';
  }
}


/* =============================================================
   14. EVENT LISTENER — Submissão do formulário
   Orquestra o fluxo completo:
     1. Exibe overlay de loading com textos sequenciais
     2. Chama fetchFinanciamentos() em paralelo com delay mínimo
     3. Executa matchFinanciamentos() com os 4 critérios ativos
     4. Renderiza resultado (cards com 3 abas) ou erro
     5. Faz scroll suave até a seção de resultados
   ============================================================= */
document.getElementById('diagnostico-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const setorVal      = document.querySelector('input[name="setor"]:checked').value;
  const porteVal      = document.querySelector('input[name="porte"]:checked').value;
  const modalidadeVal = document.querySelector('input[name="modalidade"]:checked').value;
  const statusVal     = document.querySelector('input[name="status_filtro"]:checked').value;
  // desafio é informativo — não usado no filtro de match

  document.getElementById('form-card').classList.add('opacity-50', 'pointer-events-none');

  const overlay  = document.getElementById('loading-overlay');
  const loadText = document.getElementById('loading-text');
  const loadBar  = document.getElementById('loading-bar');
  overlay.classList.remove('hidden');

  const etapas = [
    { texto: 'Conectando ao Google Sheets...',       pct: 15  },
    { texto: 'Baixando mapeamento de oportunidades...', pct: 40  },
    { texto: 'Analisando perfil empresarial...',     pct: 60  },
    { texto: 'Aplicando critérios de match...',      pct: 80  },
    { texto: 'Finalizando recomendações...',         pct: 100 },
  ];

  let etapaIdx = 0;
  const loadingInterval = setInterval(function () {
    if (etapaIdx < etapas.length) {
      loadText.textContent = etapas[etapaIdx].texto;
      loadBar.style.width  = etapas[etapaIdx].pct + '%';
      etapaIdx++;
    }
  }, 500);

  const [financiamentos] = await Promise.allSettled([
    fetchFinanciamentos(),
    new Promise(function (r) { setTimeout(r, 2500); }),
  ]);

  clearInterval(loadingInterval);
  overlay.classList.add('hidden');
  loadBar.style.width = '0%';
  document.getElementById('diagnostico').classList.add('hidden');

  const secaoResultado = document.getElementById('resultado-section');
  secaoResultado.classList.remove('hidden');

  if (financiamentos.status === 'rejected') {
    const errMsg = financiamentos.reason.message || '';
    renderErro(errMsg === 'URL_NAO_CONFIGURADA' ? 'URL_NAO_CONFIGURADA' : 'FETCH_ERROR');
    console.error('[Eco Impact] Erro:', financiamentos.reason);
  } else {
    const matches = matchFinanciamentos(financiamentos.value, setorVal, porteVal, modalidadeVal, statusVal);
    matches.length === 0 ? renderErro('SEM_RESULTADOS') : renderResultados(matches);
  }

  setTimeout(function () {
    secaoResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
});


/* =============================================================
   15. resetDiagnostico()
   Limpa todo o estado da interface e volta ao formulário inicial:
   - Desmarca todos os radio inputs (5 perguntas)
   - Reseta os indicadores de progresso para o estado inicial (5 steps)
   - Desabilita o botão "Mapear"
   - Limpa os containers de resultado
   - Alterna a visibilidade das seções
   ============================================================= */
function resetDiagnostico() {
  document.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = false; });

  const inativo = 'w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-sm font-bold flex items-center justify-center transition-all';
  ['step-2', 'step-3', 'step-4', 'step-5'].forEach(function (id) {
    document.getElementById(id).className = inativo;
  });
  document.getElementById('step-1').className = 'w-8 h-8 rounded-full bg-navy text-white text-sm font-bold flex items-center justify-center transition-all';

  ['line-1-2', 'line-2-3', 'line-3-4', 'line-4-5'].forEach(function (id) {
    document.getElementById(id).className = 'h-0.5 w-6 bg-gray-200 transition-all flex-shrink-0';
  });

  ['step-2-label', 'step-3-label', 'step-4-label', 'step-5-label'].forEach(function (id) {
    document.getElementById(id).className = 'text-xs font-medium text-gray-400 hidden sm:block';
  });

  const btn = document.getElementById('btn-mapear');
  btn.disabled  = true;
  btn.className = 'w-full flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base bg-gray-100 text-gray-400 cursor-not-allowed transition-all duration-300';

  const hint = document.getElementById('btn-hint');
  hint.textContent = 'Preencha as 5 perguntas para habilitar o mapeamento';
  hint.className   = 'text-center text-xs text-gray-400 mt-3';

  document.getElementById('resultados-container').innerHTML = '';
  document.getElementById('resultado-header').innerHTML     = '';
  document.getElementById('form-card').classList.remove('opacity-50', 'pointer-events-none');
  document.getElementById('resultado-section').classList.add('hidden');
  document.getElementById('diagnostico').classList.remove('hidden');

  setTimeout(function () {
    document.getElementById('diagnostico').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}
