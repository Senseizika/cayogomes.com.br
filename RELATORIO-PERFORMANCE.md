# Relatório de performance — cayogomes.com.br

Data: 21/11/2026  
Ambiente: Microsoft Edge headless (Chromium), servidor estático local, redimensionamento de viewport e emulação de toque.  
Cenários: desktop 1440×900, mobile 390×844, mobile 390×844 com 4G (150 ms RTT, 1,6 Mbps) + CPU 4× mais lento.  
Observação: o servidor local **não comprimiu** as respostas. Números de transferência refletem arquivos brutos; em hospedagem com gzip/Brotli o HTML/JS cai ~70% (ver abaixo).

---

## 1. Resultados consolidados

| Cenário | TTFB | FCP | LCP | CLS | `load` | Transferência | Long tasks | Heap JS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Desktop (cold) | 4 ms | 164 ms | 164 ms | 0,0052 | 210 ms | 1,87 MB | 0 | 1,0 MB |
| Desktop (warm) | 3 ms | 160 ms | 160 ms | 0,0062 | 208 ms | 1,71 MB | 0 | 1,0 MB |
| Mobile (cold) | 2 ms | 72 ms | 72 ms | 0 | 215 ms | 1,91 MB | 0 | 1,1 MB |
| Mobile 4G + CPU 4× | 152 ms | 728 ms | **3712 ms** | **0,8009** | 8899 ms | 1,82 MB | 0 | 1,1 MB |

Metas de referência: FCP < 1,8 s, LCP < 2,5 s, CLS < 0,1, long tasks = 0.

**Leitura rápida:** em banda larga o site é muito rápido (FCP/LCP ~0,1–0,2 s, zero long tasks). No mobile lento aparecem dois problemas reais: **LCP em 3,7 s** e **CLS 0,80**.

---

## 2. Por que o LCP piora no 4G

O elemento de maior pintura é a **logo do topo** (`img/cayo_gomes.webp`, 1920×842, **189,2 KB**). No cenário 4G ela termina de baixar em ~3570 ms e o LCP é registrado em 3712 ms — praticamente o download da logo dita o LCP.

Agravo identificado no teste: a mesma imagem era baixada **duas vezes**. O `<link rel="icon" href="img/cayo_gomes.webp">` fazia o navegador buscar o logo inteiro como favicon (segundo request de 189,2 KB, iniciador `other`). Em 4G isso compete diretamente com a logo do hero.

**Corrigido depois do relatório:** o favicon agora é `favicon.svg` (gato vermelho `#ef2b31` sobre preto `#050506`, extraído do `#i-cat`), com **14,7 KB** em vez de 189,2 KB. Validado: SVG renderiza, 7080 pixels vermelhos dentro de `bbox [12,12,199,199]`, sem erros de console. O download duplicado da logo não acontece mais.

---

## 3. Por que o CLS é 0,80 no mobile lento

Linha do tempo (4G + CPU 4×):

```
t=  818ms  shift 0,0013  (links de contato trocando de fonte)
t= 1325ms  shift 0,0006  (link WhatsApp)
t= 1377ms  shift 0,0003  (link de e-mail)
t= 1669ms  shift 0,7999  <-- salto grande
```

No salto de 1669 ms:
- `#panel` passa de **162 px → 626 px** de altura (e de y=171 para y=218);
- `main` é empurrado de y=230 para y=277;
- `div.wrap.home-sec.home-grid`, `#sobre` e `#contato` colapsam para `0×0`.

Causa raiz: o `#panel` existe no HTML, mas fica **vazio até o JavaScript renderizar o conteúdo**. No desktop/web rápido isso leva ~35 ms e ninguém percebe; no 4G leva **1522 ms**. Quando o conteúdo entra de uma vez, todo o conteúdo abaixo salta.

Fator agravante: `.about,.contact{content-visibility:auto;contain-intrinsic-size:1px 500px}` — o `1px` define a largura intrínseca quando a seção sai da tela, fazendo-a colapsar. O padrão correto seria `contain-intrinsic-size:auto 500px` (como já é usado em `.cat-group+.cat-group`).

Os shifts pequenos (0,0013 / 0,0006 / 0,0003) vêm da troca de fontes do Google (`display=swap`) nos links de contato — são insignificantes.

---

## 4. Interações (cliques reais via CDP)

| Ação | Desktop | Mobile | Mobile 4G |
|---|---:|---:|---:|
| `#panel .item` → modal aberto | 2 ms (17 ms wall) | 1 ms (15 ms wall) | 9 ms (62 ms wall) |
| Próxima mídia (`›`) | 135 ms wall* | 136 ms wall* | 134 ms wall* |
| Abrir fullscreen (`.d-fs.click()`) | 18 ms | — | — |
| Fechar modal | OK | OK | OK |

\* inclui 120 ms de espera fixa no instrumento — o custo real é < 20 ms.

Estado após abrir fullscreen: `fsIndices = 10`, modal permanece aberto, navegação e fechamento funcionaram, nenhum erro de console.

---

## 5. Fluidez de rolagem

