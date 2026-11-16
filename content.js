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
  { id:"design", name:{pt:"Design Gráfico", en:"Graphic Design"}, short:{pt:"Design",en:"Design"},
    cats:[ {id:"cartazes",   name:{pt:"Cartazes e divulgação", en:"Posters and promo"}},
           {id:"estampas",   name:{pt:"Estampas",              en:"Prints"}},
           {id:"identidade", name:{pt:"Identidade visual",     en:"Visual identity"}} ],
    lead:{pt:"Cartazes, estampas para serigrafia e identidade visual.",
          en:"Posters, screen-print artwork and visual identity."} },
  { id:"3d",     name:{pt:"Modelagem 3D",   en:"3D Art"}, short:{pt:"3D",en:"3D"},
    lead:{pt:"Personagens, criaturas e props com texturas e iluminação trabalhadas.",
          en:"Characters, creatures and props with carefully crafted textures and lighting."} }
];

/* MÍDIA — a lista do que aparece no projeto, na ordem que você quiser.
   Cada item tem um "type":

     image      src: caminho do arquivo  ->  { type:"image", src:"img/projetos/nome/01.webp" }
     video      src: link do YouTube     ->  { type:"video", src:"https://youtu.be/XXXX" }
     sketchfab  src: link do modelo      ->  { type:"sketchfab", src:"https://sketchfab.com/3d-models/nome-ID" }

   A PRIMEIRA da lista é a capa que aparece na grade.
   Para vídeo/Sketchfab, "poster" é opcional: se faltar, o site tenta a
   miniatura do próprio YouTube. */

/* PROJETOS. A ordem desta lista = ordem na tela.
   area: id de uma AREA.  cat: id de uma categoria (opcional).
   h: matiz 0-360 do fundo colorido, usado quando media está vazia.
   tools: softwares exibidos no modal.  title/desc: textos em pt/en.
   media: lista de mídias (ver explicação acima). Vazia = espaço reservado. */
const PROJECTS = [
  { area:"3d", h:20, tools:"Blender · ZBrush · Substance Painter",
    title:{pt:"Caveira com capacete", en:"Skull with helmet"},
    desc:{pt:"Cena com crânio e elmo corroído, focada em materiais envelhecidos, ferrugem e luz quente.",
          en:"Scene with a skull and corroded helmet, focused on aged materials, rust and warm light."},
    media:[] },
  { area:"3d", h:350, tools:"ZBrush",
    title:{pt:"Criatura", en:"Creature bust"},
    desc:{pt:"Busto de criatura realista, com atenção à pele, às presas e à expressão.",
          en:"Realistic creature bust, with attention to skin, fangs and expression."},
    media:[] },
  { area:"3d", h:200, tools:"",
    title:{pt:"Baú do tesouro", en:"Treasure chest"},
    desc:{pt:"Prop estilizado com madeira e metal pintados à mão.",
          en:"Stylized prop with hand-painted wood and metal."},
    media:[] },
  { area:"3d", h:190, tools:"",
    title:{pt:"Mascote", en:"Mascot"},
    desc:{pt:"Personagem cartoon em pose de destaque sobre base.",
          en:"Cartoon character posing on a base."},
    media:[] },
  { area:"3d", h:5, tools:"",
    title:{pt:"Drone hard surface", en:"Hard surface drone"},
    desc:{pt:"Modelagem hard surface com detalhes luminosos.",
          en:"Hard surface model with glowing details."},
    media:[] },

  { area:"design", cat:"cartazes", h:30, tools:"Photoshop",
    title:{pt:"Arraiá Agostino do Xerifes", en:"Xerifes Arraiá poster"},
    desc:{pt:"Cartaz de festa junina com cenário de barraca, madeira, bandeirinhas e comida feitos em composição digital.",
          en:"Festa junina poster built as a digital composite: wooden stall, bunting and food."},
    media:[] },
  { area:"design", cat:"estampas", h:25, tools:"Illustrator",
    title:{pt:"Estampa Xerifes Moto Clube", en:"Xerifes Moto Clube print"},
    desc:{pt:"Estampa para serigrafia no estilo gravura, com caveira de chapéu de xerife e faixas ornamentadas.",
          en:"Engraving-style screen-print artwork with a sheriff-hat skull and ornate banners."},
    media:[] },
  { area:"design", cat:"estampas", h:0, tools:"Illustrator",
    title:{pt:"21ª Moto Romaria", en:"21st Moto Romaria"},
    desc:{pt:"Estampa em preto e branco com mãos em oração, rosas e espinhos.",
          en:"Black and white artwork with praying hands, roses and thorns."},
    media:[] },
  { area:"design", cat:"cartazes", h:10, tools:"Photoshop",
    title:{pt:"Quinta sem Lei", en:"Quinta sem Lei"},
    desc:{pt:"Série de cartazes de shows com tipografia blackletter e tratamento duotone.",
          en:"Gig poster series with blackletter type and a duotone treatment."},
    media:[] },
  { area:"design", cat:"identidade", h:140, tools:"",
    title:{pt:"Identidade Cayo Gomes", en:"Cayo Gomes identity"},
    desc:{pt:"Logotipo glitch, cartão de apresentação digital e sistema visual próprio, com estética de interface e detalhes em vermelho.",
          en:"Glitch logotype, digital presentation card and own visual system, with an interface look and red accents."},
    media:[{ type:"image", src:"img/identidade-cayo.webp" }] }
];

/* SERVIÇOS exibidos na seção Sobre (edite as listas pt/en) */
const SERVICES = {
  pt:["Identidade visual","Logotipos","Social media","Design gráfico","Artes e eventos","Modelagem 3D"],
  en:["Visual identity","Logos","Social media","Graphic design","Event art","3D modeling"]
};

/* TEXTOS DA INTERFACE (pt/en). Edite aqui títulos, frases e botões.
   role: linha do topo; pitch/about_*: Sobre; contact_*: Contato;
   quote: selo de orçamento; close: botão do modal; img: texto do placeholder;
   btn: rótulo do botão de idioma. */
const UI = {
  pt:{ all:"Todos", filters:"Filtrar projetos", role:"ARTISTA DIGITAL / DESIGNER GRÁFICO / MODELADOR 3D",
       pitch:"Ideias ganham forma. Marcas ganham identidade.",
       about_p1:"Sou o Cayo, artista digital de Petrópolis, no Rio de Janeiro. Trabalho com modelagem 3D e design gráfico, e levo o mesmo clima sombrio e artesanal pras duas áreas.",
       about_p2:"Também experimento outras linguagens, então este site cresce com o meu trabalho. Se você tem uma ideia, me conte.",
       contact_h:"Contato", contact_p:"Escreva ou chame no WhatsApp.", quote:"Orçamento sem compromisso",
       close:"FECHAR", img:"IMAGEM DO PROJETO", btn:"EN", lang:"pt-BR" },
  en:{ all:"All", filters:"Filter projects", role:"DIGITAL ARTIST / GRAPHIC DESIGNER / 3D MODELER",
       pitch:"Ideas take shape. Brands gain identity.",
       about_p1:"I’m Cayo, a digital artist from Petrópolis, Rio de Janeiro. I work in 3D modeling and graphic design, and bring the same dark, handcrafted mood to both.",
       about_p2:"I also experiment with other mediums, so this site grows along with my work. If you have an idea, tell me about it.",
       contact_h:"Contact", contact_p:"Send an email or message me on WhatsApp.", quote:"Free quote, no commitment",
       close:"CLOSE", img:"PROJECT IMAGE", btn:"PT", lang:"en" }
};
