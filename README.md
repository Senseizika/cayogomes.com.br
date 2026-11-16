# cayogomes.com.br

Portfólio de Cayo Gomes — artista digital, designer gráfico e modelador 3D.
Petrópolis, RJ.

Site estático: `index.html` (código) + `content.js` (conteúdo) + `img/`.

## Rodar localmente

Abra o `index.html` no navegador. Não precisa de servidor nem de instalação.

## Adicionar um projeto

1. Salve as imagens em `img/projetos/<nome-do-projeto>/01.webp`, `02.webp`…
   Tudo minúsculo, sem espaço e sem acento (espaço vira `%20` na URL).
2. Abra `content.js` e adicione um bloco em `PROJECTS`.
3. Salve e recarregue a página.

O **primeiro projeto de cada área** vira o card grande da grade — a ordem
da lista é a ordem na tela.

### Tipos de mídia

```js
media:[
  { type:"image",     src:"img/projetos/nome/01.webp" },
  { type:"video",     src:"https://youtu.be/XXXXXXXXXXX" },
  { type:"sketchfab", src:"https://sketchfab.com/3d-models/nome-ID" }
]
```

- A **primeira** mídia da lista é a capa na grade.
- Vídeo: a miniatura vem do YouTube sozinha; `poster:"…"` sobrescreve.
- Sketchfab: sem `poster`, aparece o palco com o selo "3D".
- Lista vazia = espaço reservado colorido (`h` define o matiz).

## Git

```bash
git status                        # o que mudou
git add -A                        # marca tudo que mudou
git commit -m "mensagem curta"    # grava uma versão
git push                          # envia as versões pro GitHub
git log --oneline                 # lista as versões
```

Voltar atrás:

```bash
git restore .                     # descarta o que ainda não foi commitado
git revert HEAD                   # desfaz o último commit (cria um novo)
```

Restaurar o projeto em outra máquina (ou depois de perder o HD):

```bash
git clone https://github.com/Senseizika/cayogomes.com.br.git
```

## Ferramentas

- `node tools/paleta.js` — recalcula a cor de destaque de cada fundo em
  `img/Fundo` e grava no bloco `PALETA` do `index.html`.
  (`--dry` só mostra, sem gravar.)
