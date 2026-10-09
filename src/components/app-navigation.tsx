"use client";

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";

const groups=[
  {name:"Planejamento",items:[{label:"Voo e Grid",href:"/waypoints"},{label:"Calculadora GSD",href:"/gsd"}]},
  {name:"Levantamentos",items:[{label:"Painel",href:"/painel"},{label:"Novo levantamento",href:"/painel/novo"}]},
  {name:"Processamento",items:[{label:"Produtos e fila",href:"/processamento"}]},
  {name:"Resultados",items:[{label:"Mapas e entregas",href:"/processamento/resultados"}]},
  {name:"Utilitários",items:[{label:"Planejamento agrícola",href:"/agro"}]},
];

export default function AppNavigation(){
  const pathname=usePathname();
  if(pathname==="/entrar"||pathname.startsWith("/processamento/relatorio"))return null;
  return <header className={`orion-app-navigation print:hidden ${pathname === "/" ? "orion-app-navigation--home" : "orion-app-navigation--workspace"}`}>
    <Link className="orion-app-navigation-brand" href="/" aria-label="Orion Maps, início"><span className="orion-app-navigation-symbol" aria-hidden="true"><Image src="/orion-drone-mark.svg" alt="" width={35} height={35} className="orion-app-navigation-drone"/></span><span>ORION <b>MAPS</b></span></Link>
    <nav aria-label="Navegação do Orion Maps">{groups.map(group=><div className="orion-app-navigation-group" key={group.name}><span>{group.name}</span>{group.items.map(item=>{const active=pathname===item.href;return <Link key={item.href} href={item.href} aria-current={active?"page":undefined} className={active?"active":undefined}>{item.label}</Link>;})}</div>)}</nav>
    {pathname==="/"&&<Link className="orion-app-navigation-signin" href="/entrar">Entrar</Link>}
    <details className="orion-app-navigation-mobile" key={pathname}><summary>Menu</summary><nav aria-label="Navegação móvel do Orion Maps">{groups.map(group=><div key={group.name}><strong>{group.name}</strong>{group.items.map(item=><Link href={item.href} aria-current={pathname===item.href?"page":undefined} key={item.href}>{item.label}</Link>)}</div>)}</nav></details>
  </header>;
}
