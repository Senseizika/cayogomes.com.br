#!/usr/bin/env node
/*
 * tools/paleta.js — gera a cor de destaque a partir dos fundos.
 *
 * Uso:
 *   node tools/paleta.js          -> recalcula a paleta e grava no index.html
 *   node tools/paleta.js --dry    -> só mostra o resultado, não grava
 *
 * O que ele faz:
 *   1. Lê todos os arquivos de img/Fundo (fundo1.webp, fundo2.webp...).
 *   2. Abre o Edge/Chrome escondido (headless) e, para cada imagem:
 *        - reduz para 64x64 num canvas (não pesa: ~0,1 ms por imagem);
 *        - descarta pixels escuros/apagados;
 *        - escolhe a cor vibrante dominante (por matiz);
 *        - clareia o suficiente para o texto ter contraste >= 4.5:1 no fundo escuro.
 *   3. Substitui o bloco entre /* PALETA:INICIO *​/ e /* PALETA:FIM *​/ no index.html.
 *
 * A cor vem SEMPRE de img/Fundo. As camadas de img/Fundo2 são brancas/transparentes
 * e não alteram o matiz, por isso não entram no cálculo.
 *
 * Funciona com o arquivo aberto normalmente (file://) porque o navegador é iniciado
 * com --allow-file-access-from-files, que libera a leitura dos pixels.
 *
 * Requisitos: Node 18+ e Edge ou Chrome instalado.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const PASTA_FUNDOS = path.join(ROOT, 'img', 'Fundo');
const PASTA_CAMADAS = path.join(ROOT, 'img', 'Fundo2');
const DRY = process.argv.includes('--dry');

const MIN_CONTRASTE = 4.5;    // WCAG AA para texto pequeno
const COR_FUNDO = '#050506';  // --ink (fundo do site)
const COR_PADRAO = '#ef2b31'; // usado se a imagem não tiver cor (cinza/preto)

/* ---------- localizar o navegador ---------- */
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

/* ---------- listar os fundos ---------- */
function numeroDoArquivo(nome) {
  const m = nome.match(/(\d+)(?=\.[^.]+$)/);
  return m ? parseInt(m[1], 10) : 0;
}

function listarFundos() {
  if (!fs.existsSync(PASTA_FUNDOS)) {
    console.error('Pasta não encontrada: ' + PASTA_FUNDOS);
    process.exit(1);
  }
  const arquivos = fs.readdirSync(PASTA_FUNDOS)
    .filter(f => /\.(webp|png|jpe?g|avif)$/i.test(f))
    .sort((a, b) => numeroDoArquivo(a) - numeroDoArquivo(b) || a.localeCompare(b));
  if (!arquivos.length) {
    console.error('Nenhuma imagem encontrada em ' + PASTA_FUNDOS);
    process.exit(1);
  }
  return arquivos;
}

/* ---------- conferir o total no index.html ---------- */
function lerIndex(arquivos) {
  let html = fs.readFileSync(INDEX, 'utf8');
  const m = html.match(/base:\s*\{[^}]*total:\s*(\d+)/);
  const maior = Math.max(...arquivos.map(numeroDoArquivo));
  if (m && maior !== Number(m[1])) {
    const antes = Number(m[1]);
    html = html.replace(/(base:\s*\{[^}]*total:\s*)(\d+)/, (s, ini) => ini + maior);
    console.log(`\n  FUNDOS.base.total ${DRY ? 'seria' : 'foi'} atualizado de ${antes} para ${maior}.`);
  }
  if (fs.existsSync(PASTA_CAMADAS)) {
    const camadas = fs.readdirSync(PASTA_CAMADAS).filter(f => /\.(webp|png|jpe?g|avif)$/i.test(f));
    const mc = html.match(/camada:\s*\{[^}]*total:\s*(\d+)/);
    const maiorCamada = camadas.length ? Math.max(...camadas.map(numeroDoArquivo)) : 0;
    if (mc && maiorCamada !== Number(mc[1])) {
      const antes = Number(mc[1]);
      html = html.replace(/(camada:\s*\{[^}]*total:\s*)(\d+)/, (s, ini) => ini + maiorCamada);
      console.log(`  FUNDOS.camada.total ${DRY ? 'seria' : 'foi'} atualizado de ${antes} para ${maiorCamada}.`);
    }
  }
  return html;
}

/* ---------- ponte com o navegador ---------- */
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

