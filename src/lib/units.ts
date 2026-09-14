export function formatUnitNumber(
  template: string,
  wing: string,
  floor: number,
  unit: number,
) {
  return template
    .replaceAll("[Wing]", wing)
    .replaceAll("[Floor:2]", String(floor).padStart(2, "0"))
    .replaceAll("[Unit:2]", String(unit).padStart(2, "0"))
    .replaceAll("[Floor]", String(floor))
    .replaceAll("[Unit]", String(unit).padStart(2, "0"));
}
