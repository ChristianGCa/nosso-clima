import { useState, type KeyboardEvent } from 'react';
import type { Location } from '../api/locations';
import { useLocationSearch } from '../hooks/use-location-search';

export function locationLabel(location: Location): string {
  return [location.name, location.region, location.country].filter(Boolean).join(', ');
}

type CitySearchProps = { onSelect: (location: Location) => void };

export function CitySearch({ onSelect }: CitySearchProps) {
  const search = useLocationSearch();
  const [active, setActive] = useState(-1);
  const locations = search.state.status === 'ready' ? search.state.result.locations : [];
  const open = locations.length > 0;

  function choose(location: Location) {
    search.choose(location.name);
    setActive(-1);
    onSelect(location);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      search.close();
      setActive(-1);
    } else if (open && event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % locations.length);
    } else if (open && event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? locations.length - 1 : index - 1));
    } else if (open && event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const location = locations[active];
      if (location) choose(location);
    }
  }

  return (
    <div className="city-search">
      <label className="search-label" htmlFor="city-search">
        Buscar cidade
      </label>
      <div className="search-field">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" focusable="false">
          <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="m15.5 15.5 4.2 4.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <input
          id="city-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="city-options"
          aria-activedescendant={active >= 0 && open ? `city-option-${active}` : undefined}
          autoComplete="off"
          placeholder="Nome da cidade"
          value={search.query}
          onChange={(event) => {
            search.edit(event.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="search-feedback" role="status" aria-live="polite">
        {search.state.status === 'loading' && 'Buscando cidades…'}
        {search.state.status === 'ready' &&
          (locations.length === 0
            ? 'Nenhuma cidade encontrada.'
            : `${locations.length} ${locations.length === 1 ? 'cidade encontrada' : 'cidades encontradas'}.`)}
        {search.state.status === 'error' && (
          <span>
            {search.state.failure.kind === 'rate_limited'
              ? 'Muitas buscas agora. Tente novamente em instantes.'
              : 'A busca está temporariamente indisponível.'}{' '}
            <button type="button" onClick={search.retry}>
              Tentar novamente
            </button>
          </span>
        )}
      </div>
      {open && (
        <div
          id="city-options"
          className="city-options"
          role="listbox"
          aria-label="Cidades encontradas"
        >
          {locations.map((location, index) => (
            <button
              id={`city-option-${index}`}
              role="option"
              aria-selected={active === index}
              className="city-option"
              type="button"
              key={location.id}
              onClick={() => choose(location)}
              onMouseEnter={() => setActive(index)}
            >
              {locationLabel(location)}
            </button>
          ))}
        </div>
      )}
      {search.state.status === 'ready' && (
        <p className="attribution search-attribution">
          Busca por <a href={search.state.result.attribution.providerUrl}>Open-Meteo</a> e{' '}
          <a href={search.state.result.attribution.sourceUrl}>GeoNames</a>. Dados adaptados pelo
          Nosso Clima sob <a href={search.state.result.attribution.licenseUrl}>CC BY 4.0</a>.
        </p>
      )}
    </div>
  );
}
