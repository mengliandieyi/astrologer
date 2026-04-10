type AmapCast = {
  date: string; // YYYY-MM-DD
  dayweather: string;
  nightweather: string;
  daytemp: string;
  nighttemp: string;
  daywind?: string;
  nightwind?: string;
  daypower?: string;
  nightpower?: string;
};

type AmapLive = {
  province?: string;
  city?: string;
  adcode?: string;
  weather?: string;
  temperature?: string;
  winddirection?: string;
  windpower?: string;
  humidity?: string;
  reporttime?: string;
};

function key(): string {
  return String(process.env.AMAP_WEB_KEY || "").trim();
}

export type AmapDailyWeather = {
  date: string;
  textDay: string;
  textNight: string;
  tempMax: string;
  tempMin: string;
};

export async function getAmapLiveWeather(cityOrAdcode: string): Promise<AmapLive | null> {
  const k = key();
  if (!k) return null;
  const city = String(cityOrAdcode || "").trim();
  if (!city) return null;

  const url = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
  url.searchParams.set("key", k);
  url.searchParams.set("city", city);
  url.searchParams.set("extensions", "base");

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const live = json?.lives?.[0];
    if (!live) return null;
    return {
      province: live?.province,
      city: live?.city,
      adcode: live?.adcode,
      weather: live?.weather,
      temperature: live?.temperature,
      winddirection: live?.winddirection,
      windpower: live?.windpower,
      humidity: live?.humidity,
      reporttime: live?.reporttime,
    } as AmapLive;
  } catch {
    return null;
  }
}

export async function getAmapForecast4d(cityOrAdcode: string): Promise<AmapDailyWeather[] | null> {
  const k = key();
  if (!k) return null;
  const city = String(cityOrAdcode || "").trim();
  if (!city) return null;

  const url = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
  url.searchParams.set("key", k);
  url.searchParams.set("city", city);
  url.searchParams.set("extensions", "all");

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const casts: AmapCast[] | undefined = json?.forecasts?.[0]?.casts;
    if (!Array.isArray(casts) || casts.length === 0) return null;

    return casts
      .map((c) => {
        const max = String(c.daytemp || "").trim();
        const min = String(c.nighttemp || "").trim();
        return {
          date: String(c.date || "").trim(),
          textDay: String(c.dayweather || "").trim(),
          textNight: String(c.nightweather || "").trim(),
          tempMax: max,
          tempMin: min,
        } as AmapDailyWeather;
      })
      .filter((d) => d.date && d.textDay && d.tempMax && d.tempMin);
  } catch {
    return null;
  }
}

export async function getAmapWeatherForTrip(
  cityOrAdcode: string,
  startDate: string,
  endDate: string
): Promise<AmapDailyWeather[] | null> {
  const s = String(startDate || "").trim();
  const e = String(endDate || "").trim();
  const list = await getAmapForecast4d(cityOrAdcode);
  if (!list) return null;
  if (!s || !e) return list;
  return list.filter((d) => d.date >= s && d.date <= e);
}

