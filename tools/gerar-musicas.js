#!/usr/bin/env node
/*
 * tools/gerar-musicas.js — gera conteudo/musicas.js a partir de playlists públicas.
 *
 * Uso:
 *   node tools/gerar-musicas.js          -> lê as playlists e grava conteudo/musicas.js
 *   node tools/gerar-musicas.js --dry    -> só mostra as faixas encontradas
 *
 * As playlists são apenas FONTE DE DADOS: o site não carrega YouTube, não toca
 * áudio e não faz requisição externa. Tudo fica num arquivo local pequeno.
 *
 * Para trocar ou acrescentar playlists, edite PLAYLISTS abaixo e rode novamente.
 * Repetições são removidas por ID do vídeo e por título+artista normalizados.
 * Se o YouTube mudar o formato da página, a extração pode precisar de ajuste.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLAYLISTS = [
  'PLh16GoOWM6MamWh588rTmtXh5tvBp5M-C',
  'PLh16GoOWM6MZOpliWOCksEADwAzqMlKgH',
  'PLh16GoOWM6MYiaIyf3LxYSC4bnr7RYRg5'
];
const urlPlaylist = id => `https://www.youtube.com/playlist?list=${id}&hl=pt-BR&gl=BR`;
const ARQ_SAIDA = path.join(ROOT, 'conteudo', 'musicas.js');
const DRY = process.argv.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

async function conectar(porta) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json`);
      const lista = await r.json();
      const pagina = lista.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch (e) { /* navegador ainda subindo */ }
    await sleep(200);
  }
  throw new Error('Não consegui conectar ao navegador.');
}

const EXTRACAO = id => `(() => {
  if (!location.href.includes(${JSON.stringify(id)})) return { totalPagina: '', faixas: [] };
  const achados = [];
  const ver = x => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(ver); return; }
    for (const k of Object.keys(x)) {
      if (k === 'lockupViewModel') achados.push(x[k]);
      ver(x[k]);
    }
  };
  ver(window.ytInitialData || {});

  const txt = v => (v && v.content) ? String(v.content).trim() : '';
  const faixas = [];
  for (const o of achados) {
    const md = o.metadata?.lockupMetadataViewModel || {};
    const linhas = md.metadata?.contentMetadataViewModel?.metadataRows || [];
    const idVideo = o.contentId || '';
    const titulo = txt(md.title);
    const artista = txt(linhas[0]?.metadataParts?.[0]?.text);
    const bruto = JSON.stringify(o);
    const duracao = (bruto.match(/"text":"(\\d+:\\d\\d)"/) || [])[1] || '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(idVideo) || !titulo || !duracao) continue;
    faixas.push({ id: idVideo, titulo, artista, duracao });
  }
  return { totalPagina: document.body.innerText, faixas };
})()`;

// Remove acentos, caixa, sufixos automáticos, "(ao vivo)"/"(remix)"/"feat..." e
// pontuação antes de comparar — assim a mesma música com outro upload não entra duas vezes.
function chaveMusica(m) {
  const limpo = s => {
    let t = String(s || '');
    t = t.replace(/\s*[(\[][^)\]]*[)\]]\s*$/g, '');
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s*[-–—]\s*(topic|oficial|official)\s*$/i, '')
      .replace(/\s+feat\b.*$/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };
  return limpo(m.titulo) + '|' + limpo(m.artista);
}

