const trailingNumber = /[\s_-]+(?:(?:unit|chapter|chap|ch)[\s_-]*)?\d+$/i;

export function defaultBookTitle(firstFileName: string) {
  return firstFileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(trailingNumber, '')
    .replaceAll('_', ' ')
    .trim();
}