const EXPRESSAO = `(async () => {
  const LUM = (r, g, b) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contraste = (r, g, b, r2, g2, b2) => {
    const a = LUM(r, g, b), c = LUM(r2, g2, b2);
    return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
  };
  const hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const l = (mx + mn) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return [h, s, l];
  };
  const hsl2rgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };
  const hex = (r, g, b) => '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const rgbHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  const MIN = ${MIN_CONTRASTE};
  const COR_FUNDO = '${COR_FUNDO}';
  const COR_PADRAO = '${COR_PADRAO}';
  const resultado = [];

  for (const item of ARQUIVOS_PLACEHOLDER) {
    let img;
    try {
      img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('falhou'));
        im.src = item.url;
      });
    } catch (e) { resultado.push({ arquivo: item.nome, erro: 'não carregou' }); continue; }

    const N = 64;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);

    let dados;
    try { dados = ctx.getImageData(0, 0, N, N).data; }
    catch (e) { resultado.push({ arquivo: item.nome, erro: 'pixels bloqueados' }); continue; }

    const bins = Array.from({ length: 24 }, () => ({ peso: 0, r: 0, g: 0, b: 0 }));
    let n = 0;
    for (let p = 0; p < dados.length; p += 4) {
      const r = dados[p], g = dados[p + 1], b = dados[p + 2], a = dados[p + 3];
      if (a < 200) continue;
      n++;
      const [h, s, l] = hsl(r, g, b);
      if (l < 0.10 || l > 0.92 || s < 0.18) continue;   // quase preto/branco/cinza: ignora
      const peso = s * (1 - Math.abs(l - 0.5) * 1.1);   // prefere cores vivas e de meio-tom
      if (peso <= 0) continue;
      const i = Math.floor(h / 15) % 24;
      bins[i].peso += peso; bins[i].r += r * peso; bins[i].g += g * peso; bins[i].b += b * peso;
    }
    if (!n) { resultado.push({ arquivo: item.nome, erro: 'imagem vazia' }); continue; }

    let melhor = bins[0];
    for (const b of bins) if (b.peso > melhor.peso) melhor = b;

    let cor, origem;
    if (melhor.peso > 0) {
      const r = melhor.r / melhor.peso, g = melhor.g / melhor.peso, b = melhor.b / melhor.peso;
      let [h, s, l] = hsl(r, g, b);
      s = Math.max(0.60, Math.min(0.95, s));
      l = Math.max(0.45, Math.min(0.88, l));
      // clareia até passar no contraste com o fundo escuro
      while (l < 0.92 && contraste(...hsl2rgb(h, s, l), ...rgbHex(COR_FUNDO)) < MIN) l += 0.005;
      cor = hex(...hsl2rgb(h, s, l));
      origem = 'vibrante';
    } else {
      cor = COR_PADRAO;
      origem = 'padrão (imagem sem cor)';
    }

    const [r, g, b] = rgbHex(cor);
    resultado.push({
      arquivo: item.nome,
      cor,
      contraste: +contraste(r, g, b, ...rgbHex(COR_FUNDO)).toFixed(2),
      origem
    });
  }
  return resultado;
})()`;

/* ---------- principal ---------- */
(async () => {
  const arquivos = listarFundos();
  const html = lerIndex(arquivos);

  const navegador = acharNavegador();
  if (!navegador) {
    console.error('Edge/Chrome não encontrado. Defina a variável NAVEGADOR com o caminho do executável.');
    process.exit(1);
  }

  // página temporária só para liberar o acesso aos arquivos locais
  const tmp = path.join(ROOT, '.paleta-tmp.html');
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8"><title>paleta</title>');

  const porta = 9700 + Math.floor(Math.random() * 200);
  const perfil = path.join(os.tmpdir(), 'paleta-' + Date.now());
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

    const lista = arquivos.map(f => ({
      nome: f,
      url: pathToFileURL(path.join(PASTA_FUNDOS, f)).href
    }));
    const expr = EXPRESSAO.replace('ARQUIVOS_PLACEHOLDER', () => JSON.stringify(lista));

    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const valor = res.result && res.result.result && res.result.result.value;
    if (!valor) {
      console.error('Falha ao calcular. Resposta do navegador:');
      console.error(JSON.stringify(res.result, null, 2));
      process.exit(1);
    }

    /* ---------- relatório ---------- */
    console.log('\n  COR DE DESTAQUE POR FUNDO\n');
    console.log('  ' + 'arquivo'.padEnd(16) + 'cor'.padEnd(10) + 'contraste'.padEnd(12) + 'origem');
    console.log('  ' + '-'.repeat(54));
    for (const r of valor) {
      if (r.erro) { console.log('  ' + r.arquivo.padEnd(16) + 'ERRO: ' + r.erro); continue; }
      const aviso = r.contraste < MIN_CONTRASTE ? '  <-- baixo' : '';
      console.log('  ' + r.arquivo.padEnd(16) + r.cor.padEnd(10) + (r.contraste + ':1').padEnd(12) + r.origem + aviso);
    }

    const validos = valor.filter(r => !r.erro);
    if (validos.length !== valor.length) {
      console.warn('\n  ' + (valor.length - validos.length) + ' imagem(ns) com erro foram ignoradas.');
    }

    /* ---------- gravar no index.html ---------- */
    const linhas = validos.map(r => `  ${JSON.stringify(r.arquivo)}: ${JSON.stringify(r.cor)}`).join(',\n');
    const bloco = `/* PALETA:INICIO (gerado por tools/paleta.js - não edite à mão) */\n` +
      `const PALETA = {\n${linhas}\n};\n` +
      `/* PALETA:FIM */`;

    const re = /\/\* PALETA:INICIO[\s\S]*?\/\* PALETA:FIM \*\//;
    if (!re.test(html)) {
      console.error('\n  Não encontrei os marcadores PALETA:INICIO / PALETA:FIM no index.html.');
      process.exit(1);
    }

    if (DRY) {
      console.log('\n  --dry: index.html não foi alterado. Bloco que seria gravado:\n');
      console.log(bloco);
    } else {
      fs.writeFileSync(INDEX, html.replace(re, () => bloco), 'utf8');
      console.log(`\n  index.html atualizado com ${validos.length} cores.`);
    }
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
