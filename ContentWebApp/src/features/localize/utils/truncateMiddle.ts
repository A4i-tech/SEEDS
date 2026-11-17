let context: CanvasRenderingContext2D | null | undefined;

function widthOf(text: string, font: string) {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  context.font = font;
  return context.measureText(text).width;
}

export function truncateMiddle(text: string, maxWidth: number, font: string) {
  if (widthOf(text, font) <= maxWidth) return text;
  const keep = (count: number) => `${text.slice(0, Math.ceil(count / 2))}…${text.slice(text.length - Math.floor(count / 2))}`;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (widthOf(keep(mid), font) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? keep(low) : '…';
}
