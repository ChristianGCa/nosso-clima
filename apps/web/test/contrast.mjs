import assert from 'node:assert/strict';

export async function checkContrast(page, label) {
  const result = await page.evaluate(async () => {
    const shell = document.querySelector('.site-shell.has-image');
    if (!shell) throw new Error('weather image is missing');
    const imageUrl = getComputedStyle(shell).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    if (!imageUrl) throw new Error('weather image URL is missing');
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('image canvas is unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    function color(value) {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) throw new Error(`unsupported color: ${value}`);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }

    function over(top, bottom) {
      return top
        .slice(0, 3)
        .map((channel, index) => channel * top[3] + bottom[index] * (1 - top[3]));
    }

    const base = color(getComputedStyle(shell).backgroundColor);
    const darkest = [255, 255, 255];
    const brightest = [0, 0, 0];
    for (let index = 0; index < pixels.length; index += 4) {
      const pixel = over(
        [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3] / 255],
        base,
      );
      for (let channel = 0; channel < 3; channel += 1) {
        darkest[channel] = Math.min(darkest[channel], pixel[channel]);
        brightest[channel] = Math.max(brightest[channel], pixel[channel]);
      }
    }

    function surface(element, source) {
      const layers = [];
      for (let node = element; node && node !== shell; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none' || style.opacity !== '1')
          throw new Error('unsupported contrast layer');
        layers.push(color(style.backgroundColor));
      }
      return layers.reverse().reduce((background, layer) => over(layer, background), source);
    }

    function luminance(rgb) {
      const linear = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }

    function ratio(first, second) {
      const high = Math.max(first, second);
      const low = Math.min(first, second);
      return (high + 0.05) / (low + 0.05);
    }

    function minimumContrast(foreground, element) {
      const ink = luminance(foreground);
      const dark = luminance(surface(element, darkest));
      const bright = luminance(surface(element, brightest));
      if (dark <= ink && ink <= bright) return 1;
      return Math.min(ratio(ink, dark), ratio(ink, bright));
    }

    const text = [];
    for (const element of shell.querySelectorAll('*')) {
      if (
        element.closest('.visually-hidden') ||
        !Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )
      )
        continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10);
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const ink = color(style.color);
      if (ink[3] !== 1) throw new Error('translucent text needs explicit contrast handling');
      text.push({
        element: `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().replaceAll(' ', '.')}` : ''}`,
        ratio: minimumContrast(ink, element),
        minimum: large ? 3 : 4.5,
        large,
      });
    }

    const field = shell.querySelector('.search-field');
    if (!field) throw new Error('search field is missing');
    const fieldStyle = getComputedStyle(field);
    if (fieldStyle.outlineStyle !== 'solid' || fieldStyle.outlineWidth !== '3px')
      throw new Error('search focus outline is missing');
    const border = color(fieldStyle.borderTopColor);
    const outline = color(fieldStyle.outlineColor);
    const boundaries = [
      { element: 'search border inside', ratio: minimumContrast(border, field), minimum: 3 },
      {
        element: 'search border outside',
        ratio: minimumContrast(border, field.parentElement),
        minimum: 3,
      },
      {
        element: 'search focus outline',
        ratio: minimumContrast(outline, field.parentElement),
        minimum: 3,
      },
    ];
    return {
      text,
      boundaries,
      image: imageUrl.split('/').pop(),
    };
  });

  const findings = [...result.text, ...result.boundaries];
  const failures = findings.filter((item) => item.ratio + 0.001 < item.minimum);
  assert.deepEqual(
    failures.map((item) => `${item.element}: ${item.ratio.toFixed(2)} < ${item.minimum}`),
    [],
    `${label} fails conservative contrast against ${result.image}`,
  );
  const ordinary = Math.min(...result.text.filter((item) => !item.large).map((item) => item.ratio));
  const large = Math.min(...result.text.filter((item) => item.large).map((item) => item.ratio));
  const boundary = Math.min(...result.boundaries.map((item) => item.ratio));
  process.stdout.write(
    `Contrast ${label}: ordinary ${ordinary.toFixed(2)}:1, large ${large.toFixed(2)}:1, control ${boundary.toFixed(2)}:1\n`,
  );
  return { ordinary, large, boundary };
}
