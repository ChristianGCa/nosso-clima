import type { Forecast } from '../api/forecast';
import rainVolumeIcon from '../assets/icons/raindrop-measure.svg';
import rainChanceIcon from '../assets/icons/umbrella.svg';
import { compactDayLabel, dayLabel, metric, uvRiskLabel } from '../format/weather-format';
import { ConditionIcon } from './condition-icon';

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

export function DailyForecast({ daily }: { daily: Forecast['daily'] }) {
  const [today, ...upcoming] = daily;
  if (!today) return null;

  return (
    <section className="daily-section" aria-labelledby="daily-title">
      <div className="daily-inner">
        <h2 id="daily-title">Previsão de 7 dias</h2>
        <div className="daily-strip">
          <article className="today-card">
            <h3 className="today-date">
              <span className="today-badge">HOJE</span>
              <span>{dayLabel(today.date)}</span>
            </h3>
            <div className="today-condition">
              <ConditionIcon category={today.condition.category} />
              <p>
                <span className="visually-hidden">Condição mais severa</span>
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
                <dt className="visually-hidden">Chance de chuva</dt>
                <dd className="icon-value">
                  <MetricIcon source={rainChanceIcon} />
                  {metric(today.precipitationProbabilityMaxPercent, '%')}
                </dd>
              </div>
              <div>
                <dt className="visually-hidden">Volume de chuva</dt>
                <dd className="icon-value">
                  <MetricIcon source={rainVolumeIcon} />
                  {metric(today.precipitationSumMm, 'mm')}
                </dd>
              </div>
              <div>
                <dt>Vento máximo</dt>
                <dd>{metric(today.windSpeedMaxKmh, 'km/h')}</dd>
              </div>
              <div className="today-uv">
                <dt>UV máximo</dt>
                <dd>{metric(today.uvIndexMax, '')}</dd>
                <dt>Risco UV</dt>
                <dd>{uvRiskLabel(today.uvRisk)}</dd>
              </div>
            </dl>
          </article>
          {upcoming.map((day) => (
            <article className="day-card" key={day.date}>
              <h3>{compactDayLabel(day.date)}</h3>
              <div className="day-weather">
                <ConditionIcon category={day.condition.category} />
                <p className="day-condition">
                  <span className="visually-hidden">Condição mais severa</span>{' '}
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
                  <dt className="visually-hidden">Chance de chuva</dt>
                  <dd className="icon-value">
                    <MetricIcon source={rainChanceIcon} />
                    {metric(day.precipitationProbabilityMaxPercent, '%')}
                  </dd>
                </div>
                <div>
                  <dt className="visually-hidden">Volume de chuva</dt>
                  <dd className="icon-value">
                    <MetricIcon source={rainVolumeIcon} />
                    {metric(day.precipitationSumMm, 'mm')}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
