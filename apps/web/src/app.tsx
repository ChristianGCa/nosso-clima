import { CitySearch } from './components/city-search';
import { ForecastStatus } from './components/forecast-state';
import { SiteInformation } from './components/site-information';
import { useForecast } from './hooks/use-forecast';
import { useWeatherBackground } from './hooks/use-weather-background';

export function App() {
  const forecast = useForecast();
  const background = useWeatherBackground(forecast.state);
  return (
    <div
      className={`site-shell${background ? ' has-image' : ''}`}
      style={background ? { backgroundImage: `url("${background}")` } : undefined}
    >
      <header className="site-header" id="inicio">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Nosso Clima, início">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" focusable="false">
                <title>Marca do Nosso Clima</title>
                <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2" />
                <path d="M5 19h22M8 24h16" stroke="currentColor" strokeWidth="2" />
                <circle cx="16" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span>nosso clima</span>
          </a>
          <CitySearch onSelect={forecast.choose} />
        </div>
      </header>
      <main className={`main-content${forecast.state.status === 'ready' ? '' : ' has-state'}`}>
        <ForecastStatus state={forecast.state} onRetry={forecast.retry} />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-about">
            <strong>Nosso Clima</strong>
            <p>Condições atuais e previsão para sete dias.</p>
          </div>
          {forecast.state.status !== 'idle' && (
            <p className="attribution forecast-attribution">
              Dados por{' '}
              <a
                href={
                  forecast.state.status === 'ready'
                    ? forecast.state.forecast.attribution.providerUrl
                    : 'https://open-meteo.com/'
                }
              >
                Open-Meteo
              </a>
              , com localidades de <a href="https://www.geonames.org/">GeoNames</a>. Dados adaptados
              pelo Nosso Clima sob{' '}
              <a
                href={
                  forecast.state.status === 'ready'
                    ? forecast.state.forecast.attribution.licenseUrl
                    : 'https://creativecommons.org/licenses/by/4.0/'
                }
              >
                CC BY 4.0
              </a>
              .
            </p>
          )}
        </div>
        <SiteInformation />
      </footer>
    </div>
  );
}