| Cenário | p50 frame | p95 frame | pior frame | frames > 50 ms | long tasks |
|---|---:|---:|---:|---:|---:|
| Desktop | 16,7 ms | 33,3 ms | 33,4 ms | 0 | 0 |
| Mobile | 16,7 ms | 16,8 ms | 16,8 ms | 0 | 0 |
| Mobile 4G + CPU 4× | 16,7 ms | 16,7 ms | 16,8 ms | 0 | 0 |

Mesmo com CPU 4× a rolagem não travou. Tempos totais no mobile lento (via `Performance.getMetrics`): task 404 ms, script 13 ms, layout 108 ms, style 41 ms — distribuídos, sem long tasks.

---

## 6. Peso de rede

**Primeira carga (9 requisições de imagem ≈ 1,5 MB):**

| Arquivo | KB |
|---|---:|
| `img/projetos/o-piromante/09.webp` | 307,6 |
| `img/projetos/checkpoint-de-corrida-sci-fi/01.webp` | 241,9 |
| `img/projetos/asd/01.webp` | 259,7 |
| `img/projetos/punk-alien-concept-w-i-p/09.webp` | 199,3 |
| `img/Fundo/fundo16.webp` | 190,3 |
| `img/cayo_gomes.webp` (logo) | 189,2 |
| ~~`img/cayo_gomes.webp` (favicon)~~ | ~~189,2~~ → 14,7 (`favicon.svg`) |
| `img/Fundo2/camada1.webp` | 57,1 |
| `img/Fundo/fundo2.webp` | ~57 |

As miniaturas são servidas na resolução original (teto FullHD, ex.: 1920×1080) mas exibidas a ~284×160 no mobile. A biblioteca inteira tem **102 arquivos / 25,9 MB** (101 WebP + 1 PSD); o maior WebP é `o-piromante/05.webp` (587 KB). O modal carrega mídias sob demanda — isso já está correto.

**Compressão (ganho potencial no HTML/JS):**

| Arquivo | Bruto | gzip nível 9 |
|---|---:|---:|
| `index.html` | 118,3 KB | 37,0 KB |
| `conteudo/projetos.js` | 12,8 KB | 3,7 KB |
| `content.js` | 5,7 KB | 2,5 KB |

---

## 7. Pontos fortes

- FCP/LCP ~0,16 s em desktop, ~0,07 s em mobile rápido.
- Zero long tasks em todos os cenários, inclusive com CPU 4×.
- Scroll fluido (p95 ≤ 33 ms).
- JS muito leve: ~1 MB de heap, 270 nós no DOM.
- Fontes do Google carregadas sem bloquear renderização; `preconnect` e `preload` presentes.
- CSS/JS críticos inline (sem request extra de stylesheet).
- Modal com carregamento sob demanda e 8 projetos / 64 mídias sem custo inicial.
- Nenhum erro de console em nenhum cenário.

---

## 8. Recomendações priorizadas

### P0 — corrigir

1. ~~**Favicon próprio, pequeno.**~~ ✅ **Corrigido:** `favicon.svg` com o gato vermelho sobre preto (14,7 KB), sem download duplicado da logo.
2. **Eliminar o CLS do painel.** Reservar altura para `#panel` (skeleton/`min-height` por breakpoint) ou renderizar o painel antes da primeira pintura. Corrigir também `contain-intrinsic-size:1px 500px` → `auto 500px` em `.about,.contact`.

### P1 — ganho grande

3. **Miniaturas redimensionadas.** Gerar versões ~640 px de largura (WebP q75) para a grade. Hoje ~800 KB de miniaturas são baixados para exibir imagens de 284×160 — dá para reduzir para ~150–200 KB.
4. **Lazy loading das miniaturas abaixo da dobra.** `capaHTML` marca as 3 primeiras como `eager`; no mobile elas ficam abaixo do hero. Marcar todas como `loading="lazy"` (ou usar IntersectionObserver).
5. **Logo otimizada.** Servir uma versão ~1200 px (ou AVIF) para o hero, mantendo a original para o favicon — alvo: LCP < 2,5 s no 4G.

### P2 — refinamento

6. **Camadas de fundo.** `fundo16.webp` (190 KB) e `camada*.webp` são decorativas; avaliar versões menores ou AVIF.
7. **Manter o padrão atual** de carregar mídias do modal sob demanda — não mudar.

---

## 9. Dados brutos

- `C:\Users\Sensei\AppData\Local\Temp\opencode\perf-resultados.json` — 4 cenários completos (nav timing, bytes, long tasks, interações).
- `C:\Users\Sensei\AppData\Local\Temp\opencode\perf-deep.json` — fontes de CLS, lista de requests, imagens, scroll.
- Scripts: `perf.js`, `perfdeep.js`, `clstrace.js`, `perf-finalcheck.js`, `fsdiag.js` (mesma pasta).

Limitações: headless Edge sem GPU real, servidor local sem compressão, rede emulada. Os valores são indicativos para comparação interna, não substituem um Lighthouse/ CrUX em produção.
