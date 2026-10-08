import Link from "next/link";
import { Inter, Roboto_Mono } from "next/font/google";
import "./home.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], display: "swap", variable: "--font-roboto-mono" });

const areas = [
  {number:"01",title:"Levantamentos",detail:"Projetos, fotos e contexto de campo.",href:"/painel",action:"Abrir projetos"},
  {number:"02",title:"Planejamento de voo",detail:"Grid, corredor, órbita e estimativas de cobertura.",href:"/waypoints",action:"Planejar voo"},
  {number:"03",title:"Processamento",detail:"Ortofoto, modelos de elevação e arquivos técnicos.",href:"/processamento",action:"Ver processamento"},
];

export default function Home(){
  return <main className={`orion-home ${inter.variable} ${robotoMono.variable}`}>
    <div className="orion-home-frame">
      <header className="orion-home-header"><Link href="/" className="orion-wordmark"><span className="orion-symbol" aria-hidden="true">O</span><span>ORION <b>MAPS</b><small>LEVANTAMENTO AÉREO</small></span></Link><nav aria-label="Navegação principal"><Link href="/painel">Levantamentos</Link><Link href="/waypoints">Voo e Grid</Link><Link href="/processamento">Processamento</Link></nav><Link href="/entrar" className="orion-home-signin">Entrar <span aria-hidden="true">→</span></Link></header>
      <section className="orion-home-intro"><div className="orion-home-intro-copy"><p className="orion-overline"><span aria-hidden="true"/>PLATAFORMA DE LEVANTAMENTO AÉREO</p><h1>Do voo à <span>ortofoto.</span><br/>Tudo no seu controle.</h1><p>Planeje a missão, organize as imagens e acompanhe os produtos do levantamento em um só lugar.</p><div className="orion-home-actions"><Link href="/painel" className="orion-home-primary">Abrir área de trabalho <span aria-hidden="true">→</span></Link><Link href="/waypoints" className="orion-home-secondary">Planejar voo</Link></div></div><div className="orion-home-visual" aria-hidden="true"><span className="orion-visual-label">CAPTURA DE CAMPO</span></div></section>
      <section className="orion-home-areas" aria-label="Áreas do aplicativo"><div className="orion-home-section-heading"><span>FERRAMENTAS</span><h2>Um fluxo claro, do planejamento ao resultado.</h2></div><div className="orion-home-area-grid">{areas.map(area=><Link key={area.number} href={area.href} className="orion-home-area"><span className="orion-area-number">{area.number}</span><strong>{area.title}</strong><small>{area.detail}</small><span className="orion-area-action">{area.action} <span aria-hidden="true">→</span></span></Link>)}</div></section>
      <footer className="orion-home-footer"><span>ORION MAPS</span><span>Planejamento · Levantamento · Processamento</span><a href="https://unsplash.com/photos/white-drone-flying-over-green-grass-field-during-daytime-A44pS9zVXRM" target="_blank" rel="noreferrer">Foto: Andreas Psaltis / Unsplash</a></footer>
    </div>
  </main>;
}
