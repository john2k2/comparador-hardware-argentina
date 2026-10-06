import type { Page } from '@playwright/test';

// axe cannot resolve a gradient behind text. Bound its contrast against all
// three real canvas stops, including translucent ancestor backgrounds.
export async function measureGradientTextContrast(page: Page, targets: string[]) {
  return page.evaluate(selectors => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    function rgba(color: string) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    }
    function composite(front: number[], back: number[]) {
      return front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3]));
    }
    function luminance(rgb: number[]) {
      return rgb.slice(0, 3).map(v => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    }
    function contrast(a: number[], b: number[]) {
      const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
      return (values[1] + 0.05) / (values[0] + 0.05);
    }
    const root = getComputedStyle(document.documentElement);
    const stops = ['top', 'middle', 'bottom'].map(stop => rgba(root.getPropertyValue(`--canvas-${stop}`).trim()));
    return selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, manualReason: 'Target not found' };
      const styles = getComputedStyle(element);
      const chain: Element[] = [];
      for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) chain.unshift(node);
      const layers = chain.map(node => {
        const s = getComputedStyle(node);
        return { color: rgba(s.backgroundColor), image: s.backgroundImage, opacity: s.opacity, filter: s.filter };
      });
      if (layers.some(layer => layer.image !== 'none' || layer.opacity !== '1' || layer.filter !== 'none')) {
        return { selector, manualReason: 'Local image, group opacity or filter requires visual review' };
      }
      const backgrounds = stops.map(stop => layers.reduce((back, layer) => composite(layer.color, back), stop.slice(0, 3)));
      const color = rgba(styles.color);
      const ratios = backgrounds.map(back => contrast(composite(color, back), back));
      const fontSize = Number.parseFloat(styles.fontSize);
      const bold = Number.parseInt(styles.fontWeight, 10) >= 700;
      const threshold = fontSize >= 24 || (bold && fontSize >= 18.667) ? 3 : 4.5;
      return { selector, color: styles.color, fontSize, weight: styles.fontWeight, backgrounds, ratios, minimum: Math.min(...ratios), threshold };
    });
  }, [...new Set(targets)]);
}
