/** Layout de chão (planta) desenhado sobre o mapa. Tudo em metros num plano local: x para leste, y para norte. */
export type Pt = { x: number; y: number };
export type ShapeKind = "rect" | "machine" | "pallet" | "circle" | "line" | "dim" | "text";
export type Shape = {
  id: string;
  kind: ShapeKind;
  /** centro (rect/machine/pallet/circle/text) */
  x: number; y: number;
  /** largura (eixo local da peça) e comprimento, em metros */
  w: number; h: number;
  /** rotação em graus, sentido horário a partir do norte do layout */
  rot: number;
  /** pontos para linha e cota */
  pts?: Pt[];
  label?: string;
  color?: string;
};
export type SiteLayout = {
  id: string;
  name: string;
  updatedAt: number;
  origin: { lng: number; lat: number } | null;
  area: Pt[];
  areaClosed: boolean;
  shapes: Shape[];
  /** ângulo do lado mais longo da área, usado para alinhar peças novas */
  baseAngle: number;
  view?: { lng: number; lat: number; zoom: number; bearing: number };
};

const M_PER_DEG_LAT = 111132.92;
const mPerDegLng = (lat: number) => 111412.84 * Math.cos((lat * Math.PI) / 180);

export function toLngLat(origin: { lng: number; lat: number }, p: Pt): [number, number] {
  return [origin.lng + p.x / mPerDegLng(origin.lat), origin.lat + p.y / M_PER_DEG_LAT];
}
export function fromLngLat(origin: { lng: number; lat: number }, lng: number, lat: number): Pt {
  return { x: (lng - origin.lng) * mPerDegLng(origin.lat), y: (lat - origin.lat) * M_PER_DEG_LAT };
}

export function polygonArea(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}
export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
export function perimeter(p: Pt[], closed = true) {
  let s = 0;
  for (let i = 0; i < p.length - (closed ? 0 : 1); i++) s += dist(p[i], p[(i + 1) % p.length]);
  return s;
}

/** Rumo (graus a partir do norte, horário) de a para b. */
export const bearingDeg = (a: Pt, b: Pt) => (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;

/** Ângulo do lado mais longo, reduzido a 0..90 para servir de "esquadro" do layout. */
export function longestEdgeAngle(p: Pt[]) {
  if (p.length < 2) return 0;
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], d = dist(a, b);
    if (d > best) { best = d; ang = bearingDeg(a, b); }
  }
  return Math.round((((ang % 90) + 90) % 90) * 10) / 10;
}

/** Converte um vetor no referencial da peça (u = largura, v = comprimento) para o plano local. */
export function rotate(u: number, v: number, rotDeg: number): Pt {
  const r = (rotDeg * Math.PI) / 180;
  return { x: u * Math.cos(r) + v * Math.sin(r), y: -u * Math.sin(r) + v * Math.cos(r) };
}
export function toShapeFrame(s: { x: number; y: number; rot: number }, p: Pt) {
  const dx = p.x - s.x, dy = p.y - s.y, r = (s.rot * Math.PI) / 180;
  return { u: dx * Math.cos(r) - dy * Math.sin(r), v: dx * Math.sin(r) + dy * Math.cos(r) };
}
export function rectCorners(s: Shape): Pt[] {
  const hw = s.w / 2, hh = s.h / 2;
  return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([u, v]) => { const d = rotate(u, v, s.rot); return { x: s.x + d.x, y: s.y + d.y }; });
}

export const fmt = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 });

export const DEFAULTS = {
  pallet: { w: 1.0, h: 1.2, color: "#d9483b", label: "" },
  machine: { w: 3, h: 10, color: "#3f7fc4", label: "Máquina" },
  rect: { w: 2, h: 2, color: "#f2c94c", label: "" },
  circle: { w: 1, h: 1, color: "#27ae60", label: "" },
  text: { w: 0, h: 1, color: "#ffffff", label: "Texto" },
} as const;

export const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyLayout(name = "Novo layout"): SiteLayout {
  return { id: newId(), name, updatedAt: Date.now(), origin: null, area: [], areaClosed: false, shapes: [], baseAngle: 0 };
}

const KEY = "orion-site-layouts-v1";
export function loadLayouts(): SiteLayout[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(v)) return [];
    const num = (n: unknown, d = 0) => (typeof n === "number" && Number.isFinite(n) ? n : d);
    return v.filter(l => l && typeof l === "object" && typeof l.id === "string").map((l): SiteLayout => ({
      ...emptyLayout(), ...l,
      name: typeof l.name === "string" ? l.name : "Layout",
      area: Array.isArray(l.area) ? l.area.filter((p: Pt) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [],
      shapes: Array.isArray(l.shapes) ? l.shapes.filter((s: Shape) => s && typeof s.id === "string" && typeof s.kind === "string")
        .map((s: Shape) => ({ ...s, x: num(s.x), y: num(s.y), w: num(s.w, 1), h: num(s.h, 1), rot: num(s.rot) })) : [],
      baseAngle: num(l.baseAngle),
      origin: l.origin && Number.isFinite(l.origin.lng) && Number.isFinite(l.origin.lat) ? l.origin : null,
    }));
  } catch { return []; }
}
export function saveLayouts(list: SiteLayout[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** Lê o primeiro polígono (ou linha) de um KML. Aceita o texto do arquivo. */
export function parseKmlPolygon(kml: string): [number, number][] | null {
  const blocks = [...kml.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/gi)].map(m => m[1].trim());
  for (const b of blocks) {
    const pts = b.split(/\s+/).map(t => t.split(",").map(Number)).filter(a => a.length >= 2 && a.every(Number.isFinite)).map(a => [a[0], a[1]] as [number, number]);
    if (pts.length >= 3) {
      const f = pts[0], l = pts[pts.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) pts.pop();
      return pts;
    }
  }
  return null;
}
