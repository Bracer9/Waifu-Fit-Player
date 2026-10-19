const SIZE = 512;
function square(source: CanvasImageSource, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const edge = Math.min(width, height);
  canvas
    .getContext('2d')!
    .drawImage(source, (width - edge) / 2, (height - edge) / 2, edge, edge, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/webp', 0.85);
}
export function coverFromVideo(video: HTMLVideoElement): string {
  if (video.readyState < 2 || !video.videoWidth) throw new Error('请等视频画面加载后再设为曲绘。');
  return square(video, video.videoWidth, video.videoHeight);
}
export async function coverFromFile(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  try {
    return square(image, image.width, image.height);
  } finally {
    image.close();
  }
}

/** Album banners keep their original pixels and aspect ratio, unlike song jackets. */
export async function albumCoverFromFile(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  image.close();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
