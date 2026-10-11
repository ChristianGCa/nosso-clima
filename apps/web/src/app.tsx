import { useCallback, useState } from 'react';
import { CitySearch } from './components/city-search';
import { ForecastStatus } from './components/forecast-state';
import { SiteInformationDialog } from './components/site-information';
import logoEscuro from './assets/brand/logo-escuro.svg';
import { useForecast } from './hooks/use-forecast';
import { useWeatherBackground } from './hooks/use-weather-background';

export function App() {
  const forecast = useForecast();
  const background = useWeatherBackground(forecast.state);
  const [informationOpen, setInformationOpen] = useState(false);
  const openInformation = useCallback(() => setInformationOpen(true), []);
  const closeInformation = useCallback(() => setInformationOpen(false), []);
  return (
    <div
      className={`site-shell${background ? ' has-image' : ''}`}
      style={background ? { backgroundImage: `url("${background}")` } : undefined}
    >
      <header className="site-header" id="inicio">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="NossoClima, início">
            <img className="brand-logo" src={logoEscuro} alt="" />
          </a>
          <CitySearch onSelect={forecast.choose} />
        </div>
      </header>
      <main className={`main-content${forecast.state.status === 'ready' ? '' : ' has-state'}`}>
        <ForecastStatus
          state={forecast.state}
          onRetry={forecast.retry}
          onOpenInformation={openInformation}
        />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-about">
            <strong>NossoClima</strong>
            <p>Condições atuais e previsão para sete dias.</p>
            <button type="button" className="footer-information" onClick={openInformation}>
              Privacidade e créditos
            </button>
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
              pelo NossoClima sob{' '}
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
      </footer>
      <SiteInformationDialog open={informationOpen} onClose={closeInformation} />
    </div>
  );
}
