import type { Condition } from '../api/forecast';
import clearDay from '../assets/icons/clear-day.svg';
import clearNight from '../assets/icons/clear-night.svg';
import cloudy from '../assets/icons/cloudy.svg';
import rain from '../assets/icons/rain.svg';
import snow from '../assets/icons/snow.svg';
import stormDay from '../assets/icons/thunderstorms-day.svg';
import stormNight from '../assets/icons/thunderstorms-night.svg';

type Props = { category: Condition['category']; isDay?: boolean };

export function ConditionIcon({ category, isDay = true }: Props) {
  const source = {
    clear: isDay ? clearDay : clearNight,
    cloudy,
    rain,
    snow,
    storm: isDay ? stormDay : stormNight,
  }[category];

  return <img className="condition-icon" src={source} alt="" aria-hidden="true" />;
}
