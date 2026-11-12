// TLE embebidos de respaldo (CelesTrak GP, descargados el 2026-11-12T14:10Z).
// Solo se usan si CelesTrak no responde. La precisión de SGP4 se degrada con la edad del
// TLE (~1-3 km/día en LEO): con semanas de antigüedad los horarios de pasada pueden
// correrse minutos. Regenerar antes de una demo:
//   curl "https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=TLE"
export const TLE_FALLBACK_DATE = "2026-11-12T14:10Z";

export const TLE_FALLBACK: Record<number, readonly [string, string]> = {
  // NOAA 20 (JPSS-1)
  43013: [
    "1 43013U 17073A   26316.23292977  .00000082  00000+0  59822-4 0  9997",
    "2 43013  98.7923 254.4576 0001110 132.0409 228.0862 14.19536532465479",
  ],
  // NOAA 21 (JPSS-2)
  54234: [
    "1 54234U 22150A   26316.26339837  .00000068  00000+0  52769-4 0  9993",
    "2 54234  98.7203 252.6323 0002620 114.2731 245.8719 14.19558424207559",
  ],
  // SUOMI NPP
  37849: [
    "1 37849U 11061A   26316.21894400  .00000086  00000+0  61919-4 0  9999",
    "2 37849  98.8114 256.1684 0000680 255.6105 104.4996 14.19542578779444",
  ],
  // AQUA
  27424: [
    "1 27424U 02022A   26316.21244909  .00000859  00000+0  18006-3 0  9993",
    "2 27424  98.4489 288.6160 0001099 107.4003 344.1703 14.62276057304906",
  ],
  // TERRA
  25994: [
    "1 25994U 99068A   26316.21116685  .00000375  00000+0  85203-4 0  9995",
    "2 25994  97.9267 359.7476 0003509 112.3389 322.1595 14.61195464431226",
  ],
};
