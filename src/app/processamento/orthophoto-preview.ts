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
  // Only the exterior-connected NoData mask is changed. White roofs, lane
  // markings, vegetation and enclosed shadows retain their original RGBA.
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
