import { useId, useState } from 'react';
import type { Daily, HourlyColumns } from '../api/forecast';
import { compactDayLabel, dayLabel, hourLabel, metric } from '../format/weather-format';

type DayWithHours = Daily & Readonly<{ hourly: HourlyColumns }>;

function HourlyValue({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Indisponível</span>
      </>
    );
  }
  return <>{metric(value, unit)}</>;
}

/**
 * Hourly temperature and precipitation for one chosen day. The chosen day lives only in
 * component state: it never reaches the URL, browser storage, analytics or logs.
 */
export function HourlyForecast({
  daily,
  validAtLocal,
}: {
  daily: readonly DayWithHours[];
  validAtLocal: string;
}) {
  const [selected, setSelected] = useState(0);
  const titleId = useId();
  const captionId = useId();
  const day = daily[selected] ?? daily[0];
  if (!day) return null;

  // Today starts at the hour of the current conditions; other days show all 24 hours.
  const firstHour = selected === 0 ? Number(validAtLocal.slice(11, 13)) : 0;
  const hours = Array.from({ length: 24 - firstHour }, (_, index) => firstHour + index);

  return (
    <section className="hourly-section" aria-labelledby={titleId}>
      <div className="hourly-inner">
        <h2 id={titleId}>Previsão por hora</h2>
        <div className="hourly-panel">
          <fieldset className="hourly-days">
            <legend className="hourly-picker-label">Escolher dia</legend>
            {daily.map((item, index) => (
              <button
                key={item.date}
                type="button"
                className="hourly-day"
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                {index === 0 ? 'Hoje' : compactDayLabel(item.date)}
              </button>
            ))}
          </fieldset>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: approved exception in CONSTRAINTS.md; keyboard users must reach this horizontally scrollable region (axe scrollable-region-focusable). */}
          <section className="hourly-scroll" aria-labelledby={captionId} tabIndex={0}>
            <table className="hourly-table">
              <caption id={captionId} className="visually-hidden">
                Previsão por hora de {dayLabel(day.date)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Medida</span>
                  </th>
                  {hours.map((hour) => (
                    <th scope="col" key={hour}>
                      {hourLabel(hour)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Temperatura</th>
                  {hours.map((hour) => (
                    <td key={hour}>
                      <HourlyValue value={day.hourly.temperatureC[hour] ?? null} unit="°C" />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Chuva na hora anterior</th>
                  {hours.map((hour) => (
                    <td key={hour}>
                      <HourlyValue value={day.hourly.precipitationMm[hour] ?? null} unit="mm" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
          <p className="hourly-note">
            A chuva de cada horário é o total previsto para a hora que termina nele.
          </p>
        </div>
      </div>
    </section>
  );
}
