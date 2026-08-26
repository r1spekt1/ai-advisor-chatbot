import { WeatherArgs, ToolResult } from "../schema/tools";
import { withCache, TTL } from "./cache";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function weatherCodeToCondition(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  if (code <= 99) return "thunderstorm";
  return "unknown";
}

export async function fetchWeather(rawArgs: unknown): Promise<ToolResult> {
  const parsed = WeatherArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
      data: null,
      error: parsed.error.message,
    };
  }
  const args = parsed.data;

  try {
    return await withCache("get_weather", args, TTL.weather, async () => {
      const geoUrl = new URL(GEOCODE_URL);
      geoUrl.searchParams.set("name", args.city);
      geoUrl.searchParams.set("count", "1");
      if (args.countryCode) {
        geoUrl.searchParams.set("country_code", args.countryCode);
      }

      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) {
        return {
          ok: false,
          source: "open-meteo",
          fetchedAt: new Date().toISOString(),
          data: null,
          error: `Geocoding request failed with status ${geoRes.status}`,
        };
      }
      const geoJson = await geoRes.json();
      const place = geoJson?.results?.[0];
      if (!place) {
        return {
          ok: false,
          source: "open-meteo",
          fetchedAt: new Date().toISOString(),
          data: null,
          error: `No location found for "${args.city}"`,
        };
      }

      const forecastUrl = new URL(FORECAST_URL);
      forecastUrl.searchParams.set("latitude", String(place.latitude));
      forecastUrl.searchParams.set("longitude", String(place.longitude));
      forecastUrl.searchParams.set(
        "daily",
        "temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code",
      );
      forecastUrl.searchParams.set("forecast_days", String(args.days));
      forecastUrl.searchParams.set("timezone", "auto");

      const forecastRes = await fetch(forecastUrl);
      if (!forecastRes.ok) {
        return {
          ok: false,
          source: "open-meteo",
          fetchedAt: new Date().toISOString(),
          data: null,
          error: `Forecast request failed with status ${forecastRes.status}`,
        };
      }
      const forecastJson = await forecastRes.json();
      const daily = forecastJson?.daily;
      if (!daily?.time) {
        return {
          ok: false,
          source: "open-meteo",
          fetchedAt: new Date().toISOString(),
          data: null,
          error: "Forecast response missing daily data",
        };
      }

      const days = daily.time.map((date: string, i: number) => ({
        date,
        minTemp: daily.temperature_2m_min[i],
        maxTemp: daily.temperature_2m_max[i],
        precipitationProbability: daily.precipitation_probability_max[i],
        condition: weatherCodeToCondition(daily.weather_code[i]),
      }));

      return {
        ok: true,
        source: "open-meteo",
        fetchedAt: new Date().toISOString(),
        data: {
          city: place.name,
          countryCode: place.country_code,
          days,
        },
        error: null,
      };
    });
  } catch (err) {
    return {
      ok: false,
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
      data: null,
      error: err instanceof Error ? err.message : "Unknown error fetching weather",
    };
  }
}
