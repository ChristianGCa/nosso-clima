import { useId, useLayoutEffect, useRef, useState } from 'react';
import { categoryLabel, type HourlyColumns } from '../api/forecast';
import rainVolumeIcon from '../assets/icons/raindrop-measure.svg';
import temperatureIcon from '../assets/icons/thermometer.svg';
import { dayLabel, hourLabel, metric } from '../format/weather-format';
import { ConditionIcon } from './condition-icon';

function HourlyValue({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Indisponível</span>
      </>
    );
  }
  // The unit sits under the number; the space keeps the text "22,5 °C" for assistive technology.
  return (
    <>
      <span className="hourly-number">{metric(value, '')}</span>{' '}
      <span className="hourly-unit">{unit}</span>
    </>
  );
}

function RowIcon({ source, label }: { source: string; label: string }) {
  return (
    <>
      <img className="hourly-row-icon" src={source} alt="" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Disclosure inside a daily card with that day's hourly condition, temperature and rain.
 * Whether it is open lives only in component state: never in the URL, storage or analytics.
 * On today's card, `currentHour` labels that column “Agora”, highlights it and scrolls it into view,
 * while the earlier hours stay one scroll away.
 */
export function HourlyDetails({
  date,
  hourly,
  currentHour,
}: {
  date: string;
  hourly: HourlyColumns;
  currentHour?: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const captionId = useId();
  const nowRef = useRef<HTMLTableCellElement>(null);
  const day = dayLabel(date);
  const action = open ? 'Ocultar horas' : 'Ver por hora';
  const isNow = (hour: number) => hour === currentHour;
  const nowClass = (hour: number) => (isNow(hour) ? 'hourly-now' : undefined);

  // Instant scroll (no animation) so the current hour is the first column after the row icons.
  useLayoutEffect(() => {
    const now = nowRef.current;
    const region = now?.closest<HTMLElement>('.hourly-scroll');
    if (!open || !now || !region) return;
    const stickyWidth = region.querySelector('thead th')?.getBoundingClientRect().width ?? 0;
    region.scrollLeft +=
      now.getBoundingClientRect().left - region.getBoundingClientRect().left - stickyWidth;
  }, [open]);

  return (
    <div className="hourly-details">
      <button
        type="button"
        className="hourly-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${action} de ${day}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="hourly-toggle-mark">
          {open ? '▴' : '▾'}
        </span>
        {action}
      </button>
      <div id={panelId} hidden={!open}>
        {open && (
          // biome-ignore lint/a11y/noNoninteractiveTabindex: approved exception in CONSTRAINTS.md; keyboard users must reach this horizontally scrollable region (axe scrollable-region-focusable).
          <section className="hourly-scroll" aria-labelledby={captionId} tabIndex={0}>
            <table className="hourly-table">
              <caption id={captionId} className="visually-hidden">
                Previsão por hora de {day}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Medida</span>
                  </th>
                  {HOURS.map((hour) => (
                    <th
                      scope="col"
                      key={hour}
                      className={nowClass(hour)}
                      ref={isNow(hour) ? nowRef : undefined}
                    >
                      {isNow(hour) ? (
                        // One line, like the other headers; the hour stays for assistive technology.
                        <>
                          <span className="visually-hidden">{hourLabel(hour)} </span>
                          Agora
                        </>
                      ) : (
                        hourLabel(hour)
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <span className="visually-hidden">Condição</span>
                  </th>
                  {HOURS.map((hour) => {
                    const category = hourly.conditionCategory[hour] ?? 'cloudy';
                    return (
                      <td key={hour} className={nowClass(hour)}>
                        <ConditionIcon category={category} isDay={hourly.isDay[hour] ?? true} />
                        <span className="visually-hidden">{categoryLabel(category)}</span>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">
                    <RowIcon source={temperatureIcon} label="Temperatura" />
                  </th>
                  {HOURS.map((hour) => (
                    <td key={hour} className={nowClass(hour)}>
                      <HourlyValue value={hourly.temperatureC[hour] ?? null} unit="°C" />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">
                    <RowIcon source={rainVolumeIcon} label="Chuva na hora anterior" />
                  </th>
                  {HOURS.map((hour) => (
                    <td key={hour} className={nowClass(hour)}>
                      <HourlyValue value={hourly.precipitationMm[hour] ?? null} unit="mm" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
