#!/usr/bin/env node
/*
 * tools/painel.js — painel local para postar projetos.
 *
 * Uso:            node tools/painel.js
 * Sem abrir o navegador:   node tools/painel.js --sem-abrir
 * Outra porta:    set PORTA=5000 && node tools/painel.js
 *
 * O que ele faz:
 *   - lê e grava conteudo/projetos.json (a fonte da verdade)
 *   - regrava conteudo/projetos.js (o arquivo que o site carrega)
 *   - grava imagens em img/projetos/<pasta>/NN.ext
 *
 * Segurança: escuta só em 127.0.0.1 e as rotas /api exigem o token da
 * sessão (aparece na URL). Sem o token, qualquer site aberto no navegador
 * poderia mandar POST para o painel enquanto ele estiver rodando.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR_CONTEUDO = path.join(ROOT, 'conteudo');
const ARQ_JSON = path.join(DIR_CONTEUDO, 'projetos.json');
const ARQ_JS = path.join(DIR_CONTEUDO, 'projetos.js');
const ARQ_CONTENT = path.join(ROOT, 'content.js');
const DIR_IMG = path.join(ROOT, 'img', 'projetos');
const PAINEL_HTML = path.join(__dirname, 'painel.html');

const CABECALHO_JS = '/* GERADO POR tools/painel.js — não edite à mão.\n' +
  '   A fonte da verdade é conteudo/projetos.json */\n';

const TOKEN = process.env.PAINEL_TOKEN || crypto.randomBytes(12).toString('hex');
const ABRIR = !process.argv.includes('--sem-abrir');
let porta = Number(process.env.PORTA) || 4173;

