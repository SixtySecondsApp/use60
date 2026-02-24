import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Globe, X, Search } from 'lucide-react';
import {
  searchCities,
  searchCountries,
  getTradeZoneCountries,
  type TradeZone,
} from '@/lib/services/aiArkReferenceService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationValue {
  cities: string[];
  countries: string[];
}

interface AiArkLocationPickerProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  className?: string;
}

type ActiveTab = 'cities' | 'countries';

interface CountryResult {
  name: string;
  iso2: string;
  region: string;
  subregion: string;
}

const TRADE_ZONES: TradeZone[] = ['G7', 'G20', 'EU', 'APEC', 'LATAM', 'MENA'];

// ─── Component ────────────────────────────────────────────────────────────────

export function AiArkLocationPicker({ value, onChange, className }: AiArkLocationPickerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('cities');
  const [cityQuery, setCityQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── City helpers ──────────────────────────────────────────────────────────

  const citySuggestions = cityQuery.trim()
    ? searchCities(cityQuery, 10).filter((c) => !value.cities.includes(c))
    : [];

  const addCity = useCallback(
    (city: string) => {
      if (!value.cities.includes(city)) {
        onChange({ ...value, cities: [...value.cities, city] });
      }
      setCityQuery('');
      setShowCityDropdown(false);
    },
    [value, onChange],
  );

  const removeCity = useCallback(
    (city: string) => {
      onChange({ ...value, cities: value.cities.filter((c) => c !== city) });
    },
    [value, onChange],
  );

  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (citySuggestions.length > 0) {
        addCity(citySuggestions[0]);
      } else if (cityQuery.trim()) {
        addCity(cityQuery.trim());
      }
    } else if (e.key === 'Backspace' && !cityQuery && value.cities.length > 0) {
      onChange({ ...value, cities: value.cities.slice(0, -1) });
    } else if (e.key === 'Escape') {
      setShowCityDropdown(false);
    }
  };

  // ─── Country helpers ───────────────────────────────────────────────────────

  const countryResults: CountryResult[] = searchCountries(countryQuery, 50);

  // Group country results by region
  const groupedCountries = countryResults.reduce<Record<string, CountryResult[]>>((acc, c) => {
    const key = c.region || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const addCountry = useCallback(
    (countryName: string) => {
      if (!value.countries.includes(countryName)) {
        onChange({ ...value, countries: [...value.countries, countryName] });
      }
    },
    [value, onChange],
  );

  const removeCountry = useCallback(
    (countryName: string) => {
      onChange({ ...value, countries: value.countries.filter((c) => c !== countryName) });
    },
    [value, onChange],
  );

  const toggleCountry = useCallback(
    (countryName: string) => {
      if (value.countries.includes(countryName)) {
        removeCountry(countryName);
      } else {
        addCountry(countryName);
      }
    },
    [value.countries, addCountry, removeCountry],
  );

  // Trade zone helpers
  const isZoneSelected = useCallback(
    (zone: TradeZone): boolean => {
      const zoneCountries = getTradeZoneCountries(zone);
      return (
        zoneCountries.length > 0 &&
        zoneCountries.every((c) => value.countries.includes(c.name))
      );
    },
    [value.countries],
  );

  const toggleZone = useCallback(
    (zone: TradeZone) => {
      const zoneCountries = getTradeZoneCountries(zone);
      const zoneNames = zoneCountries.map((c) => c.name);
      if (isZoneSelected(zone)) {
        // Deselect all zone countries
        onChange({
          ...value,
          countries: value.countries.filter((c) => !zoneNames.includes(c)),
        });
      } else {
        // Select all zone countries (merge, dedup)
        const merged = Array.from(new Set([...value.countries, ...zoneNames]));
        onChange({ ...value, countries: merged });
      }
    },
    [value, onChange, isZoneSelected],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasSelections = value.cities.length > 0 || value.countries.length > 0;

  return (
    <div ref={containerRef} className={className}>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Locations</label>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setActiveTab('cities')}
          className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
            activeTab === 'cities'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          Cities
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('countries')}
          className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
            activeTab === 'countries'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          Countries / Regions
        </button>
      </div>

      {/* Cities tab */}
      {activeTab === 'cities' && (
        <div className="relative">
          <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value);
                setShowCityDropdown(true);
              }}
              onFocus={() => {
                if (cityQuery.trim()) setShowCityDropdown(true);
              }}
              onKeyDown={handleCityKeyDown}
              placeholder="Search cities..."
              className="flex-1 min-w-[120px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>

          {/* City dropdown */}
          {showCityDropdown && citySuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-[300px] overflow-y-auto">
              {citySuggestions.map((city) => {
                const idx = city.toLowerCase().indexOf(cityQuery.toLowerCase());
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => addCity(city)}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors flex items-center gap-2"
                  >
                    <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                    {idx >= 0 ? (
                      <span>
                        <span className="text-zinc-500">{city.slice(0, idx)}</span>
                        <span className="text-white font-medium">
                          {city.slice(idx, idx + cityQuery.length)}
                        </span>
                        <span className="text-zinc-500">{city.slice(idx + cityQuery.length)}</span>
                      </span>
                    ) : (
                      city
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Countries / Regions tab */}
      {activeTab === 'countries' && (
        <div>
          {/* Trade zone chips */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TRADE_ZONES.map((zone) => {
              const selected = isZoneSelected(zone);
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => toggleZone(zone)}
                  className={`text-xs px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                    selected
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {zone}
                </button>
              );
            })}
          </div>

          {/* Country search */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={countryQuery}
                onChange={(e) => {
                  setCountryQuery(e.target.value);
                  setShowCountryDropdown(true);
                }}
                onFocus={() => setShowCountryDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowCountryDropdown(false);
                }}
                placeholder="Search countries..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            {/* Country dropdown */}
            {showCountryDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-[300px] overflow-y-auto">
                {Object.entries(groupedCountries).map(([region, regionCountries]) => (
                  <div key={region}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-3 py-1.5 sticky top-0 bg-zinc-800">
                      {region}
                    </div>
                    {regionCountries.map((country) => {
                      const selected = value.countries.includes(country.name);
                      return (
                        <button
                          key={country.iso2}
                          type="button"
                          onClick={() => toggleCountry(country.name)}
                          className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors flex items-center gap-2"
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                              selected
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-zinc-600'
                            }`}
                          >
                            {selected && (
                              <svg viewBox="0 0 10 8" className="w-2 h-2 text-white fill-current">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="flex-1">{country.name}</span>
                          <span className="text-zinc-600 text-[10px]">{country.iso2}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {Object.keys(groupedCountries).length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-zinc-500">
                    No countries found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected chips */}
      {hasSelections && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.cities.map((city) => (
            <span
              key={city}
              className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300 border border-blue-500/30"
            >
              <MapPin className="w-3 h-3 shrink-0" />
              {city}
              <button
                type="button"
                onClick={() => removeCity(city)}
                className="text-blue-400 hover:text-blue-200 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {value.countries.map((country) => (
            <span
              key={country}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-500/30"
            >
              <Globe className="w-3 h-3 shrink-0" />
              {country}
              <button
                type="button"
                onClick={() => removeCountry(country)}
                className="text-emerald-400 hover:text-emerald-200 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
