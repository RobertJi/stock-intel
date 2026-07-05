/** 中文主题名 → ASCII 锚点 id (Next.js 对非 ASCII hash 不做解码,无法滚动定位) */
export function themeAnchor(theme: string): string {
  let h = 0;
  for (let i = 0; i < theme.length; i++) {
    h = ((h << 5) - h + theme.charCodeAt(i)) | 0;
  }
  return `theme-${Math.abs(h).toString(36)}`;
}
