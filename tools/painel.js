#!/usr/bin/env node
/*
 * tools/painel.js — painel local para postar projetos.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR_CONTEUDO = path.join(ROOT, 'conteudo');
const ARQ_JSON = path.join(DIR_CONTEUDO, 'projetos.json');
const ARQ_JS = path.join(DIR_CONTEUDO, 'projetos.js');
const ARQ_CONTENT = path.join(ROOT, 'content.js');
const ARQ_AREAS_JSON = path.join(DIR_CONTEUDO, 'areas.json');
const DIR_IMG = path.join(ROOT, 'img', 'projetos');
const PAINEL_HTML = path.join(__dirname, 'painel.html');

const CABECALHO_JS = '/* GERADO POR tools/painel.js — não edite à mão.\n' +
  '   A fonte da verdade é conteudo/projetos.json */\n';

const TOKEN = process.env.PAINEL_TOKEN || crypto.randomBytes(12).toString('hex');
const ABRIR = !process.argv.includes('--sem-abrir');
let porta = Number(process.env.PORTA) || 4173;

function lerProjetos() {
  try {
    const v = JSON.parse(fs.readFileSync(ARQ_JSON, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

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

function lerAreasCompletas() {
  try {
    const v = JSON.parse(fs.readFileSync(ARQ_AREAS_JSON, 'utf8'));
    if (Array.isArray(v)) return v;
  } catch (e) {}
  try {
    const src = fs.readFileSync(ARQ_CONTENT, 'utf8');
    const areas = new Function(src + '\nreturn AREAS;')();
    return Array.isArray(areas) ? areas : [];
  } catch (e) {
    console.error('  aviso: não consegui ler AREAS completas (' + e.message + ')');
    return [];
  }
}

const slugify = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function normalizarAreas(lista) {
  if (!Array.isArray(lista)) throw new Error('formato inválido: esperava lista');
  if (lista.length > 30) throw new Error('máximo de 30 áreas');
  return lista.map((a, idx) => {
    const id = slugify(a.id) || slugify(a.name?.pt) || ('area-' + (idx + 1));
    if (!id) throw new Error('área ' + (idx + 1) + ' sem id');
    const cats = (Array.isArray(a.cats) ? a.cats : []).map((c, ci) => {
      const cid = slugify(c.id) || slugify(c.name?.pt) || ('cat-' + (ci + 1));
      const pt = String(c.name?.pt || cid);
      return { id: cid, name: { pt, en: String(c.name?.en || c.name?.pt || cid) } };
    }).filter(c => c.id);
    const ptNome = String(a.name?.pt || id);
    const ptShort = String(a.short?.pt || '');
    return {
      id,
      name:  { pt: ptNome, en: String(a.name?.en || a.name?.pt || id) },
      short: { pt: ptShort, en: String(a.short?.en || ptShort || '') },
      cats,
      lead:  { pt: String(a.lead?.pt || ''), en: String(a.lead?.en || '') }
    };
  });
}

function gravarAreas(lista) {
  fs.mkdirSync(DIR_CONTEUDO, { recursive: true });
  fs.writeFileSync(ARQ_AREAS_JSON, JSON.stringify(lista, null, 2) + '\n', 'utf8');
  let src = fs.readFileSync(ARQ_CONTENT, 'utf8');
  const novasAreas = 'const AREAS = ' + JSON.stringify(lista, null, 2) + ';';
  const re = /const AREAS = \[[\s\S]*?\n\];/;
  if (!re.test(src)) {
    console.warn('  aviso: bloco AREAS não encontrado no content.js — apenas areas.json foi atualizado');
    return;
  }
  const novo = src.replace(re, novasAreas);
  if (novo !== src) fs.writeFileSync(ARQ_CONTENT, novo, 'utf8');
}

function normalizar(lista) {
  if (!Array.isArray(lista)) throw new Error('formato inválido: esperava uma lista');
  if (lista.length > 500) throw new Error('limite de 500 projetos');
  return lista.map(p => {
    const media = (Array.isArray(p.media) ? p.media : [])
      .filter(m => m && ['image', 'video', 'sketchfab'].includes(m.type) && m.src)
      .map(m => {
        const o = { type: m.type, src: String(m.src) };
        if (m.type !== 'image' && m.poster) o.poster = String(m.poster);
        if (m.fullscreen) o.fullscreen = true;
        return o;
      });
    const item = {
      area: String(p.area || ''),
      galeria: p.galeria === 'carrossel' ? 'carrossel' : 'slide', /* <--- NOVA OPÇÃO AQUI */
      h: Math.max(0, Math.min(360, Number(p.h) || 0)),
      tools: String(p.tools || ''),
      title: { pt: String(p.title?.pt || ''), en: String(p.title?.en || '') },
      desc: { pt: String(p.desc?.pt || ''), en: String(p.desc?.en || '') },
      media
    };
    if (p.cat) item.cat = String(p.cat);
    if (item.cat) {
      const { area, galeria, cat, ...resto } = item;
      return { area, galeria, cat, ...resto };
    }
    return item;
  });
}

function proximoNomeArquivo(dir, ext) {
  fs.mkdirSync(dir, { recursive: true });
  const usados = new Set(fs.readdirSync(dir));
  let n = 1;
  while (usados.has(String(n).padStart(2, '0') + '.' + ext)) n++;
  return String(n).padStart(2, '0') + '.' + ext;
}

function realocarPastasTemporarias(lista) {
  const movidos = new Map();
  const dirsOrigem = new Set();

  for (const p of lista) {
    const segDestino = slugify(p.title?.pt || p.title?.en);
    if (!segDestino || segDestino.startsWith('novo-')) continue;
    const dirDestino = path.join(DIR_IMG, segDestino);

    for (const m of (p.media || [])) {
      for (const campo of ['src', 'poster']) {
        const val = m[campo];
        if (!val || typeof val !== 'string') continue;
        const match = /^img\/projetos\/(novo-[^/]+)\/([^/]+)$/.exec(val);
        if (!match) continue;

        if (movidos.has(val)) {
          m[campo] = movidos.get(val);
          continue;
        }

        const dirOrig = path.resolve(DIR_IMG, match[1]);
        const arqOrig = path.resolve(dirOrig, match[2]);
        if (!arqOrig.startsWith(DIR_IMG + path.sep) || !fs.existsSync(arqOrig)) continue;

        const ext = String(path.extname(match[2]).slice(1)).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const nomeDestino = proximoNomeArquivo(dirDestino, ext);
        const arqDestino = path.join(dirDestino, nomeDestino);
        try {
          fs.renameSync(arqOrig, arqDestino);
        } catch (err) {
          fs.copyFileSync(arqOrig, arqDestino);
          fs.unlinkSync(arqOrig);
        }
        const novoCaminho = 'img/projetos/' + segDestino + '/' + nomeDestino;
        movidos.set(val, novoCaminho);
        m[campo] = novoCaminho;
        dirsOrigem.add(dirOrig);
      }
    }
  }

  for (const d of dirsOrigem) {
    try {
      if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
    } catch (e) {}
  }
}

function limparPastasRemovidas(listaAntiga, listaNova) {
  const slugsNovos = new Set((listaNova || []).map(p => slugify(p.title?.pt || p.title?.en)).filter(Boolean));
  const pastasUsadas = new Set();
  for (const p of (listaNova || [])) {
    for (const m of (p.media || [])) {
      for (const campo of ['src', 'poster']) {
        const v = m[campo];
        if (typeof v !== 'string') continue;
        const mm = /^img\/projetos\/([^/]+)\//.exec(v);
        if (mm) pastasUsadas.add(mm[1]);
      }
    }
  }
  for (const p of (listaAntiga || [])) {
    const slug = slugify(p.title?.pt || p.title?.en);
    if (!slug) continue;
    if (slugsNovos.has(slug)) continue;
    if (pastasUsadas.has(slug)) continue;
    const dir = path.join(DIR_IMG, slug);
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('  pasta removida (projeto excluido): ' + slug);
      }
    } catch (e) {
      console.log('  erro ao remover pasta ' + slug + ': ' + e.message);
    }
  }
}
function gravar(lista) {
  fs.mkdirSync(DIR_CONTEUDO, { recursive: true });
  fs.writeFileSync(ARQ_JSON, JSON.stringify(lista, null, 2) + '\n', 'utf8');
  fs.writeFileSync(ARQ_JS, CABECALHO_JS + 'const PROJECTS = ' + JSON.stringify(lista) + ';\n', 'utf8');
}

function salvarArquivo(pasta, nomeOriginal, dataUrl) {
  const m = /^data:([^,]*),([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('arquivo inválido');
  if (!/;base64$/i.test(m[1])) throw new Error('envio não é base64');

  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw new Error('arquivo vazio');
  if (buf.length > 30 * 1024 * 1024) throw new Error('arquivo maior que 30 MB');

  let ext = String(path.extname(String(nomeOriginal || '')).slice(1)).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ext || ext.length > 10) ext = 'bin';

  const seg = slugify(pasta);
  if (!seg) throw new Error('pasta inválida');

  const dir = path.join(DIR_IMG, seg);
  const arq = proximoNomeArquivo(dir, ext);

  fs.writeFileSync(path.join(dir, arq), buf);
  return { caminho: 'img/projetos/' + seg + '/' + arq, bytes: buf.length };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.heic': 'image/heic', '.jxl': 'image/jxl', '.psd': 'image/vnd.adobe.photoshop',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2'
};

function servirArquivo(res, abs, soCabecalho = false) {
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return json(res, 403, { erro: 'fora do projeto' });
  if (/^(tools|\.git|backup)([\\/]|$)/i.test(rel)) return json(res, 404, { erro: 'não encontrado' });
  fs.readFile(abs, (e, buf) => {
    if (e) return json(res, 404, { erro: 'não encontrado' });
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'content-length': buf.length,
      'cache-control': 'no-store'
    });
    res.end(soCabecalho ? undefined : buf);
  });
}

function rodarGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function json(res, codigo, obj) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function corpo(req) {
  return new Promise((ok, err) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 45e6) { req.destroy(); err(new Error('corpo grande demais')); } });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { err(new Error('json inválido')); } });
    req.on('error', err);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rota = url.pathname;
  const ehLeitura = req.method === 'GET' || req.method === 'HEAD';
  const ehHead = req.method === 'HEAD';

  try {
    if (ehLeitura && (rota === '/' || rota === '/painel.html')) {
      const html = fs.readFileSync(PAINEL_HTML, 'utf8').replace('__PAINEL_TOKEN__', TOKEN);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      });
      return res.end(ehHead ? undefined : html);
    }
    if (ehLeitura && rota === '/site') {
      return servirArquivo(res, path.join(ROOT, 'index.html'), ehHead);
    }

    if (rota.startsWith('/api/')) {
      if (req.headers['x-painel-token'] !== TOKEN) return json(res, 403, { erro: 'token inválido' });

      if (rota === '/api/estado' && req.method === 'GET') {
        return json(res, 200, { projetos: lerProjetos(), areas: lerAreas(), areasCompletas: lerAreasCompletas() });
      }
      if (rota === '/api/projetos' && req.method === 'POST') {
        const dados = await corpo(req);
        const listaAntiga = lerProjetos();
        const lista = normalizar(dados.projetos);
        realocarPastasTemporarias(lista);
        gravar(lista);
        limparPastasRemovidas(listaAntiga, lista);
        console.log(`  salvo: ${lista.length} projeto(s)`);
        return json(res, 200, { ok: true, total: lista.length, projetos: lista });
      }
      if (rota === '/api/areas' && req.method === 'POST') {
        const dados = await corpo(req);
        const lista = normalizarAreas(dados.areas);
        gravarAreas(lista);
        console.log(`  áreas: ${lista.length} área(s) salva(s)`);
        return json(res, 200, { ok: true, total: lista.length });
      }
      if (rota === '/api/arquivo' && req.method === 'POST') {
        const dados = await corpo(req);
        const r = salvarArquivo(dados.pasta, dados.nome, dados.dados);
        console.log(`  arquivo: ${r.caminho} (${Math.round(r.bytes / 1024)} KB)`);
        return json(res, 200, r);
      }
      if (rota === '/api/git/pull' && req.method === 'POST') {
        const head = async () => (await rodarGit(['rev-parse', 'HEAD'])).stdout.trim();
        try {
          try {
            await rodarGit(['fetch', '--prune']);
          } catch (err) {
            return json(res, 400, {
              erro: 'Falha ao buscar do GitHub',
              log: ((err.stderr || '') + '\n' + (err.stdout || '')).trim() || err.message
            });
          }
          const antes = await head().catch(() => '');
          let saida = '';
          try {
            const p = await rodarGit(['pull', '--ff-only']);
            saida = ((p.stdout || '') + (p.stderr || '')).trim();
          } catch (err) {
            return json(res, 409, {
              erro: 'Não deu para baixar',
              log: ((err.stdout || '') + '\n' + (err.stderr || '')).trim() || err.message
            });
          }
          const depois = await head().catch(() => '');
          let novos = 0;
          if (antes && depois && antes !== depois) {
            const c = await rodarGit(['rev-list', '--count', antes + '..' + depois]).catch(() => null);
            novos = c ? (Number(String(c.stdout).trim()) || 1) : 1;
          }
          const ultimo = ((await rodarGit(['log', '-1', '--pretty=%h %s'])).stdout || '').trim();
          if (novos) console.log(`  pull: ${novos} commit(s) novo(s) — ${ultimo}`);
          return json(res, 200, { ok: true, novos, ultimo, log: saida || 'Já estava atualizado.' });
        } catch (err) {
          return json(res, 400, {
            erro: 'Falha ao baixar',
            log: ((err.stderr || '') + '\n' + (err.stdout || '')).trim() || err.message
          });
        }
      }
      if (rota === '/api/git/push' && req.method === 'POST') {
        const dados = await corpo(req);
        const msg = String(dados.mensagem || 'Atualização via painel').trim() || 'Atualização via painel';
        try {
          await rodarGit(['add', '-A']);
          let commitOut = '';
          try {
            const c = await rodarGit(['commit', '-m', msg]);
            commitOut = c.stdout || '';
          } catch (err) {
            const txt = (err.stdout || '') + '\n' + (err.stderr || '');
            if (/nothing to commit|no changes added/i.test(txt)) {
              return json(res, 200, { ok: true, log: 'Nenhuma alteração para enviar.' });
            }
            return json(res, 400, { erro: 'Falha no Git', log: err.stderr || err.stdout || err.message });
          }
          const p = await rodarGit(['push']);
          return json(res, 200, { ok: true, log: p.stdout || commitOut || 'Enviado para o GitHub com sucesso!' });
        } catch (err) {
          return json(res, 400, { erro: 'Falha no Git', log: err.stderr || err.stdout || err.message });
        }
      }
      return json(res, 404, { erro: 'rota não encontrada' });
    }

    if (ehLeitura) return servirArquivo(res, path.join(ROOT, decodeURIComponent(rota)), ehHead);
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
    const link = `http://127.0.0.1:${porta}/`;
    console.log('\n  PAINEL — cayogomes.com.br');
    console.log('  ' + link);
    console.log('  (Ctrl+C para parar)\n');
    if (ABRIR) exec(`start "" "${link}"`);
  });
}

subir();