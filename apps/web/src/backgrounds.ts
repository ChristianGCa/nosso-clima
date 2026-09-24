import clearDay from './assets/backgrounds/dia-limpo.webp';
import cloudyDay from './assets/backgrounds/dia-nublado.webp';
import rainDay from './assets/backgrounds/dia-chuvoso.webp';
import snowDay from './assets/backgrounds/dia-neve.webp';
import stormDay from './assets/backgrounds/dia-tempestade.webp';
import clearNight from './assets/backgrounds/noite-limpa.webp';
import cloudyNight from './assets/backgrounds/noite-nublada.webp';
import rainNight from './assets/backgrounds/noite-chuvosa.webp';
import snowNight from './assets/backgrounds/noite-neve.webp';
import stormNight from './assets/backgrounds/noite-tempestade.webp';
import type { Condition } from './api/forecast';

const backgrounds = {
  clear: { day: clearDay, night: clearNight },
  cloudy: { day: cloudyDay, night: cloudyNight },
  rain: { day: rainDay, night: rainNight },
  snow: { day: snowDay, night: snowNight },
  storm: { day: stormDay, night: stormNight },
} as const;

export function backgroundFor(category: Condition['category'], isDay: boolean): string {
  return backgrounds[category][isDay ? 'day' : 'night'];
}
