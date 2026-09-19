export type CameraPlan = {
  sensorWidth: number; sensorHeight: number; focalLength: number;
  imageWidth: number; imageHeight: number; height: number;
  frontOverlap: number; sideOverlap: number; speed: number; targetGsd: number;
};

export function calculateGsd(plan: CameraPlan) {
  const { sensorWidth, sensorHeight, focalLength, imageWidth, imageHeight, height, frontOverlap, sideOverlap, speed, targetGsd } = plan;
  const positive = [sensorWidth, sensorHeight, focalLength, imageWidth, imageHeight, height, speed, targetGsd];
  if (positive.some(n => !Number.isFinite(n) || n <= 0)) throw new Error("Preencha os campos com valores maiores que zero.");
  if (![imageWidth, imageHeight].every(Number.isInteger)) throw new Error("As dimensões da imagem devem ser números inteiros de pixels.");
  if ([frontOverlap, sideOverlap].some(n => !Number.isFinite(n) || n < 0 || n >= 100)) throw new Error("A sobreposição deve estar entre 0 e 99,9%.");
  const footprintWidth = height * sensorWidth / focalLength;
  const footprintHeight = height * sensorHeight / focalLength;
  const gsdX = footprintWidth * 100 / imageWidth;
  const gsdY = footprintHeight * 100 / imageHeight;
  const photoSpacing = footprintHeight * (1 - frontOverlap / 100);
  const lineSpacing = footprintWidth * (1 - sideOverlap / 100);
  const targetHeight = height * targetGsd / Math.max(gsdX, gsdY);
  return { gsdX, gsdY, footprintWidth, footprintHeight, photoSpacing, lineSpacing, interval: photoSpacing / speed, targetHeight };
}
