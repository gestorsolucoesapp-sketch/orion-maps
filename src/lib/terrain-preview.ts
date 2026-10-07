/** Numeric helpers for browser previews only. Never changes stored survey products. */
export type TerrainPalette = "dtm" | "dsm" | "slope";
export function validSample(value: number, noData: number | null): boolean {
  return Number.isFinite(value) && (noData === null || !Number.isFinite(noData) || value !== noData);
}
export function validRange(band: ArrayLike<number>, noData: number | null) {
  let min = Infinity, max = -Infinity, count = 0;
  for (let i = 0; i < band.length; i++) {
    const v = Number(band[i]);
    if (!validSample(v, noData)) continue;
    min = Math.min(min, v); max = Math.max(max, v); count++;
  }
  if (!count) throw new Error("Raster sem amostras válidas.");
  return {min, max, count};
}
export const SLOPE_CLASSES = [
  {max: 3, label: "0–3%", color: "#2c7a42", rgb: [44,122,66]},
  {max: 8, label: "3–8%", color: "#82b95b", rgb: [130,185,91]},
  {max: 20, label: "8–20%", color: "#e1d45a", rgb: [225,212,90]},
  {max: 45, label: "20–45%", color: "#e6a044", rgb: [230,160,68]},
  {max: 75, label: "45–75%", color: "#c9673c", rgb: [201,103,60]},
  {max: Infinity, label: ">75%", color: "#883b4a", rgb: [136,59,74]},
] as const;
export function terrainColor(value: number, min: number, max: number, palette: TerrainPalette): readonly number[] {
  if (palette === "slope") return (SLOPE_CLASSES.find(c => value <= c.max) || SLOPE_CLASSES[5]).rgb;
  const stops = palette === "dtm"
    ? [[34,94,57],[104,158,76],[194,194,86],[220,149,72],[132,80,55]]
    : [[44,95,160],[58,151,176],[91,168,120],[215,190,82],[182,82,64]];
  const t = max === min ? .5 : Math.max(0, Math.min(1, (value-min)/(max-min)));
  const scaled = t*(stops.length-1), index = Math.min(stops.length-2, Math.floor(scaled));
  return stops[index].map((v, c) => Math.round(v+(stops[index+1][c]-v)*(scaled-index)));
}
/** Horn gradient, native grid spacing in metres. Missing neighbours remain NoData. */
export function slopePercentAt(band: ArrayLike<number>, width: number, height: number, x: number, y: number, dx: number, dy: number, noData: number | null): number {
  if (x < 1 || y < 1 || x >= width-1 || y >= height-1 || !(dx > 0 && dy > 0)) return NaN;
  const z: number[] = [];
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
    const v = Number(band[(y+row)*width+x+col]);
    if (!validSample(v, noData)) return NaN;
    z.push(v);
  }
  const gx = ((z[2]+2*z[5]+z[8])-(z[0]+2*z[3]+z[6]))/(8*dx);
  const gy = ((z[6]+2*z[7]+z[8])-(z[0]+2*z[1]+z[2]))/(8*dy);
  return 100*Math.hypot(gx, gy);
}
