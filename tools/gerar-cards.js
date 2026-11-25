#!/usr/bin/env node
/*
 * tools/gerar-cards.js — gera as miniaturas usadas SOMENTE nos cards da grade.
 *
 * Uso:
 *   node tools/gerar-cards.js          -> gera img/cards/*.webp e conteudo/cards.js
 *   node tools/gerar-cards.js --dry    -> só mostra o plano, não grava nada
 *
 * Regras:
 *   - lê a capa de cada projeto em conteudo/projetos.json (media[0], igual ao site);
 *   - redimensiona para no máximo 720 px de largura, mantendo a proporção;
 *   - exporta WebP com qualidade 0.85 (conservadora);
 *   - grava em img/cards/ e em conteudo/cards.js (mapa id -> arquivo/dimensões);
 *   - NUNCA escreve em img/projetos/ (os renders Full HD ficam intactos).
 *
 * Usa o Edge/Chrome já instalado, do mesmo modo que tools/paleta.js.
 * Se trocar uma capa no painel, rode este script novamente antes de publicar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const ARQ_PROJETOS = path.join(ROOT, 'conteudo', 'projetos.json');
const PASTA_CARDS = path.join(ROOT, 'img', 'cards');
const ARQ_MAPA = path.join(ROOT, 'conteudo', 'cards.js');
const LARGURA = 720;
const QUALIDADE = 0.85;
const DRY = process.argv.includes('--dry');

/* ---------- navegador (mesma lógica de tools/paleta.js) ---------- */
function acharNavegador() {
  const env = process.env;
  const candidatos = [
    env.NAVEGADOR,
    path.join(env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ].filter(Boolean);
  return candidatos.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function conectar(debugPort) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json`);
      const lista = await r.json();
      const pagina = lista.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch (e) { /* ainda subindo */ }
    await sleep(200);
  }
  throw new Error('Não consegui conectar ao navegador.');
}

/* ---------- capa: mesma regra de index.html (media[0]) ---------- */
function capaSrc(p) {
  const m = p && p.media && p.media[0];
  if (!m) return '';
  if (m.type === 'image') return String(m.src || '');
  return String(m.poster || '');
}

function slug(p) {
  return String(p?.title?.pt || p?.title?.en || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function planner() {
  const projetos = JSON.parse(fs.readFileSync(ARQ_PROJETOS, 'utf8'));
  const usados = new Set();
  const itens = [];
  const ignorados = [];

  for (const p of projetos) {
    const src = capaSrc(p);
    if (!src || /^https?:\/\//i.test(src) || !/\.(webp|png|jpe?g|avif|bmp)$/i.test(src)) {
      ignorados.push(String(p?.id || p?.title?.pt) + ': sem capa local');
      continue;
    }
    const abs = path.resolve(ROOT, src.split('/').join(path.sep));
    const raizProjetos = path.join(ROOT, 'img', 'projetos') + path.sep;
    if (!abs.startsWith(raizProjetos) || !fs.existsSync(abs)) {
      ignorados.push(String(p?.id || p?.title?.pt) + ': arquivo ausente ou fora de img/projetos');
      continue;
    }
    const base = slug(p) || String(p.id || 'projeto').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    let nome = base + '-card.webp';
    let n = 2;
    while (usados.has(nome)) nome = base + '-card-' + (n++) + '.webp';
    usados.add(nome);
    itens.push({
      id: String(p.id),
      titulo: String(p?.title?.pt || ''),
      origem: src,
      arquivo: 'img/cards/' + nome,
      url: pathToFileURL(abs).href
    });
  }
  return { itens, ignorados };
}

/* ---------- expressão executada no navegador ---------- */
const EXPRESSAO = `(async () => {
  const LARGURA = LARGURA_PLACEHOLDER;
  const QUALIDADE = QUALIDADE_PLACEHOLDER;
  const resultado = [];

  for (const item of ARQUIVOS_PLACEHOLDER) {
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('não carregou'));
        im.src = item.url;
      });

      // não upscaling: se a origem for menor que 720 px, mantém o tamanho dela.
      const w = Math.min(LARGURA, img.naturalWidth || LARGURA);
      const h = Math.max(1, Math.round(w * (img.naturalHeight || 1) / (img.naturalWidth || 1)));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise(res => c.toBlob(res, 'image/webp', QUALIDADE));
      if (!blob || !blob.size) throw new Error('falha ao codificar WebP');
      const dados = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(fr.error || new Error('FileReader'));
        fr.readAsDataURL(blob);
      });

      resultado.push({ id: item.id, width: w, height: h, bytes: blob.size, dados });
    } catch (e) {
      resultado.push({ id: item.id, erro: String(e && e.message ? e.message : e) });
    }
  }
  return resultado;
})()`;

/* ---------- principal ---------- */
(async () => {
  const { itens, ignorados } = planner();
  if (!itens.length) {
    console.error('Nenhuma capa local encontrada em conteudo/projetos.json.');
    process.exit(1);
  }

  console.log('\n  MINIATURAS DOS CARDS' + (DRY ? ' (--dry)' : ''));
  console.log('  ' + 'projeto'.padEnd(22) + 'origem'.padEnd(12) + 'destino');
  console.log('  ' + '-'.repeat(64));
  for (const item of itens) {
    const kb = Math.round(fs.statSync(path.resolve(ROOT, item.origem.split('/').join(path.sep))).size / 1024);
    console.log('  ' + (item.titulo.slice(0, 21)).padEnd(22) + (kb + ' KB').padEnd(12) + item.arquivo);
  }
  for (const aviso of ignorados) console.log('  ignorado: ' + aviso);

  if (DRY) { console.log('\n  --dry: nada foi gravado.\n'); process.exit(0); }

  const navegador = acharNavegador();
  if (!navegador) {
    console.error('Edge/Chrome não encontrado. Defina a variável NAVEGADOR com o caminho do executável.');
    process.exit(1);
  }

  const tmp = path.join(os.tmpdir(), 'gerar-cards-' + Date.now() + '.html');
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8"><title>cards</title>');
  const porta = 9800 + Math.floor(Math.random() * 150);
  const perfil = path.join(os.tmpdir(), 'gerar-cards-' + Date.now());
  const proc = spawn(navegador, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--allow-file-access-from-files',
    `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
    pathToFileURL(tmp).href
  ], { stdio: 'ignore' });

  let ws;
  try {
    const wsUrl = await conectar(porta);
    ws = new WebSocket(wsUrl);
    let id = 0;
    const pendentes = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); }
    };
    await new Promise(res => { ws.onopen = res; });
    const send = (method, params) => new Promise(res => {
      const i = ++id; pendentes.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable');

    const expr = EXPRESSAO
      .replace('LARGURA_PLACEHOLDER', String(LARGURA))
      .replace('QUALIDADE_PLACEHOLDER', String(QUALIDADE))
      .replace('ARQUIVOS_PLACEHOLDER', () => JSON.stringify(itens));
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const valor = res.result && res.result.result && res.result.result.value;
    if (!Array.isArray(valor)) {
      console.error('Falha ao gerar. Resposta do navegador:');
      console.error(JSON.stringify(res.result, null, 2));
      process.exit(1);
    }

    fs.mkdirSync(PASTA_CARDS, { recursive: true });
    const mapa = {};
    let antes = 0, depois = 0, falhas = 0;
    const porId = new Map(itens.map(i => [i.id, i]));

    for (const r of valor) {
      const item = porId.get(String(r.id));
      if (!item) continue;
      if (r.erro || !r.dados) {
        console.error('  ERRO em ' + item.origem + ': ' + (r.erro || 'sem dados'));
        falhas++;
        continue;
      }
      const saida = path.resolve(ROOT, item.arquivo.split('/').join(path.sep));
      if (!saida.startsWith(PASTA_CARDS + path.sep)) throw new Error('saída fora de img/cards: ' + saida);
      const buf = Buffer.from(String(r.dados).split(',')[1] || '', 'base64');
      if (!buf.length) { console.error('  ERRO: arquivo vazio: ' + item.arquivo); falhas++; continue; }
      fs.writeFileSync(saida, buf);
      antes += fs.statSync(path.resolve(ROOT, item.origem.split('/').join(path.sep))).size;
      depois += buf.length;
      mapa[String(item.id)] = { src: item.arquivo, width: r.width, height: r.height };
    }

    const cabecalho = '// Gerado por tools/gerar-cards.js — não edite à mão.\n';
    const corpo = Object.entries(mapa).map(([k, v]) =>
      '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v)
    ).join(',\n');
    fs.writeFileSync(ARQ_MAPA, cabecalho + 'const CARD_IMGS = {\n' + corpo + '\n};\n', 'utf8');

    console.log('\n  gravados: ' + Object.keys(mapa).length + ' miniaturas em img/cards/');
    console.log('  mapa: conteudo/cards.js');
    console.log('  origem: ' + Math.round(antes / 1024) + ' KB  ->  cards: ' + Math.round(depois / 1024) + ' KB');
    if (falhas) console.log('  ' + falhas + ' falha(s); os cards desses projetos usam a imagem original como fallback.');
    console.log('');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try {
      if (proc.exitCode === null) {
        proc.kill();
        await new Promise(r => { proc.once('exit', r); setTimeout(r, 400); });
      }
    } catch (e) {}
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
  process.exit(0);
})().catch(e => {
  console.error('ERRO: ' + e.message);
  process.exit(1);
});
