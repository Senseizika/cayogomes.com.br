/* ============================================================
   CONTEÚDO DO SITE — é aqui que você edita no dia a dia.
   O index.html tem só o código.
   (FUNDOS e PALETA continuam no index.html porque tools/paleta.js
   lê e grava dentro dele.)

   1. Área nova: adicione um item em AREAS. A aba aparece sozinha.
      A ordem desta lista é a ordem das abas (a primeira abre por padrão).
   2. Projeto novo: adicione um item em PROJECTS com a área (area),
      os textos em pt/en e a lista de mídias (media).
   3. Textos da interface (títulos, sobre, contato, botões): objeto UI.
   4. Serviços da seção Sobre: objeto SERVICES.
   ============================================================ */

/* ABAS/ÁREAS do site. A ordem desta lista = ordem das abas.
   id: usado em PROJECTS.area e na URL (#design).
   cats: filtros da área (o id precisa bater com PROJECTS.cat).
   name/short/lead: textos em pt/en. */
const AREAS = [
  {
    "id": "design",
    "name": {
      "pt": "Design Gráfico",
      "en": "Graphic Design"
    },
    "short": {
      "pt": "Design",
      "en": "Design"
    },
    "cats": [],
    "lead": {
      "pt": "Arte feita por um humano, nada é artificial.\nCartazes, panfletos, estampas para serigrafia e posts para redes sociais, com identidade visual do físico ao digital.",
      "en": "Art made by a human, never a machine.\nPosters, flyers, screen prints, social posts, and visual identity, from the page to the screen."
    }
  },
  {
    "id": "3d",
    "name": {
      "pt": "Arte 3D",
      "en": "3D Art"
    },
    "short": {
      "pt": "3D",
      "en": "3D"
    },
    "cats": [
      {
        "id": "cat-1794926813556",
        "name": {
          "pt": "Arte",
          "en": "Art"
        }
      }
    ],
    "lead": {
      "pt": "Arte 3D feita por um artista, seja estilizada ou realista.\nPersonagens, criaturas e props esculpidos à mão, prontos para jogos ou para impressão.",
      "en": "3D art made by an artist, whether stylized or realist.\nCharacters, creatures, and props sculpted by hand, ready for games or print on demand."
    }
  },
  {
    "id": "c",
    "name": {
      "pt": "Casa da Morte",
      "en": "House of death"
    },
    "short": {
      "pt": "CASA",
      "en": "CASA"
    },
    "cats": [
      {
        "id": "cat-1794922461329",
        "name": {
          "pt": " Design de fases",
          "en": "Level design"
        }
      }
    ],
    "lead": {
      "pt": "Teste 👈(ﾟヮﾟ👈)",
      "en": "test ᓚᘏᗢ"
    }
  }
];

/* PROJETOS E MÍDIAS: ficam em conteudo/projetos.json e são editados pelo
   painel (node tools/painel.js). O arquivo conteudo/projetos.js é gerado
   automaticamente a partir dele — não edite nenhum dos dois à mão. */

/* SERVIÇOS exibidos na seção Sobre (edite as listas pt/en) */
const SERVICES = {
  pt:["Identidade visual","Logotipos","Social media","Design gráfico","Artes e eventos","Modelagem 3D"],
  en:["Visual identity","Logos","Social media","Graphic design","Event art","3D modeling"]
};

/* TEXTOS DA INTERFACE (pt/en). Edite aqui títulos, frases e botões.
   role: linha do topo; pitch/about_*: Sobre; contact_*: Contato;
   quote: selo de orçamento; close: botão do modal; img: texto do placeholder;
   btn: rótulo do botão de idioma;
   prev/next/play/model3d/media/media_error: galeria do projeto aberto. */
const UI = {
  pt:{ all:"Todos", filters:"Filtrar projetos", role:"ARTISTA DIGITAL / DESIGNER GRÁFICO / MODELADOR 3D",
       pitch:"Ideias ganham forma. Marcas ganham identidade.",
       about_p1:"Sou o Cayo, artista digital de Petrópolis, no Rio de Janeiro. Trabalho com modelagem 3D e design gráfico, e levo o mesmo clima sombrio e artesanal pras duas áreas.",
       about_p2:"Também experimento outras linguagens, então este site cresce com o meu trabalho. Se você tem uma ideia, me conte.",
       contact_h:"Contato", contact_p:"Escreva ou chame no WhatsApp.", quote:"Orçamento sem compromisso",
       close:"FECHAR", img:"IMAGEM DO PROJETO", btn:"EN", lang:"pt-BR",
       prev:"Mídia anterior", next:"Próxima mídia", play:"Reproduzir", model3d:"Ver modelo 3D",
       media:"Mídia", media_error:"Mídia indisponível",
       empty:"Nenhum projeto publicado ainda." },
  en:{ all:"All", filters:"Filter projects", role:"DIGITAL ARTIST / GRAPHIC DESIGNER / 3D MODELER",
       pitch:"Ideas take shape. Brands gain identity.",
       about_p1:"I’m Cayo, a digital artist from Petrópolis, Rio de Janeiro. I work in 3D modeling and graphic design, and bring the same dark, handcrafted mood to both.",
       about_p2:"I also experiment with other mediums, so this site grows along with my work. If you have an idea, tell me about it.",
       contact_h:"Contact", contact_p:"Send an email or message me on WhatsApp.", quote:"Free quote, no commitment",
       close:"CLOSE", img:"PROJECT IMAGE", btn:"PT", lang:"en",
       prev:"Previous media", next:"Next media", play:"Play", model3d:"View 3D model",
       media:"Media", media_error:"Media unavailable",
       empty:"No projects published yet." }
};
