/** Display-only cleanup. Never recolor, inpaint or replace survey pixels. */
export function clearExteriorNoData(data: Uint8ClampedArray, width: number, height: number): number {
  const count = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== count * 4) {
    throw new Error("Dimensões inválidas da ortofoto.");
  }
  const outside = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const candidate = (p: number) => {
    const i = p * 4;
    if (data[i + 3] === 0) return true;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    return max <= 24 && max - min <= 10;
  };
  const push = (p: number) => {
    if (!outside[p] && candidate(p)) { outside[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width;
    if (x > 0) push(p - 1);
    if (x + 1 < width) push(p + 1);
    if (p >= width) push(p - width);
    if (p + width < count) push(p + width);
  }
  // Clear JPEG matte residue only when it is connected to the exterior and
  // within a narrow 12-pixel rim. Never key out white throughout the image:
  // that would erase roofs, road markings and valid survey details.
  const exteriorCount = tail;
  const distance = new Uint8Array(count);
  distance.fill(255);
  for (let i = 0; i < exteriorCount; i++) distance[queue[i]] = 0;
  head = 0;
  const visit = (p: number, value: number) => {
    if (distance[p] === 255) { distance[p] = value; queue[tail++] = p; }
  };
  while (head < tail) {
    const p = queue[head++], x = p % width, next = distance[p] + 1;
    if (next > 12) continue;
    if (x > 0) visit(p - 1, next);
    if (x + 1 < width) visit(p + 1, next);
    if (p >= width) visit(p - width, next);
    if (p + width < count) visit(p + width, next);
  }
  head = 0; tail = exteriorCount;
  const clearRim = (p: number) => {
    if (outside[p] || distance[p] > 12) return;
    const i = p * 4;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if ((min >= 225 && max - min <= 20) || (max <= 65 && max - min <= 18)) {
      outside[p] = 1; queue[tail++] = p;
    }
  };
  while (head < tail) {
    const p = queue[head++], x = p % width;
    if (x > 0) clearRim(p - 1);
    if (x + 1 < width) clearRim(p + 1);
    if (p >= width) clearRim(p - width);
    if (p + width < count) clearRim(p + width);
  }
  // Alpha only: no RGB changes, no satellite replacement and no synthetic fill.
  for (let p = 0; p < count; p++) if (outside[p]) data[p * 4 + 3] = 0;
  return tail;
}

export async function prepareOrthophotoPreview(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Não foi possível carregar a ortofoto original.");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    signal?.throwIfAborted();
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível preparar a prévia do mapa.");
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    clearExteriorNoData(image.data, width, height);
    context.putImageData(image, 0, 0);
    signal?.throwIfAborted();
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
