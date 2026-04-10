// 和风天气 API 封装
// 文档：https://dev.qweather.com/docs/api/

const DEFAULT_API_HOST = "https://api.qweather.com";
function getApiHost(): string {
  return String(process.env.QWEATHER_API_HOST || DEFAULT_API_HOST).replace(/\/+$/g, "");
}

function getBearerToken(): string {
  return String(process.env.QWEATHER_BEARER_TOKEN || "").trim();
}

function getLegacyKey(): string {
  return String(process.env.QWEATHER_KEY || "").trim();
}

export type WeatherData = {
  temp: string;       // 温度
  feelsLike: string;  // 体感温度
  text: string;       // 天气状况
  windDir: string;    // 风向
  windScale: string;  // 风力等级
  humidity: string;   // 湿度
  precip: string;     // 降水量
  pressure: string;   // 气压
  vis: string;        // 能见度
};

export type WeatherForecast = {
  date: string;       // 日期
  tempMax: string;    // 最高温
  tempMin: string;    // 最低温
  textDay: string;    // 白天天气
  textNight: string;  // 夜间天气
  windDir: string;    // 风向
  windScale: string;  // 风力
};

// 城市搜索 - 获取城市 ID
async function getCityId(cityName: string): Promise<string | null> {
  try {
    const apiHost = getApiHost();
    const legacyKey = getLegacyKey();
    const bearer = getBearerToken();

    // 1) Try legacy key-based GeoAPI (older accounts).
    if (legacyKey) {
      const url = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(cityName)}&key=${legacyKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.code === "200" && data.location?.length > 0) return data.location[0].id;
      }
    }

    // 2) Try JWT Bearer GeoAPI v2 (current docs): /geo/v2/city/lookup
    if (bearer) {
      const url = `${apiHost}/geo/v2/city/lookup?location=${encodeURIComponent(cityName)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.code === "200" && data.location?.length > 0) return data.location[0].id;
      }
    }

    return null;
  } catch (err) {
    console.error("QWeather city lookup error:", err);
    return null;
  }
}

// 获取实时天气
export async function getCurrentWeather(cityName: string): Promise<WeatherData | null> {
  const key = getLegacyKey();
  const bearer = getBearerToken();
  const apiHost = getApiHost();
  if (!key && !bearer) return null;

  const cityId = await getCityId(cityName);
  if (!cityId) return null;

  try {
    const url = key
      ? `${apiHost}/v7/weather/now?location=${cityId}&key=${key}`
      : `${apiHost}/v7/weather/now?location=${cityId}`;
    const res = await fetch(url, bearer && !key ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
    const data = await res.json();

    if (data.code === "200" && data.now) {
      return {
        temp: data.now.temp,
        feelsLike: data.now.feelsLike,
        text: data.now.text,
        windDir: data.now.windDir,
        windScale: data.now.windScale,
        humidity: data.now.humidity,
        precip: data.now.precip,
        pressure: data.now.pressure,
        vis: data.now.vis,
      };
    }
    return null;
  } catch (err) {
    console.error("QWeather current error:", err);
    return null;
  }
}

// 获取 7 天预报
export async function getWeatherForecast(cityName: string): Promise<WeatherForecast[] | null> {
  const key = getLegacyKey();
  const bearer = getBearerToken();
  const apiHost = getApiHost();
  if (!key && !bearer) return null;

  const cityId = await getCityId(cityName);
  if (!cityId) return null;

  try {
    const url = key
      ? `${apiHost}/v7/weather/7d?location=${cityId}&key=${key}`
      : `${apiHost}/v7/weather/7d?location=${cityId}`;
    const res = await fetch(url, bearer && !key ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
    const data = await res.json();

    if (data.code === "200" && data.daily) {
      return data.daily.map((d: any) => ({
        date: d.fxDate,
        tempMax: d.tempMax,
        tempMin: d.tempMin,
        textDay: d.textDay,
        textNight: d.textNight,
        windDir: d.windDir,
        windScale: d.windScale,
      }));
    }
    return null;
  } catch (err) {
    console.error("QWeather forecast error:", err);
    return null;
  }
}

// 获取指定日期范围的天气（用于行程规划）
export async function getWeatherForTrip(
  cityName: string,
  startDate: string,
  endDate: string
): Promise<WeatherForecast[] | null> {
  const forecast = await getWeatherForecast(cityName);
  if (!forecast) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);

  return forecast.filter((d) => {
    const date = new Date(d.date);
    return date >= start && date <= end;
  });
}
