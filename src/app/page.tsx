import Link from "next/link";
import "./home.css";

const steps = [
  { number: "01", title: "Planeje", detail: "Defina a área, o tipo de missão e a cobertura do voo.", href: "/waypoints" },
  { number: "02", title: "Organize", detail: "Reúna projetos, imagens e dados do levantamento.", href: "/painel" },
  { number: "03", title: "Processe", detail: "Acompanhe o processamento e os produtos gerados.", href: "/processamento" },
  { number: "04", title: "Consulte", detail: "Acesse mapas e resultados para análise e entrega.", href: "/processamento/resultados" },
];

const tools = [
  { label: "01 / PLANEJAMENTO", title: "Voo e Grid", detail: "Desenhe missões em grid, corredor ou órbita e estime a cobertura antes de ir a campo.", href: "/waypoints", action: "Abrir planejamento" },
  { label: "02 / PRECISÃO", title: "Calculadora GSD", detail: "Relacione câmera, altitude e resolução para planejar a captura com mais clareza.", href: "/gsd", action: "Calcular GSD" },
  { label: "03 / OPERAÇÃO", title: "Levantamentos", detail: "Mantenha projetos e imagens de campo organizados em uma única área de trabalho.", href: "/painel", action: "Ver projetos" },
  { label: "04 / RESULTADOS", title: "Processamento", detail: "Acompanhe a fila, consulte produtos e encontre os arquivos técnicos do projeto.", href: "/processamento", action: "Ver produtos" },
];

export default function Home() {
  return <main className="orion-home">
    <section className="orion-home-hero" aria-labelledby="home-title">
      <div className="orion-home-hero-image" aria-hidden="true" />
      <div className="orion-home-hero-inner">
        <div className="orion-home-hero-copy">
          <p className="orion-home-eyebrow"><span aria-hidden="true" /> ORION MAPS / LEVANTAMENTO AÉREO</p>
          <h1 id="home-title">Do planejamento<br />ao <em>mapa pronto.</em></h1>
          <p className="orion-home-lead">Um espaço para planejar voos, organizar levantamentos e acompanhar os resultados do mapeamento com drone.</p>
          <div className="orion-home-actions">
            <Link className="orion-home-button orion-home-button-primary" href="/painel">Abrir área de trabalho <span aria-hidden="true">↗</span></Link>
            <Link className="orion-home-button orion-home-button-outline" href="/waypoints">Planejar um voo <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <div className="orion-home-hero-caption"><span className="orion-home-caption-line" /><span>PLANEJAMENTO DE VOO<br />LEVANTAMENTO · PROCESSAMENTO · RESULTADOS</span><span className="orion-home-caption-index">01 / 04</span></div>
      </div>
    </section>

    <section className="orion-home-process" aria-labelledby="process-title">
      <div className="orion-home-container">
        <div className="orion-home-section-top"><p className="orion-home-kicker">O FLUXO COMPLETO</p><span>DA MISSÃO AO PRODUTO FINAL</span></div>
        <div className="orion-home-process-heading"><h2 id="process-title">Cada etapa no seu lugar.</h2><p>Uma jornada organizada para transformar imagens capturadas em informação útil para o projeto.</p></div>
        <div className="orion-home-steps">{steps.map(step => <Link href={step.href} className="orion-home-step" key={step.number}><span className="orion-home-step-number">{step.number}</span><span className="orion-home-step-arrow" aria-hidden="true">↗</span><strong>{step.title}</strong><span className="orion-home-step-detail">{step.detail}</span></Link>)}</div>
      </div>
    </section>

    <section className="orion-home-tools" aria-labelledby="tools-title">
      <div className="orion-home-container">
        <div className="orion-home-section-top"><p className="orion-home-kicker">ÁREA DE TRABALHO</p><span>FERRAMENTAS ORION MAPS</span></div>
        <div className="orion-home-tools-heading"><h2 id="tools-title">Ferramentas para cada decisão.</h2><p>Entre pela etapa que você precisa agora. O restante do fluxo continua conectado no mesmo ambiente.</p></div>
        <div className="orion-home-tool-grid">{tools.map((tool, index) => <Link href={tool.href} className={`orion-home-tool${index === 0 ? " orion-home-tool-featured" : ""}`} key={tool.title}><span className="orion-home-tool-label">{tool.label}</span><span className="orion-home-tool-content"><strong>{tool.title}</strong><span>{tool.detail}</span></span><span className="orion-home-tool-link">{tool.action} <span aria-hidden="true">↗</span></span></Link>)}</div>
      </div>
    </section>

    <section className="orion-home-close"><div className="orion-home-container"><div><p className="orion-home-kicker">PRONTO PARA COMEÇAR?</p><h2>Seu próximo levantamento<br />começa aqui.</h2></div><Link className="orion-home-button orion-home-button-primary" href="/painel/novo">Criar levantamento <span aria-hidden="true">↗</span></Link></div></section>
    <footer className="orion-home-footer"><div className="orion-home-container"><span><b>ORION MAPS</b> · LEVANTAMENTO AÉREO</span><a href="https://unsplash.com/photos/white-drone-flying-over-green-grass-field-during-daytime-A44pS9zVXRM" target="_blank" rel="noreferrer">Foto: Andreas Psaltis / Unsplash</a></div></footer>
  </main>;
}
