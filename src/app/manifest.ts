import type {MetadataRoute} from "next";

export default function manifest():MetadataRoute.Manifest{
  return {
    name:"Orion Maps Drones",
    short_name:"Orion Maps",
    description:"Mapeamento de precisão, planejamento de voo e resultados fotogramétricos.",
    start_url:"/painel",
    display:"standalone",
    background_color:"#171b19",
    theme_color:"#171b19",
    orientation:"portrait",
    icons:[
      {src:"/orion-maps-logo.jpg",sizes:"any",type:"image/jpeg",purpose:"any"},
      {src:"/orion-maps-logo.jpg",sizes:"any",type:"image/jpeg",purpose:"maskable"}
    ]
  };
}