(async () => {
  const navegador = acharNavegador();
  if (!navegador) {
    console.error('Edge/Chrome não encontrado. Defina NAVEGADOR com o caminho do executável.');
    process.exit(1);
  }

  const porta = 9800 + Math.floor(Math.random() * 150);
  const perfil = path.join(os.tmpdir(), 'gerar-musicas-' + Date.now());
  const proc = spawn(navegador, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', `--remote-debugging-port=${porta}`,
    `--user-data-dir=${perfil}`, 'about:blank'
  ], { stdio: 'ignore' });

  let ws;
  try {
    const wsUrl = await conectar(porta);
    ws = new WebSocket(wsUrl);
    let n = 0;
    const pendentes = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); }
    };
    await new Promise(res => { ws.onopen = res; });
    const send = (method, params) => new Promise(res => {
      const i = ++n; pendentes.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Page.enable');
    await send('Runtime.enable');

    const porId = new Set();
    const porMusica = new Set();
    const faixas = [];
    const resumos = [];

    for (const id of PLAYLISTS) {
      await send('Page.navigate', { url: urlPlaylist(id) });

      let valor;
      for (let i = 0; i < 300; i++) {
        const r = await send('Runtime.evaluate', { expression: EXTRACAO(id), awaitPromise: true, returnByValue: true });
        valor = r.result && r.result.result && r.result.result.value;
        if (valor && valor.faixas && valor.faixas.length) break;
        await sleep(250);
      }
      await sleep(1200);
      const r = await send('Runtime.evaluate', { expression: EXTRACAO(id), awaitPromise: true, returnByValue: true });
      valor = r.result && r.result.result && r.result.result.value;

      const modelo = String(valor && valor.totalPagina || '').match(/(\d+) vídeos/);
      let novas = 0, repetidas = 0;
      for (const f of (valor && valor.faixas) || []) {
        const chave = chaveMusica(f);
        if (porId.has(f.id) || porMusica.has(chave)) { repetidas++; continue; }
        porId.add(f.id);
        porMusica.add(chave);
        faixas.push(f);
        novas++;
      }
      resumos.push({ id, modelo: modelo ? modelo[1] : '', novas, repetidas });
    }

    if (!faixas.length) {
      console.error('Nenhuma faixa encontrada. O YouTube pode ter mudado o formato da página.');
      process.exit(1);
    }

    for (const s of resumos) {
      console.log('\n  PLAYLIST ' + s.id);
      if (s.modelo) console.log('  YouTube informa ' + s.modelo + ' vídeos (indisponíveis ficam ocultos).');
      console.log('  novas: ' + s.novas + '  |  repetidas (ignoradas): ' + s.repetidas);
    }

    const cabecalho = '// Gerado por tools/gerar-musicas.js — não edite à mão.\n' +
      '// playlists:\n' + PLAYLISTS.map(id => '//   ' + urlPlaylist(id) + '\n').join('') +
      '// Sem duplicatas: por ID do vídeo e por título+artista normalizados.\n' +
      '// Somente dados para o HUD visual: o site não toca áudio nem acessa o YouTube.\n';
    const corpo = faixas.map(f => '  { id: ' + JSON.stringify(f.id) +
      ', t: ' + JSON.stringify(f.titulo) +
      ', a: ' + JSON.stringify(f.artista) +
      ', d: ' + JSON.stringify(f.duracao) + ' }').join(',\n');
    const conteudo = cabecalho + 'const MUSICAS = [\n' + corpo + '\n];\n';

    console.log('\n  LISTA FINAL — ' + faixas.length + ' faixas únicas');
    console.log('  ' + 'faixa'.padEnd(46) + 'artista'.padEnd(24) + 'duração');
    console.log('  ' + '-'.repeat(78));
    for (const f of faixas) {
      console.log('  ' + f.titulo.slice(0, 45).padEnd(46) + f.artista.slice(0, 23).padEnd(24) + f.duracao);
    }

    if (DRY) {
      console.log('\n  --dry: nada foi gravado.\n');
    } else {
      fs.mkdirSync(path.dirname(ARQ_SAIDA), { recursive: true });
      fs.writeFileSync(ARQ_SAIDA, conteudo, 'utf8');
      console.log('\n  gravado: conteudo/musicas.js (' + Math.round(Buffer.byteLength(conteudo) / 1024) + ' KB)\n');
    }
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try {
      if (proc.exitCode === null) {
        proc.kill();
        await new Promise(res => { proc.once('exit', res); setTimeout(res, 400); });
      }
    } catch (e) {}
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (e) {}
  }
  process.exit(0);
})().catch(e => {
  console.error('ERRO: ' + e.message);
  process.exit(1);
});
