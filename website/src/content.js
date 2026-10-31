/* Single source of truth for every string on the page, in every language.
   The build renders one static page per language from this file, so a locale
   can never drift out of sync with the markup: a missing key is a build error,
   not a half-translated page in production.

   Anything the client has not supplied yet carries `todo: true`. The build
   prints those sections as a warning on every run, so unfinished copy stays
   visible instead of quietly becoming the final wording. */

/** Kristina has been working in web development since this year. The page
 *  states a duration, so it is derived at build time rather than typed in —
 *  a hardcoded "9 years" silently becomes a lie every January. */
export const CAREER_START_YEAR = 2017;

export const experienceYears = (now = new Date()) =>
  now.getUTCFullYear() - CAREER_START_YEAR;

/** Approved external destinations. Kept in one place so the test that forbids
 *  stray outbound links has a list to check against. */
export const links = {
  linkedin: "https://www.linkedin.com/in/kiaquila",
  telegram: "https://t.me/ks_aquila",
  /* wa.me resolves a phone number only — a handle does not open a chat. */
  whatsapp: "https://wa.me/5491127132101",
  instagram: "https://www.instagram.com/ks_aquila",
  github: "https://github.com/kiaquila",
  email: "ks@ks-design.art",
  work: {
    chaijana: "https://chaijana.ks-design.workers.dev",
    alexNeon: "https://alex-neon.ks-design.workers.dev",
    /* Custom domain configured ahead of the rollout; serves once deployed. */
    ember: "https://ember.ks-design.art/",
    misha: "https://misha.ks-design.workers.dev/",
    dreamboard: "https://dreamboard.ks-design.art/",
    fathom: "https://fathom.ks-design.art/"
  }
};

/* English is the default: it is what `https://ks-design.art/` serves and what
   `hreflang="x-default"` points at. Argentinian Spanish is the second locale,
   on its own prefix. The declaration order is also the order the language
   switch renders in. */
export const languages = {
  en: { locale: "en", ogLocale: "en_US", label: "EN", path: "/" },
  es: { locale: "es-AR", ogLocale: "es_AR", label: "ES", path: "/es/" }
};

/** Locales whose copy is a translation the owner has not signed off on yet.
 *  The build names them on every run, the way unfinished sections are named,
 *  so a draft translation cannot quietly become the published wording. The
 *  owner approved the original Spanish copy on 2026-08-17, the ember and misha
 *  work cards on 2026-08-19, the hero annotations (`hero.notes`) on
 *  2026-08-28, and the Dream Board and Fathom cards with the reworded hero
 *  bullets on 2026-09-11. The owner approved the expanded service package
 *  translations on 2026-09-11 as well, and the contact line with the
 *  Portfolio nav label on 2026-09-17. The Spanish SEO and audience copy added
 *  on 2026-10-19 still awaits review. The owner approved the English and
 *  Spanish FAQ translations and their layout on 2026-10-23. */
export const localesAwaitingReview = ["es"];

/** One social card per language — sharing a page with a card that carries
 *  another language's headline is a mixed-language preview. Rendered by
 *  `scripts/make-og.mjs`, copied by the build, referenced by the renderer;
 *  named here so those three cannot disagree. */
export const ogImages = { en: "og-en.png", es: "og-es.png" };

export const faqTopics = {
  clients: ["person"],
  "website-price": ["service-landing", "service-website"],
  timeline: ["service-landing", "service-website"],
  content: ["service-landing"],
  "ai-design": ["person"],
  revisions: ["service-landing", "service-website"],
  editing: ["service-landing", "service-website"],
  seo: ["service-landing", "service-website"],
  "art-examples": ["work-ember", "work-fathom"],
  "art-commission": ["person"]
};

export const identity = {
  name: "Kristina Aquila",
  brand: "ks-design",
  locality: "Buenos Aires",
  country: "AR",
  launched: "2026-08",
  knownLanguages: ["en"],
  serviceLanguages: ["en", "es"]
};

