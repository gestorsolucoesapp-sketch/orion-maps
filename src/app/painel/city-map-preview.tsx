"use client";

import { useEffect, useState } from "react";

type Place = { lat: number; lon: number; label: string };
export default function CityMapPreview({ city }: { city: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const query = city.trim();
    if (query.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setMessage("Localizando cidade…");
      try {
        const response = await fetch(`/api/city-location?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const result = await response.json() as Place & { error?: string };
        if (!response.ok) throw new Error(result.error || "Cidade não encontrada.");
        setPlace(result); setMessage("");
      } catch (error) {
        if (!controller.signal.aborted) { setPlace(null); setMessage(error instanceof Error ? error.message : "Falha ao localizar."); }
      }
    }, 900);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [city]);
  if (!place) return <p role="status" className="mt-2 text-xs font-normal text-slate-500">{message || "Digite o município e o estado para posicionar o mapa."}</p>;
  const delta = 0.06;
  const bbox = [place.lon-delta,place.lat-delta,place.lon+delta,place.lat+delta].join(",");
  const url = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${place.lat},${place.lon}`)}`;
  return <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-normal text-emerald-900"><span className="truncate">📍 {place.label}</span><span className="shrink-0">Local aproximado</span></div>
    <iframe key={url} src={url} title={`Mapa centralizado em ${place.label}`} loading="lazy" className="h-56 w-full border-0 sm:h-64" referrerPolicy="strict-origin-when-cross-origin" />
    <p className="px-3 py-2 text-xs font-normal text-slate-600">O mapa indica o centro da cidade, não os limites do terreno. © OpenStreetMap contributors.</p>
  </div>;
}