/* ---------- conteúdo ---------- */
function lerProjetos() {
  try {
    const v = JSON.parse(fs.readFileSync(ARQ_JSON, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

/* áreas e categorias vêm do content.js, para não duplicar a lista */
function lerAreas() {
  try {
    const src = fs.readFileSync(ARQ_CONTENT, 'utf8');
    const areas = new Function(src + '\nreturn AREAS;')();
    return (Array.isArray(areas) ? areas : []).map(a => ({
      id: a.id,
      name: { pt: a.name?.pt || a.id, en: a.name?.en || a.id },
      cats: (a.cats || []).map(c => ({ id: c.id, name: { pt: c.name?.pt || c.id } }))
    }));
  } catch (e) {
    console.error('  aviso: não consegui ler AREAS do content.js (' + e.message + ')');
    return [];
  }
}

/* limpa e valida o que veio do navegador antes de gravar */
function normalizar(lista) {
  if (!Array.isArray(lista)) throw new Error('formato inválido: esperava uma lista');
  if (lista.length > 500) throw new Error('limite de 500 projetos');
  return lista.map(p => {
    const media = (Array.isArray(p.media) ? p.media : [])
      .filter(m => m && ['image', 'video', 'sketchfab'].includes(m.type) && m.src)
      .map(m => {
        const o = { type: m.type, src: String(m.src) };
        if (m.type !== 'image' && m.poster) o.poster = String(m.poster);
        return o;
      });
    const item = {
      area: String(p.area || ''),
      h: Math.max(0, Math.min(360, Number(p.h) || 0)),
      tools: String(p.tools || ''),
      title: { pt: String(p.title?.pt || ''), en: String(p.title?.en || '') },
      desc: { pt: String(p.desc?.pt || ''), en: String(p.desc?.en || '') },
      media
    };
    if (p.cat) item.cat = String(p.cat);
    // mantém a chave cat logo depois de area, como no arquivo original
    if (item.cat) {
      const { area, cat, ...resto } = item;
      return { area, cat, ...resto };
    }
    return item;
  });
}

function gravar(lista) {
  fs.mkdirSync(DIR_CONTEUDO, { recursive: true });
  fs.writeFileSync(ARQ_JSON, JSON.stringify(lista, null, 2) + '\n', 'utf8');
  fs.writeFileSync(ARQ_JS, CABECALHO_JS + 'const PROJECTS = ' + JSON.stringify(lista, null, 2) + ';\n', 'utf8');
}

/* ---------- imagens ---------- */
const EXT_OK = ['webp', 'jpg', 'jpeg', 'png', 'avif', 'gif'];

function salvarImagem(pasta, nomeOriginal, dataUrl) {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('arquivo inválido');

  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw new Error('arquivo vazio');
  if (buf.length > 8 * 1024 * 1024) throw new Error('imagem maior que 8 MB');

  let ext = (path.extname(String(nomeOriginal || '')).slice(1) || '').toLowerCase();
  if (!EXT_OK.includes(ext)) ext = 'jpg';

  const seg = String(pasta || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!seg) throw new Error('pasta inválida');

  const dir = path.join(DIR_IMG, seg);
  fs.mkdirSync(dir, { recursive: true });

  const usados = new Set(fs.readdirSync(dir));
  let n = 1;
  while (usados.has(String(n).padStart(2, '0') + '.' + ext)) n++;
  const arq = String(n).padStart(2, '0') + '.' + ext;

  fs.writeFileSync(path.join(dir, arq), buf);
  return { caminho: 'img/projetos/' + seg + '/' + arq, bytes: buf.length };
}

/* ---------- arquivos estáticos ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function enviar(res, abs) {
  fs.readFile(abs, (e, buf) => {
    if (e) return json(res, 404, { erro: 'não encontrado' });
    res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}

function servirArquivo(res, abs) {
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return json(res, 403, { erro: 'fora do projeto' });
  if (/^(tools|\.git|backup)([\\/]|$)/i.test(rel)) return json(res, 404, { erro: 'não encontrado' });
  fs.readFile(abs, (e, buf) => {
    if (e) return json(res, 404, { erro: 'não encontrado' });
    res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}

/* ---------- http ---------- */
function json(res, codigo, obj) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function corpo(req) {
  return new Promise((ok, err) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 40e6) { req.destroy(); err(new Error('corpo grande demais')); } });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { err(new Error('json inválido')); } });
    req.on('error', err);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rota = url.pathname;

  try {
    if (req.method === 'GET' && (rota === '/' || rota === '/painel.html')) {
      return enviar(res, PAINEL_HTML);
    }
    if (req.method === 'GET' && rota === '/site') {
      return servirArquivo(res, path.join(ROOT, 'index.html'));
    }

    if (rota.startsWith('/api/')) {
      if (req.headers['x-painel-token'] !== TOKEN) return json(res, 403, { erro: 'token inválido' });

      if (rota === '/api/estado' && req.method === 'GET') {
        return json(res, 200, { projetos: lerProjetos(), areas: lerAreas() });
      }
      if (rota === '/api/projetos' && req.method === 'POST') {
        const dados = await corpo(req);
        const lista = normalizar(dados.projetos);
        gravar(lista);
        console.log(`  salvo: ${lista.length} projeto(s)`);
        return json(res, 200, { ok: true, total: lista.length });
      }
      if (rota === '/api/imagem' && req.method === 'POST') {
        const dados = await corpo(req);
        const r = salvarImagem(dados.pasta, dados.nome, dados.dados);
        console.log(`  imagem: ${r.caminho} (${Math.round(r.bytes / 1024)} KB)`);
        return json(res, 200, r);
      }
      return json(res, 404, { erro: 'rota não encontrada' });
    }

    if (req.method === 'GET') return servirArquivo(res, path.join(ROOT, decodeURIComponent(rota)));
    json(res, 405, { erro: 'método não permitido' });
  } catch (e) {
    json(res, 400, { erro: e.message });
  }
});

function subir() {
  server.once('error', e => {
    if (e.code === 'EADDRINUSE' && porta < 4199) { porta++; subir(); }
    else { console.error('ERRO: ' + e.message); process.exit(1); }
  });
  server.listen(porta, '127.0.0.1', () => {
    const link = `http://127.0.0.1:${porta}/?t=${TOKEN}`;
    console.log('\n  PAINEL — cayogomes.com.br');
    console.log('  ' + link);
    console.log('  (Ctrl+C para parar)\n');
    if (ABRIR) exec(`start "" "${link}"`);
  });
}

subir();
