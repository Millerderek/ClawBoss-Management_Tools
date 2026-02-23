export const computeRms = (buffer: Buffer): number => {
  const sampleCount = buffer.length / 2;
  if (sampleCount === 0) return 0;
  const view = new Int16Array(buffer.buffer, buffer.byteOffset, sampleCount);
  let sum = 0;
  for (let i = 0; i < view.length; i += 1) {
    sum += view[i] * view[i];
  }
  return Math.sqrt(sum / sampleCount);
};
