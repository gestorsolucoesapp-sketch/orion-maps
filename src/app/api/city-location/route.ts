import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const city = (request.nextUrl.searchParams.get("q") || "").trim();
  if (city.length < 3 || city.length > 120) return NextResponse.json({ error: "Informe uma cidade válida." }, { status: 400 });
  const params = new URLSearchParams({ q: city.replace(/\s*[-–]\s*(SP|RJ|MG|PR|SC|RS|BA|GO|MT|MS|ES|PE|CE|PA|AM|TO|DF|AC|AL|AP|MA|PB|PI|RN|RO|RR|SE)\s*$/i, ", $1") + ", Brasil", format: "jsonv2", limit: "1", countrycodes: "br", addressdetails: "1" });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "OrionMaps/0.4.11 (city search; https://orion-maps.vercel.app)", "Accept-Language": "pt-BR" },
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error("Geocodificação indisponível.");
    const rows = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
    const result = rows[0];
    if (!result) return NextResponse.json({ error: "Cidade não encontrada. Confira o município e o estado." }, { status: 404 });
    const lat = Number(result.lat), lon = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Coordenadas inválidas.");
    return NextResponse.json({ lat, lon, label: result.display_name }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch { return NextResponse.json({ error: "Não foi possível localizar a cidade agora." }, { status: 503 }); }
}
