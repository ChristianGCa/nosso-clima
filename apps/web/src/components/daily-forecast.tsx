import { useLayoutEffect, useRef } from 'react';
import type { Forecast } from '../api/forecast';
import rainVolumeIcon from '../assets/icons/raindrop-measure.svg';
import rainChanceIcon from '../assets/icons/umbrella.svg';
import { compactDayLabel, dayLabel, metric } from '../format/weather-format';
import { ConditionIcon } from './condition-icon';
import { HourlyDetails } from './hourly-forecast';

function MetricIcon({ source }: { source: string }) {
  return <img className="metric-icon" src={source} alt="" aria-hidden="true" />;
}

function TemperatureRange({ maximum, minimum }: { maximum: number; minimum: number }) {
  return (
    <span className="temperature-range">
      <span className="metric-reading">
        <span className="range-label">Máx.</span>
        <span>{metric(maximum, '°C')}</span>
      </span>
      <span className="metric-reading">
        <span className="range-label">Mín.</span>
        <span>{metric(minimum, '°C')}</span>
      </span>
    </span>
  );
}

/**
 * Keeps `--closed-card-height` on the strip: the height every card has while all hourly panels
 * are closed (rows share one height). The CSS uses it so that opening a panel grows only that
 * card. A width change while a panel is open makes the value stale, so it is dropped and the
 * other cards fall back to their own height until every panel is closed again.
 */
function useClosedCardHeight() {
  const stripRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    let measuredWidth: number | null = null;
    const observer = new ResizeObserver(() => {
      const card = strip.querySelector<HTMLElement>('.day-card');
      if (!strip.querySelector('.hourly-scroll') && card) {
        strip.style.setProperty('--closed-card-height', `${card.getBoundingClientRect().height}px`);
        measuredWidth = strip.clientWidth;
      } else if (strip.clientWidth !== measuredWidth) {
        strip.style.removeProperty('--closed-card-height');
        measuredWidth = null;
      }
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);
  return stripRef;
}

export function DailyForecast({
  daily,
  validAtLocal,
}: {
  daily: Forecast['daily'];
  validAtLocal: string;
}) {
  const stripRef = useClosedCardHeight();
  const [today, ...upcoming] = daily;
  if (!today) return null;
  // Today's card highlights the hour of the current conditions (same local date, validated).
  const currentHour = Number(validAtLocal.slice(11, 13));

  return (
    <section className="daily-section" aria-labelledby="daily-title">
      <div className="daily-inner">
        <h2 id="daily-title">Previsão de 7 dias</h2>
        <div className="daily-strip" ref={stripRef}>
          <article className="today-card">
            <h3 className="today-date">
              <span className="today-badge">HOJE</span>
              <span>{dayLabel(today.date)}</span>
            </h3>
            <div className="today-condition">
              <ConditionIcon category={today.condition.category} />
              <p>
                <span className="visually-hidden">Condição predominante</span>{' '}
                <strong>{today.condition.labelPt}</strong>
              </p>
            </div>
            <dl className="today-metrics">
              <div>
                <dt>Temperatura</dt>
                <dd>
                  <TemperatureRange
                    maximum={today.temperatureMaxC}
                    minimum={today.temperatureMinC}
                  />
                </dd>
              </div>
              <div>
                <dt>Sensação térmica</dt>
                <dd>
                  <TemperatureRange
                    maximum={today.apparentTemperatureMaxC}
                    minimum={today.apparentTemperatureMinC}
                  />
                </dd>
              </div>
              <div>
                <dt>Vento máximo</dt>
                <dd>{metric(today.windSpeedMaxKmh, 'km/h')}</dd>
              </div>
              <div>
                <dt>Chance de chuva</dt>
                <dd className="icon-value">
                  <MetricIcon source={rainChanceIcon} />
                  {metric(today.precipitationProbabilityMaxPercent, '%')}
                </dd>
              </div>
              <div>
                <dt>Volume de chuva</dt>
                <dd className="icon-value">
                  <MetricIcon source={rainVolumeIcon} />
                  {metric(today.precipitationSumMm, 'mm')}
                </dd>
              </div>
            </dl>
            {today.hourly && (
              <HourlyDetails date={today.date} hourly={today.hourly} currentHour={currentHour} />
            )}
          </article>
          {upcoming.map((day) => (
            <article className="day-card" key={day.date}>
              <h3>{compactDayLabel(day.date)}</h3>
              <div className="day-weather">
                <ConditionIcon category={day.condition.category} />
                <p className="day-condition">
                  <span className="visually-hidden">Condição predominante</span>{' '}
                  {day.condition.labelPt}
                </p>
              </div>
              <dl className="day-metrics">
                <div>
                  <dt className="visually-hidden">Temperatura</dt>
                  <dd>
                    <TemperatureRange maximum={day.temperatureMaxC} minimum={day.temperatureMinC} />
                  </dd>
                </div>
                <div>
                  <dt>Chance de chuva</dt>
                  <dd className="icon-value">
                    <MetricIcon source={rainChanceIcon} />
                    {metric(day.precipitationProbabilityMaxPercent, '%')}
                  </dd>
                </div>
                <div>
                  <dt>Volume de chuva</dt>
                  <dd className="icon-value">
                    <MetricIcon source={rainVolumeIcon} />
                    {metric(day.precipitationSumMm, 'mm')}
                  </dd>
                </div>
              </dl>
              {day.hourly && <HourlyDetails date={day.date} hourly={day.hourly} />}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
