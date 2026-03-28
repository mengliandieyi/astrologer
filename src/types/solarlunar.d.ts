declare module "solarlunar" {
  export type SolarToLunarResult = {
    gzYear: string;
    gzMonth: string;
    gzDay: string;
  };

  const api: {
    solar2lunar(year: number, month: number, day: number): SolarToLunarResult;
  };

  export default api;
}
