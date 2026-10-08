import Link from "next/link";

const areas = [
  {number:"01",title:"Levantamentos",detail:"Projetos, fotos e contexto de campo.",href:"/painel",action:"Abrir projetos"},
  {number:"02",title:"Planejamento de voo",detail:"Grid, corredor, órbita e estimativas de cobertura.",href:"/waypoints",action:"Planejar voo"},
  {number:"03",title:"Processamento",detail:"Ortofoto, modelos de elevação e arquivos técnicos.",href:"/processamento",action:"Ver processamento"},
];

export default function Home(){
  return <main className="orion-home">
    <div className="orion-home-frame">
      <header className="orion-home-header"><Link href="/" className="orion-wordmark"><span className="orion-symbol" aria-hidden="true">O</span><span>ORION <b>MAPS</b><small>LEVANTAMENTO AÉREO</small></span></Link><Link href="/entrar" className="orion-home-signin">Entrar <span aria-hidden="true">↗</span></Link></header>
      <section className="orion-home-intro"><p className="orion-overline">PLANEJAMENTO / CAMPO / ENTREGA</p><h1>Do terreno ao<br/><em>mapa de trabalho.</em></h1><p>Organize cada voo, processe as imagens e consulte os produtos em um só lugar. As medidas e a precisão devem ser conferidas conforme o objetivo do levantamento.</p><Link href="/painel" className="orion-home-primary">Abrir área de trabalho <span aria-hidden="true">→</span></Link></section>
      <section className="orion-home-areas" aria-label="Áreas do aplicativo">{areas.map(area=><Link key={area.number} href={area.href} className="orion-home-area"><span className="orion-area-number">{area.number}</span><span><strong>{area.title}</strong><small>{area.detail}</small></span><span className="orion-area-action">{area.action} ↗</span></Link>)}</section>
      <footer className="orion-home-footer"><span>ORION MAPS</span><span>Da captura à análise, com rastreabilidade.</span></footer>
    </div>
  </main>;
}
