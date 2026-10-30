import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, Wind } from 'lucide-react';
import { useNow } from '../hooks/useNow';

interface WeatherReading {
  tempF: number;
  code: number;
  windMph: number;
  isDay: boolean;
}
interface CurrentWeather {
  timezone?: string;
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
}

function weatherKind(code: number, windMph: number): string {
  if (code >= 95) return 'STORMS';
  if (code >= 71 && code <= 86) return 'SNOW';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'RAIN';
  if (code >= 45 && code <= 48) return 'FOG';
  if (windMph >= 25) return 'WINDY';
  if (code === 3) return 'CLOUDY';
  if (code === 1 || code === 2) return 'PARTLY';
  return 'CLEAR';
}

function WeatherIcon({ reading }: { reading: WeatherReading | null }) {
  if (!reading) return <CloudSun size={23} aria-hidden="true" />;
  const kind = weatherKind(reading.code, reading.windMph);
  if (kind === 'STORMS') return <CloudLightning size={23} aria-hidden="true" />;
  if (kind === 'SNOW') return <CloudSnow size={23} aria-hidden="true" />;
  if (kind === 'RAIN') return <CloudRain size={23} aria-hidden="true" />;
  if (kind === 'FOG') return <CloudFog size={23} aria-hidden="true" />;
  if (kind === 'WINDY') return <Wind size={23} aria-hidden="true" />;
  if (kind === 'CLOUDY') return <Cloud size={23} aria-hidden="true" />;
  if (kind === 'PARTLY') return reading.isDay ? <CloudSun size={23} aria-hidden="true" /> : <CloudMoon size={23} aria-hidden="true" />;
  return reading.isDay ? <Sun size={23} aria-hidden="true" /> : <Moon size={23} aria-hidden="true" />;
}

/** Uses the viewer's browser timezone by default and their coordinates only after geolocation permission. */
export function LocationClockWeather() {
  const now = useNow(1000);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const coords = useRef<{ latitude: number; longitude: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const updateWeather = useCallback(async (latitude: number, longitude: number) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    const params = new URLSearchParams({
      latitude: latitude.toFixed(4),
      longitude: longitude.toFixed(4),
      current: 'temperature_2m,weather_code,wind_speed_10m,is_day',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: 'auto',
      forecast_days: '1',
    });
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: next.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Current weather is unavailable');
      const json = (await response.json()) as CurrentWeather;
      const current = json.current;
      if (!current || !Number.isFinite(current.temperature_2m)) throw new Error('Temperature not reported');
      if (!mounted.current || next.signal.aborted) return;
      setWeather({
        tempF: Math.round(current.temperature_2m!),
        code: Number.isFinite(current.weather_code) ? current.weather_code! : 0,
        windMph: Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m! : 0,
        isDay: current.is_day === 1,
      });
      if (json.timezone) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: json.timezone }).format(new Date());
          setTimeZone(json.timezone);
        } catch { /* Device timezone remains the safe fallback. */ }
      }
      setWeatherStatus('ready');
    } catch (error) {
      if (!mounted.current || next.signal.aborted) return;
      setWeatherStatus('unavailable');
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) { setWeatherStatus('unavailable'); return; }
    setWeatherStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        coords.current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        void updateWeather(position.coords.latitude, position.coords.longitude);
      },
      () => { if (mounted.current) setWeatherStatus('unavailable'); },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 },
    );
  }, [updateWeather]);

  useEffect(() => {
    mounted.current = true;
    requestLocation();
    const interval = window.setInterval(() => {
      const position = coords.current;
      if (position) void updateWeather(position.latitude, position.longitude);
    }, 20 * 60 * 1000);
    return () => { mounted.current = false; controller.current?.abort(); window.clearInterval(interval); };
  }, [requestLocation, updateWeather]);

  const date = new Date(now);
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
  const localZone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'LOCAL';
  const description = weather ? weatherKind(weather.code, weather.windMph) : weatherStatus === 'loading' ? 'LOCATING' : 'ALLOW LOC';

  return (
    <div className="topbar__local-widget" aria-label="Local time and current location weather">
      <div className="topbar__local-clock" title={`Local time in ${timeZone}`}>
        <time dateTime={date.toISOString()}>{localTime}</time>
        <small>{localZone} · LOCAL TIME</small>
      </div>
      <button type="button" className="topbar__weather" onClick={requestLocation}
        title={weather ? `${description}, ${weather.tempF}°F · ${Math.round(weather.windMph)} mph wind · Weather: Open-Meteo` : 'Allow location access to show current local weather'}
        aria-label={weather ? `Current weather: ${description}, ${weather.tempF} degrees Fahrenheit; refresh weather` : 'Enable local weather by allowing browser location access'}>
        <span className="topbar__weather-icon"><WeatherIcon reading={weather} /></span>
        <strong>{weather ? `${weather.tempF}°F` : '—°F'}</strong>
        <small>{description}</small>
      </button>
    </div>
  );
}