export const content = {
  en: {
    meta: {
      title: "Small business website design — ks-design, Kristina Aquila",
      jobTitle: "Web designer",
      description:
        "Small business website design: landing pages and one-page websites for coffee shops, salons, therapists and consultants. Non-generic AI design from Buenos Aires.",
      ogTitle: "I'll design something that pulls people in",
      ogDescription:
        "Web design for landing pages and websites. A concept, two rounds of edits, a finished site."
    },
    about: {
      audience: "Small businesses and solo entrepreneurs",
      audienceExamples:
        "pastry shops, coffee shops and beauty salons; consultants, therapists and tutors",
      areaServed: [
        "Argentina",
        "English-speaking countries, excluding those with heavy legal requirements"
      ],
      workLanguages: "English; Spanish for Latin America with translation support",
      background: `In web development since ${CAREER_START_YEAR}: a technical writer at a large e-commerce company, then QA and JavaScript test automation. Now designs websites with AI.`,
      method:
        "Non-generic AI design: raw AI output is never shipped. Every design is built from references and her own creative direction, so it does not read as made by a neural network.",
      webArt:
        "Web art is a main direction: interactive studies that also work as animation, screensavers or exhibition pieces.",
      topics: [
        "Small business website design",
        "One-page website design",
        "Landing page design",
        "AI web design",
        "Web art"
      ]
    },
    nav: {
      label: "Page sections",
      /* The key stays `work` — it is the slide's id. The label reads Portfolio
         in both languages (client decision, 2026-09-17). */
      work: "Portfolio",
      process: "Process",
      services: "Services",
      faq: "FAQ",
      contact: "Contact"
    },
    langSwitch: { label: "Language", en: "EN", es: "ES" },
    skipLink: "Skip to content",
    hero: {
      title: "I'll design something that pulls people in",
      subtitle: "The kind of work people remember — and come back to",
      primary: "Start a project",
      secondary: "See the work",
      portraitAlt: "Kristina Aquila, portrait",
      /* Hand-written annotations that appear over the portrait on hover, in
         place of the retired stats panel (client decision, 2026-08-28). A
         claim is one line; `items` are plain bullets beneath it. The notes
         carry no links (client decision, 2026-09-11): they fold away as the
         pointer leaves the print, so a link out there could not be reached. */
      notes: [
        { text: "%YEARS%+ years in web development" },
        { text: "I do non-generic AI web design" },
        { text: "AI expert" },
        { text: "I value aesthetics & authenticity" }
      ]
    },
    work: {
      id: "work",
      title: "Selected projects",
      previous: "Previous projects",
      next: "Next projects",
      visit: "Open the site",
      items: [
        {
          slug: "chaijana",
          name: "Chaijaná Noir",
          kind: "Restaurant · site and menu",
          year: "2026",
          summary:
            "A dark, warm treatment for a Buenos Aires chaikhana: website, a menu in three languages, and dish photo retouching.",
          href: links.work.chaijana,
          image: "chaijana",
          alt: "Chaijaná Noir website home page"
        },
        {
          slug: "alex-neon",
          name: "Alex Neon",
          kind: "Landing page",
          year: "2026",
          summary:
            "A redesign of the «ИИ по делу» landing: dark theme, a single neon accent, and a live neural canvas.",
          href: links.work.alexNeon,
          image: "alex-neon",
          alt: "Alex Neon landing page, first screen"
        },
        {
          slug: "ember",
          name: "Ember",
          kind: "Web art · interactive",
          year: "2026",
          summary:
            "An interactive canvas study: a wireframe figure smolders under the cursor, burns down and reassembles to a synthesized tuning-fork tone.",
          href: links.work.ember,
          image: "ember",
          alt: "Ember study — a dark wireframe figure with golden embers"
        },
        {
          slug: "misha",
          name: "Mikhail Orlov",
          kind: "CV portfolio · one-pager",
          year: "2026",
          summary:
            "An original one-page CV portfolio for a senior backend developer and development lead — one calm scrolling sheet in English.",
          href: links.work.misha,
          image: "misha",
          alt: "Mikhail Orlov one-page CV portfolio, first screen"
        },
        {
          slug: "dreamboard",
          name: "Dream Board",
          kind: "Lab study · browser tool",
          year: "2026",
          summary:
            "A free browser tool for arranging uploaded images and text into a personal vision board, then downloading the finished composition as a PNG.",
          href: links.work.dreamboard,
          image: "dreamboard",
          alt: "Dream Board landing page with a halftone world map"
        },
        {
          slug: "fathom",
          name: "Fathom",
          kind: "Web art · interactive",
          year: "2026",
          summary:
            "An interactive school of shimmering goldfish drifting through painted water that changes with the visitor's local time of day.",
          href: links.work.fathom,
          image: "fathom",
          alt: "Fathom study with shimmering goldfish in pale blue water"
        }
      ]
    },
    process: {
      id: "process",
      title: "How the work goes",
      steps: [
        {
          n: "01",
          title: "We find the meaning",
          body:
            "We carefully gather and sharpen your meaning together — everything you consider important and want the landing page or site to say."
        },
        { n: "02", title: "A design concept", body: "I design a concept for you." },
        {
          n: "03",
          title: "Two rounds of edits",
          body:
            "We go through two rounds of edits. Each round is based on one consolidated list of comments within the approved concept."
        },
        { n: "04", title: "The finished site", body: "You get the finished site." }
      ]
    },
    services: {
      id: "services",
      title: "Services",
      currencyNote: "Prices are in US dollars.",
      hostingNote:
        "* Domain registration, paid fonts and images, plugins, and subscriptions are paid separately. Hosting can be arranged for an additional fee.",
      items: [
        {
          id: "landing",
          name: "Landing page",
          price: "USD 1,000",
          note: "A single-page site for a small business or a solo practice, done end to end.",
          features: [
            "Up to 8 sections on one page",
            "Structure and light editing of your copy",
            "One custom design, built for desktop, tablet, and mobile",
            "Two rounds of edits",
            "Testing, launch, and full source code in your preferred format"
          ]
        },
        {
          id: "website",
          name: "Website, 5+ pages",
          price: "from USD 3,000",
          note: "A multi-page site with one consistent structure.",
          features: [
            "Sitemap and content structure",
            "5 core pages with one consistent design",
            "Responsive build with reusable components",
            "One standard form and two rounds of edits",
            "Testing, launch, and full source code in your preferred format"
          ]
        },
        {
          id: "illustrations",
          name: "Illustrations",
          price: "from USD 75",
          note: "Illustration work, priced per image.",
          features: [
            "One original illustration based on your brief",
            "Reference selection to agree on the visual direction",
            "Final artwork in the agreed style and level of detail",
            "Ready-to-use files in agreed formats"
          ]
        }
      ]
    },
    faq: {
      "id": "faq",
      "title": "Frequently asked questions",
      "items": [
        {
          "id": "clients",
          "question": "Who do you design websites and landing pages for?",
          "answer": "I design websites for small businesses and independent professionals: coffee shops, bakeries, salons, therapists, consultants and tutors. A landing page works well for one offer; a multi-page website gives several services their own space. Based in Buenos Aires, I work remotely with clients in Argentina and English-speaking countries. I communicate in English, and in Spanish with translation support."
        },
        {
          "id": "website-price",
          "question": "How much does a landing page or a multi-page website cost?",
          "answer": "A landing page with up to eight sections costs USD 1,000, including structure, light editing of your copy, custom design and development for desktop, tablet and mobile. A five-page website starts at USD 3,000 and includes a sitemap, content structure, responsive design and development, and one standard form. Both packages include two rounds of revisions, testing, launch and source code. Domain, hosting, paid assets, plugins and subscriptions are separate."
        },
        {
          "id": "timeline",
          "question": "How long does it take to build a website?",
          "answer": "A landing page takes 2–3 weeks; a five-page website takes 4–6 weeks from kickoff to launch, with your text and images ready. We agree on your project’s timeline based on its scope and features."
        },
        {
          "id": "content",
          "question": "What do I need to prepare? Can you help with the copy?",
          "answer": "Gather a description of your business and services, contact details, copy, photos and any brand materials you have. Website references with a few words about what you like are helpful too. The landing page package includes structure and light editing of your copy; writing it from scratch is not included."
        },
        {
          "id": "ai-design",
          "question": "Do you use AI to design websites?",
          "answer": "Yes. I use AI as a tool, working from references and my own visual concept. I rework the suggested designs and refine both design and code into a finished website. The aim is to express the character of your project."
        },
        {
          "id": "revisions",
          "question": "What if I don’t like the concept? How many revisions are included?",
          "answer": "We first discuss what didn’t work for you. One alternative concept is included at no extra cost. The price covers two rounds of revisions within the agreed concept; for each round, you collect your feedback in one list. Extra revisions cost USD 50 per hour. We agree on the scope, time and cost before I start."
        },
        {
          "id": "editing",
          "question": "How do I update my website after launch?",
          "answer": "For now, I handle updates myself and don’t offer a CMS or editing dashboard. Changes to text, photos, prices and other content cost USD 50 per hour. We agree on the scope and cost in advance."
        },
        {
          "id": "seo",
          "question": "Is SEO included in the website?",
          "answer": "Basic search preparation is included: page titles and meta descriptions, a clear heading structure, image descriptions, a sitemap and checks that search engines can access the site. I also check the mobile version and optimize loading. I don’t currently offer ongoing SEO services or guarantee specific search rankings."
        },
        {
          "id": "art-examples",
          "references": [{ "label": "Ember", "href": links.work.ember }, { "label": "Fathom", "href": links.work.fathom }],
          "question": "What is web art, and where can I see your work?",
          "answer": "Web art is artwork that runs in a browser: a moving scene, a visual experiment or an interactive composition. In Ember, a wireframe figure burns under your cursor and rebuilds itself. In Fathom, golden fish swim through water that changes with the viewer’s local time. Web art can be created for browsers, animation, screensavers and exhibition projects."
        },
        {
          "id": "art-commission",
          "question": "Can I commission web art? How much does it cost?",
          "answer": "Yes, I accept web art commissions. Each project is quoted individually, depending on the idea, visual complexity, interaction and display format. We agree on delivery format and usage rights separately for each project. To start, send me your idea and visual references."
        }
      ]
    },
    kindWords: {
      id: "kind-words",
      title: "Kind Words",
      todo: true,
      todoNote: "Placeholder: replace with real client quotes before publishing.",
      items: [
        {
          quote: "TODO: real client quote.",
          name: "Alex Oxitocin",
          role: "Alex Neon · «ИИ по делу» landing",
          avatar: "alex-oxitocin",
          avatarAlt: "Alex Oxitocin's avatar",
          initials: null
        },
        {
          quote: "TODO: real client quote.",
          name: "TODO: name",
          role: "TODO: role, company",
          avatar: null,
          initials: "—"
        },
        {
          quote: "TODO: real client quote.",
          name: "TODO: name",
          role: "TODO: role, company",
          avatar: null,
          initials: "—"
        }
      ]
    },
    contact: {
      id: "contact",
      /* Written out letter by letter over the band, in the hand font — so it
         has to stay inside the Caveat subset: a straight apostrophe, not a
         typographic one. The owner approved the Spanish line on 2026-09-17. */
      line: "Let's make your brand impossible to forget.",
      band: { title: "Get in touch" },
      location: "Buenos Aires, Argentina (GMT-3)",
      social: {
        linkedin: "LinkedIn",
        telegram: "Telegram",
        whatsapp: "WhatsApp",
        instagram: "Instagram",
        github: "GitHub"
      }
    },
    footer: { copyright: "© Kristina Aquila" },
    notFound: {
      title: "Page not found",
      body: "There is no such page here. Head back to the home page.",
      cta: "Home"
    }
  },

  es: {
    meta: {
      title: "Diseño web para emprendedores — ks-design, Kristina Aquila",
      jobTitle: "Diseñadora web",
      description:
        "Diseño web para emprendedores y pequeños negocios: landings y sitios de una página para cafeterías, salones, psicólogos y consultores. Diseño con IA, nada genérico.",
      ogTitle: "Te hago un diseño que atrapa",
      ogDescription:
        "Diseño web para landings y sitios. Un concepto, dos rondas de cambios, un sitio terminado."
    },
    about: {
      audience: "Pequeños negocios y emprendedores",
      audienceExamples:
        "pastelerías, cafeterías y salones de belleza; consultores, psicólogos y profesores particulares",
      areaServed: [
        "Argentina",
        "Países de habla inglesa, excepto aquellos con requisitos legales exigentes"
      ],
      workLanguages: "Inglés; español para Latinoamérica con apoyo de traducción",
      background: `En desarrollo web desde ${CAREER_START_YEAR}: redactora técnica en una gran empresa de e-commerce, después QA y automatización de pruebas en JavaScript. Hoy diseña sitios web con IA.`,
      method:
        "Diseño con IA, nada genérico: nunca publica lo que la IA da en crudo. Cada diseño parte de referencias y de su propia dirección creativa, para que no parezca hecho por una red neuronal.",
      webArt:
        "El arte web es una de sus líneas principales: estudios interactivos que también sirven como animación, salvapantallas o pieza de exposición.",
      topics: [
        "Diseño web para emprendedores",
        "Diseño de páginas web para pequeños negocios",
        "Diseño de landings",
        "Diseño web con IA",
        "Arte web"
      ]
    },
    nav: {
      label: "Secciones de la página",
      work: "Portfolio",
      process: "Proceso",
      services: "Servicios",
      faq: "FAQ",
      contact: "Contacto"
    },
    langSwitch: { label: "Idioma", en: "EN", es: "ES" },
    skipLink: "Ir al contenido",
    hero: {
      title: "Te hago un diseño que atrapa",
      subtitle: "Del tipo que la gente recuerda y al que vuelve",
      primary: "Hablemos del proyecto",
      secondary: "Ver los trabajos",
      portraitAlt: "Kristina Aquila, retrato",
      notes: [
        { text: "%YEARS%+ años en desarrollo web" },
        { text: "hago diseño web con IA, nada genérico" },
        { text: "experta en IA" },
        { text: "valoro la estética y la autenticidad" }
      ]
    },
    work: {
      id: "work",
      title: "Proyectos seleccionados",
      previous: "Proyectos anteriores",
      next: "Proyectos siguientes",
      visit: "Abrir el sitio",
      items: [
        {
          slug: "chaijana",
          name: "Chaijaná Noir",
          kind: "Restaurante · sitio y menú",
          year: "2026",
          summary:
            "Una puesta oscura y cálida para una chaijaná de Buenos Aires: sitio web, menú en tres idiomas y retoque de las fotos de los platos.",
          href: links.work.chaijana,
          image: "chaijana",
          alt: "Página principal del sitio de Chaijaná Noir"
        },
        {
          slug: "alex-neon",
          name: "Alex Neon",
          kind: "Landing",
          year: "2026",
          summary:
            "Rediseño de la landing «ИИ по делу»: tema oscuro, un solo acento neón y un canvas neuronal en vivo.",
          href: links.work.alexNeon,
          image: "alex-neon",
          alt: "Primera pantalla de la landing de Alex Neon"
        },
        {
          slug: "ember",
          name: "Ember",
          kind: "Arte web · interactivo",
          year: "2026",
          summary:
            "Un estudio interactivo en canvas: una figura de alambre arde bajo el cursor, se consume y se rearma al tono de un diapasón sintetizado.",
          href: links.work.ember,
          image: "ember",
          alt: "Estudio Ember: una figura de alambre oscura con brasas doradas"
        },
        {
          slug: "misha",
          name: "Mikhail Orlov",
          kind: "Portfolio CV · una página",
          year: "2026",
          summary:
            "Un portfolio-CV original de una sola página para un desarrollador backend senior y líder de desarrollo: una hoja serena en inglés.",
          href: links.work.misha,
          image: "misha",
          alt: "Primera pantalla del portfolio CV de una página de Mikhail Orlov"
        },
        {
          slug: "dreamboard",
          name: "Dream Board",
          kind: "Estudio de laboratorio · herramienta web",
          year: "2026",
          summary:
            "Una herramienta gratuita en el navegador para armar un vision board con imágenes propias y texto, y descargar el resultado en PNG.",
          href: links.work.dreamboard,
          image: "dreamboard",
          alt: "Landing de Dream Board con un mapamundi tramado"
        },
        {
          slug: "fathom",
          name: "Fathom",
          kind: "Arte web · interactivo",
          year: "2026",
          summary:
            "Un cardumen interactivo de peces dorados brillantes que deriva por agua pintada y cambia según la hora local de quien lo visita.",
          href: links.work.fathom,
          image: "fathom",
          alt: "Estudio Fathom con peces dorados brillantes en agua celeste"
        }
      ]
    },
    process: {
      id: "process",
      title: "Cómo es el proceso",
      steps: [
        {
          n: "01",
          title: "Encontramos el sentido",
          body:
            "Juntamos y afinamos el sentido con vos — todo lo que te parece importante y querés que la landing o el sitio digan."
        },
        { n: "02", title: "Un concepto de diseño", body: "Diseño un concepto para vos." },
        {
          n: "03",
          title: "Dos rondas de cambios",
          body:
            "Pasamos dos rondas de cambios. Cada ronda parte de una única lista consolidada de comentarios dentro del concepto aprobado."
        },
        { n: "04", title: "El sitio terminado", body: "Recibís el sitio terminado." }
      ]
    },
    services: {
      id: "services",
      title: "Servicios",
      currencyNote: "Los precios están en dólares estadounidenses.",
      hostingNote:
        "* El registro del dominio, las tipografías e imágenes pagas, los plugins y las suscripciones se pagan por separado. Podemos acordar el hosting por un costo adicional.",
      items: [
        {
          id: "landing",
          name: "Landing",
          price: "USD 1.000",
          note: "Un sitio de una página para un pequeño negocio o un emprendimiento, de punta a punta.",
          features: [
            "Hasta 8 secciones en una sola página",
            "Estructura y edición ligera de tus textos",
            "Un diseño a medida para computadora, tablet y celular",
            "Dos rondas de cambios",
            "Pruebas, publicación y todo el código fuente en el formato que prefieras"
          ]
        },
        {
          id: "website",
          name: "Sitio de 5+ páginas",
          price: "desde USD 3.000",
          note: "Un sitio de varias páginas con una estructura consistente.",
          features: [
            "Mapa del sitio y estructura de contenidos",
            "5 páginas principales con un diseño consistente",
            "Desarrollo responsive con componentes reutilizables",
            "Un formulario estándar y dos rondas de cambios",
            "Pruebas, publicación y todo el código fuente en el formato que prefieras"
          ]
        },
        {
          id: "illustrations",
          name: "Ilustraciones",
          price: "desde USD 75",
          note: "Creación de ilustraciones, precio por imagen.",
          features: [
            "Una ilustración original a partir de tu brief",
            "Selección de referencias para acordar la dirección visual",
            "Arte final con el estilo y nivel de detalle acordados",
            "Archivos listos para usar en los formatos acordados"
          ]
        }
      ]
    },
    faq: {
      "id": "faq",
      "title": "Preguntas frecuentes",
      "items": [
        {
          "id": "clients",
          "question": "¿Para quiénes diseñás sitios web y landing pages?",
          "answer": "Diseño sitios para pequeños negocios y profesionales independientes: cafeterías, pastelerías, salones de belleza, psicólogos, consultores y profesores particulares. Una landing sirve para presentar una propuesta; un sitio de varias páginas permite separar distintos servicios. Estoy en Buenos Aires y trabajo a distancia con clientes de Argentina y países de habla inglesa. Me comunico en inglés y, en español, con ayuda de traducción."
        },
        {
          "id": "website-price",
          "question": "¿Cuánto cuesta una landing o un sitio de varias páginas?",
          "answer": "Una landing de hasta ocho secciones cuesta USD 1.000 e incluye estructura, edición ligera de tus textos, diseño a medida y desarrollo para computadora, tablet y celular. Un sitio de cinco páginas cuesta desde USD 3.000 e incluye mapa del sitio, estructura de contenidos, diseño adaptable, desarrollo y un formulario estándar. Ambos paquetes incluyen dos rondas de cambios, pruebas, publicación y código fuente. El dominio, hosting, recursos pagos, plugins y suscripciones se pagan aparte."
        },
        {
          "id": "timeline",
          "question": "¿Cuánto tiempo lleva crear un sitio web?",
          "answer": "Una landing lleva de 2 a 3 semanas; un sitio de cinco páginas, de 4 a 6 semanas desde el inicio hasta la publicación, con los textos e imágenes listos. Acordamos el plazo de tu proyecto según el alcance y las funciones que necesite."
        },
        {
          "id": "content",
          "question": "¿Qué tengo que preparar? ¿Me ayudás con los textos?",
          "answer": "Reuní una descripción de tu negocio y servicios, datos de contacto, textos, fotos y los materiales de marca que tengas. También sirven ejemplos de sitios con una explicación de qué te gusta de cada uno. El paquete de landing incluye estructura y edición ligera de tus textos; no incluye escribirlos desde cero."
        },
        {
          "id": "ai-design",
          "question": "¿Usás inteligencia artificial para diseñar sitios web?",
          "answer": "Sí. Uso IA como herramienta, a partir de referencias y una propuesta visual propia. Reelaboro las soluciones que genera y ajusto el diseño y el código hasta llegar al sitio terminado. Busco que el resultado refleje el carácter de tu proyecto."
        },
        {
          "id": "revisions",
          "question": "¿Qué pasa si no me gusta el concepto? ¿Cuántos cambios incluye?",
          "answer": "Primero conversamos sobre qué no te convenció. Una propuesta de concepto alternativo está incluida sin costo adicional. El precio cubre dos rondas de cambios sobre el concepto acordado; en cada ronda, reunís tus comentarios en una sola lista. Los cambios adicionales cuestan USD 50 por hora. Antes de empezar, acordamos el alcance, el tiempo y el costo."
        },
        {
          "id": "editing",
          "question": "¿Cómo actualizo mi sitio después de publicarlo?",
          "answer": "Por ahora, las actualizaciones las hago yo; no ofrezco un panel para que edites el sitio por tu cuenta. Los cambios de textos, fotos, precios y otros contenidos cuestan USD 50 por hora. Acordamos el alcance y el costo de antemano."
        },
        {
          "id": "seo",
          "question": "¿El sitio incluye SEO?",
          "answer": "Incluye la preparación básica para buscadores: títulos y descripciones de las páginas, una estructura clara de encabezados, descripciones de imágenes, mapa del sitio y revisión del acceso para los robots de búsqueda. También reviso la versión para celular y optimizo la carga. Por ahora no ofrezco posicionamiento SEO como servicio continuo ni garantizo posiciones específicas en los resultados."
        },
        {
          "id": "art-examples",
          "references": [{ "label": "Ember", "href": links.work.ember }, { "label": "Fathom", "href": links.work.fathom }],
          "question": "¿Qué es el arte web y dónde puedo ver tus trabajos?",
          "answer": "El arte web es una obra que funciona en el navegador: una escena en movimiento, un experimento visual o una composición interactiva. En Ember, una figura de alambre se quema bajo el cursor y vuelve a formarse. En Fathom, peces dorados nadan en agua que cambia según la hora local de quien la mira. Se pueden crear obras para navegadores, animaciones, protectores de pantalla y proyectos de exhibición."
        },
        {
          "id": "art-commission",
          "question": "¿Puedo encargarte una obra de arte web? ¿Cuánto cuesta?",
          "answer": "Sí, acepto encargos de arte web. Cotizo cada proyecto de forma individual, según la idea, la complejidad visual, la interacción y el formato de exhibición. El formato de entrega y los derechos de uso se acuerdan por separado para cada proyecto. Para empezar, mandame tu idea y referencias visuales."
        }
      ]
    },
    kindWords: {
      id: "kind-words",
      title: "Kind Words",
      todo: true,
      todoNote:
        "Marcador de posición: reemplazar por reseñas reales antes de publicar.",
      items: [
        {
          quote: "TODO: reseña real de un cliente.",
          name: "Alex Oxitocin",
          role: "Alex Neon · landing «ИИ по делу»",
          avatar: "alex-oxitocin",
          avatarAlt: "Avatar de Alex Oxitocin",
          initials: null
        },
        {
          quote: "TODO: reseña real de un cliente.",
          name: "TODO: nombre",
          role: "TODO: rol, empresa",
          avatar: null,
          initials: "—"
        },
        {
          quote: "TODO: reseña real de un cliente.",
          name: "TODO: nombre",
          role: "TODO: rol, empresa",
          avatar: null,
          initials: "—"
        }
      ]
    },
    contact: {
      id: "contact",
      line: "Hagamos que tu marca sea imposible de olvidar.",
      band: { title: "Get in touch" },
      location: "Buenos Aires, Argentina (GMT-3)",
      social: {
        linkedin: "LinkedIn",
        telegram: "Telegram",
        whatsapp: "WhatsApp",
        instagram: "Instagram",
        github: "GitHub"
      }
    },
    footer: { copyright: "© Kristina Aquila" },
    notFound: {
      title: "Página no encontrada",
      body: "Acá no hay ninguna página así. Volvé al inicio.",
      cta: "Inicio"
    }
  }
};
