export const SAMPLE_WEATHER = {
  success: true,
  source: "demo",
  notice:
    "Sample weather for the demo. Live weather is unavailable; check a current forecast before heading out.",
  timezone: "UTC",
  current: {
    tempC: 21,
    tempF: 70,
    apparentTempC: 21,
    condition: "Partly cloudy",
    icon: "⛅",
    precipitationMm: 0,
    humidity: 52,
    windSpeedKmH: 8,
    advice: "Sample forecast. Check a current forecast before heading out.",
  },
  hourly: [
    {
      time: "09:00",
      tempC: 19,
      tempF: 66,
      condition: "Partly cloudy",
      icon: "⛅",
      precipProb: 10,
      tip: "Sample forecast.",
    },
    {
      time: "12:00",
      tempC: 22,
      tempF: 72,
      condition: "Partly cloudy",
      icon: "⛅",
      precipProb: 15,
      tip: "Sample forecast.",
    },
    {
      time: "15:00",
      tempC: 23,
      tempF: 73,
      condition: "Partly cloudy",
      icon: "⛅",
      precipProb: 15,
      tip: "Sample forecast.",
    },
    {
      time: "18:00",
      tempC: 20,
      tempF: 68,
      condition: "Partly cloudy",
      icon: "⛅",
      precipProb: 10,
      tip: "Sample forecast.",
    },
  ],
  daily: { maxC: 23, minC: 16 },
};

export function weatherCondition(code: number): {
  condition: string;
  icon: string;
  tip: string;
} {
  if (code === 0)
    return {
      condition: "Clear sky",
      icon: "☀️",
      tip: "A good time for an outdoor walk. Bring water and sun protection.",
    };
  if (code <= 2)
    return {
      condition: code === 1 ? "Mainly clear" : "Partly cloudy",
      icon: "⛅",
      tip: "Check the hourly rain probability before heading out.",
    };
  if (code === 3)
    return {
      condition: "Overcast",
      icon: "☁️",
      tip: "Cloudy skies. A neighborhood walk or a museum both work well.",
    };
  if (code === 45 || code === 48)
    return {
      condition: "Fog",
      icon: "🌫️",
      tip: "Visibility may be reduced. Take care near roads.",
    };
  if ([51, 53, 55, 56, 57].includes(code))
    return {
      condition: "Drizzle",
      icon: "🌦️",
      tip: "Carry an umbrella and keep a covered stop in mind.",
    };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return {
      condition: "Rain",
      icon: "🌧️",
      tip: "An indoor stop may be more comfortable. Check for local weather alerts.",
    };
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return {
      condition: "Snow",
      icon: "❄️",
      tip: "Wear warm layers and shoes with grip.",
    };
  if ([95, 96, 99].includes(code))
    return {
      condition: "Thunderstorm",
      icon: "⛈️",
      tip: "Stay indoors and check local weather alerts before traveling.",
    };
  return {
    condition: "Conditions unavailable",
    icon: "☁️",
    tip: "Check a current local forecast.",
  };
}

export function normalizeWeather(data: any) {
  if (
    !Number.isFinite(data.current?.temperature_2m) ||
    !Array.isArray(data.hourly?.time) ||
    !Number.isFinite(data.daily?.temperature_2m_max?.[0])
  )
    throw new Error("Invalid weather response.");
  const current = data.current;
  const info = weatherCondition(current.weather_code);
  const tempC = Math.round(current.temperature_2m);
  const hourAnchor = String(current.time || "").slice(0, 13);
  let startIndex = data.hourly.time.findIndex(
    (time: string) => time.slice(0, 13) >= hourAnchor,
  );
  if (startIndex < 0) startIndex = 0;
  return {
    success: true,
    source: "open-meteo",
    notice:
      "Weather forecast from Open-Meteo. Conditions can change; check local alerts for severe weather.",
    timezone: data.timezone || "UTC",
    fetchedAt: new Date().toISOString(),
    current: {
      tempC,
      tempF: Math.round((tempC * 9) / 5 + 32),
      apparentTempC: Math.round(current.apparent_temperature ?? tempC),
      condition: info.condition,
      icon: info.icon,
      precipitationMm: current.precipitation ?? 0,
      humidity: current.relative_humidity_2m ?? 0,
      windSpeedKmH: Math.round(current.wind_speed_10m ?? 0),
      advice: info.tip,
    },
    hourly: data.hourly.time
      .slice(startIndex, startIndex + 24)
      .map((time: string, offset: number) => {
        const index = startIndex + offset;
        const hInfo = weatherCondition(data.hourly.weather_code?.[index]);
        const hTemp = Math.round(data.hourly.temperature_2m?.[index] ?? tempC);
        return {
          time: time.slice(11, 16),
          dateTime: time,
          tempC: hTemp,
          tempF: Math.round((hTemp * 9) / 5 + 32),
          condition: hInfo.condition,
          icon: hInfo.icon,
          precipProb: data.hourly.precipitation_probability?.[index] ?? 0,
          tip: hInfo.tip,
        };
      }),
    daily: {
      maxC: Math.round(data.daily.temperature_2m_max[0]),
      minC: Math.round(data.daily.temperature_2m_min[0]),
    },
  };
}
