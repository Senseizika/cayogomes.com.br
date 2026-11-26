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
  'PLh16GoOWM6MYiaIyf3LxYSC4bnr7RYRg5',
  'OLAK5uy_kenTnVDHqrvrI-c0r8rqZQkN4Oj9OIegE'
];
// Canais oficiais: pega as faixas em alta (mais tocadas) de cada um.
const CANAIS = [
  { nome: 'Black Pantera', handle: '@BlackPanteraOficial', limite: 12 },
  { nome: 'Baiana System', handle: '@baianasystem', limite: 12 }
];
// Playlists "Músicas em alta" do YouTube: ordena por visualizações.
const POPULARES = [
  { id: 'OLAK5uy_lTtrRulwHl2WsspO1wj33uLrpNK8tBZjo', nome: 'Repudiyo', limite: 12 },
  { id: 'OLAK5uy_lvpm_RRAsqd0eaTrWf9XtLz_EEwbWrxK8', nome: 'Último Sopro', limite: 99 }
];
// Singles avulsos pedidos à parte (dados conferidos no YouTube).
const AVULSAS = [
  { id: 'WgxMVXDobT4', titulo: 'Centelha', artista: 'Controle - Topic', duracao: '2:53' },
  { id: 'kRnSu2DK-5g', titulo: 'Ignorância Suicida', artista: 'Controle - Topic', duracao: '2:55' },
  { id: 'sGoocg-S2cw', titulo: 'A Miséria É um Insulto', artista: 'Controle - Topic', duracao: '3:07' },
  { id: 'Bevaaghr26s', titulo: 'Com as Próprias Mãos', artista: 'Controle - Topic', duracao: '3:52' }
];
const urlVideo = id => `https://www.youtube.com/watch?v=${id}&hl=pt-BR&gl=BR`;
const urlPlaylist = id => `https://www.youtube.com/playlist?list=${id}&hl=pt-BR&gl=BR`;
const urlCanal = handle => `https://www.youtube.com/${handle}/videos?hl=pt-BR&gl=BR`;
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
    // Na playlist a 1ª linha é o artista e a 2ª traz views + idade.
    const views = txt(linhas[1]?.metadataParts?.[0]?.text) || txt(linhas[0]?.metadataParts?.[1]?.text);
    if (!/^[A-Za-z0-9_-]{11}$/.test(idVideo) || !titulo || !duracao) continue;
    faixas.push({ id: idVideo, titulo, artista, duracao, views });
  }
  return { totalPagina: document.body.innerText, faixas };
})()`;

// Mesma extração, mas para a aba "Em alta" dos canais oficiais: a linha de
// metadados traz as visualizações, então o artista é o próprio canal.
const EXTRACAO_CANAL = handle => `(() => {
  if (!location.href.includes(${JSON.stringify(handle)})) return { totalPagina: '', faixas: [] };
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
    const bruto = JSON.stringify(o);
    const duracao = (bruto.match(/"text":"(\\d+:\\d\\d)"/) || [])[1] || '';
    const views = txt(linhas[0]?.metadataParts?.[0]?.text);
    if (!/^[A-Za-z0-9_-]{11}$/.test(idVideo) || !titulo || !duracao) continue;
    faixas.push({ id: idVideo, titulo, duracao, views });
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

// Nos canais o título vem como "Black Pantera - Música" / "BaianaSystem - Música".
function limparTitulo(titulo, nome) {
  let t = String(titulo || '').trim();
  for (const p of [nome, nome.replace(/\s+/g, '')]) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // "Banda - Música" e "Banda e Convidado - Música"
    t = t.replace(new RegExp('^' + esc + '(?:\\s*(?:e|&|,|com|ft\\.?|feat\\.?)\\s*[^\\-–—:]{0,60})?\\s*[-–—:]\\s*', 'i'), '');
    // "Música - Banda e Convidado" e "MÚSICA Banda, Convidado feat..."
    t = t.replace(new RegExp('\\s*[-–—]\\s*' + esc + '\\b.*$', 'i'), '');
    t = t.replace(new RegExp('^([^\\s\\-–—]+)\\s+' + esc + '\\s*,.*$', 'i'), '$1');
  }
  t = t.replace(/\s*\((?:videoclipe\s*oficial|lyric\s*v[íi]deo|clipe\s*oficial|official\s*video)\)\s*$/i, '');
  t = t.replace(/\s*[-–—|]\s*(lyric\s*v[íi]deo|videoclipe\s*oficial|clipe\s*oficial|official\s*video|áudio\s*oficial)\s*$/i, '');
  return t.trim();
}

function segundos(duracao) {
  const partes = String(duracao || '').split(':').map(Number);
  return partes.length === 2 ? partes[0] * 60 + partes[1] : Infinity;
}

// "770", "1,1 mil", "2,3 mi" etc.
function numeroViews(texto) {
  const bruto = String(texto || '').trim();
  const numero = parseFloat(bruto.replace(/\./g, '').replace(',', '.'));
  if (!isFinite(numero)) return 0;
  if (/mil/i.test(bruto)) return numero * 1e3;
  if (/\bmi\b|\bmilh(?:ões|ão)\b/i.test(bruto)) return numero * 1e6;
  return numero;
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
      resumos.push({ tipo: 'PLAYLIST', id, modelo: modelo ? modelo[1] : '', novas, repetidas });
    }

    for (const canal of CANAIS) {
      await send('Page.navigate', { url: urlCanal(canal.handle) });

      for (let i = 0; i < 300; i++) {
        const r = await send('Runtime.evaluate', { expression: EXTRACAO_CANAL(canal.handle), awaitPromise: true, returnByValue: true });
        const v = r.result && r.result.result && r.result.result.value;
        if (v && v.faixas && v.faixas.length) break;
        await sleep(250);
      }
      // Seleciona "Em alta" — a ordenação pelas músicas mais tocadas do canal.
      for (let i = 0; i < 100; i++) {
        const r = await send('Runtime.evaluate', {
          expression: `(()=>{const e=[...document.querySelectorAll('button,yt-chip-cloud-chip-renderer,[role="tab"],a')].find(x=>(x.innerText||'').trim()==='Em alta');if(e){e.click();return true}return false})()`,
          awaitPromise: true, returnByValue: true
        });
        if (r.result && r.result.result && r.result.result.value) break;
        await sleep(200);
      }
      await sleep(2500);
      const r = await send('Runtime.evaluate', { expression: EXTRACAO_CANAL(canal.handle), awaitPromise: true, returnByValue: true });
      const valor = r.result && r.result.result && r.result.result.value;

      let novas = 0, repetidas = 0, ignoradas = 0;
      for (const f of (valor && valor.faixas) || []) {
        if (novas >= canal.limite) break;
        const titulo = limparTitulo(f.titulo, canal.nome);
        // Álbuns completos e vídeos longos não são faixas do HUD.
        if (/full\s*album|álbum\s*completo/i.test(titulo) || segundos(f.duracao) > 600) { ignoradas++; continue; }
        const item = { id: f.id, titulo, artista: canal.nome, duracao: f.duracao };
        const chave = chaveMusica(item);
        if (porId.has(f.id) || porMusica.has(chave)) { repetidas++; continue; }
        porId.add(f.id); porMusica.add(chave); faixas.push(item); novas++;
      }
      resumos.push({
        tipo: 'CANAL', id: canal.handle + ' (' + canal.nome + ')',
        modelo: 'Em alta', novas, repetidas, ignoradas
      });
    }

    for (const popular of POPULARES) {
      await send('Page.navigate', { url: urlPlaylist(popular.id) });

      let valor;
      for (let i = 0; i < 300; i++) {
        const r = await send('Runtime.evaluate', { expression: EXTRACAO(popular.id), awaitPromise: true, returnByValue: true });
        valor = r.result && r.result.result && r.result.result.value;
        if (valor && valor.faixas && valor.faixas.length) break;
        await sleep(250);
      }
      await sleep(1200);
      const r = await send('Runtime.evaluate', { expression: EXTRACAO(popular.id), awaitPromise: true, returnByValue: true });
      valor = r.result && r.result.result && r.result.result.value;

      const ordenadas = ((valor && valor.faixas) || [])
        .slice()
        .sort((a, b) => numeroViews(b.views) - numeroViews(a.views));
      let novas = 0, repetidas = 0;
      for (const f of ordenadas) {
        if (novas >= popular.limite) break;
        const chave = chaveMusica(f);
        if (porId.has(f.id) || porMusica.has(chave)) { repetidas++; continue; }
        porId.add(f.id); porMusica.add(chave); faixas.push(f); novas++;
      }
      resumos.push({
        tipo: 'EM ALTA', id: popular.id + ' (' + popular.nome + ')',
        modelo: 'por visualizações' + (popular.limite < 99 ? ', até ' + popular.limite : ', todas'),
        novas, repetidas
      });
    }

    let novasAvulsas = 0;
    for (const f of AVULSAS) {
      const chave = chaveMusica(f);
      if (porId.has(f.id) || porMusica.has(chave)) continue;
      porId.add(f.id); porMusica.add(chave); faixas.push(f); novasAvulsas++;
    }
    resumos.push({
      tipo: 'AVULSOS', id: 'Controle (singles)', modelo: '',
      novas: novasAvulsas, repetidas: AVULSAS.length - novasAvulsas
    });

    if (!faixas.length) {
      console.error('Nenhuma faixa encontrada. O YouTube pode ter mudado o formato da página.');
      process.exit(1);
    }

    for (const s of resumos) {
      console.log('\n  ' + s.tipo + ' ' + s.id);
      if (s.modelo) {
        console.log(s.tipo === 'PLAYLIST'
          ? '  YouTube informa ' + s.modelo + ' vídeos (indisponíveis ficam ocultos).'
          : '  Ordenação: ' + s.modelo);
      }
      console.log('  novas: ' + s.novas + '  |  repetidas (ignoradas): ' + s.repetidas +
        (s.ignoradas ? '  |  álbuns/vídeos longos: ' + s.ignoradas : ''));
    }

    const cabecalho = '// Gerado por tools/gerar-musicas.js — não edite à mão.\n' +
      '// playlists:\n' + PLAYLISTS.map(id => '//   ' + urlPlaylist(id) + '\n').join('') +
      '// canais (em alta):\n' + CANAIS.map(c => '//   ' + urlCanal(c.handle) + '\n').join('') +
      '// em alta (por visualizações):\n' + POPULARES.map(p => '//   ' + urlPlaylist(p.id) + '\n').join('') +
      '// singles avulsos:\n' + AVULSAS.map(f => '//   ' + urlVideo(f.id) + '\n').join('') +
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
