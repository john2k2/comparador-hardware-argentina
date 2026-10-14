// SQL determinístico: Date.parse trunca submilisegundos; strftime los redondea.
// Truncar sólo una fracción ISO de más de tres dígitos ANTES de aplicar el offset.
// El valor original en row_json nunca se reemplaza por esta representación.
export function observationTimeSql(raw = "json_extract(row_json,'$.last_updated')") {
  return `strftime('%Y-%m-%dT%H:%M:%fZ',CASE WHEN substr(${raw},20,1)='.' AND substr(${raw},21,4) GLOB '[0-9][0-9][0-9][0-9]' THEN substr(${raw},1,23)||ltrim(substr(${raw},24),'0123456789') ELSE ${raw} END)`;
}

export function legacyObservationTimeSql(raw = "json_extract(row_json,'$.last_updated')") {
  return `strftime('%Y-%m-%dT%H:%M:%fZ',${raw})`;
}

export function hasObservationClockCertificate(value, offers) {
  return value && typeof value === 'object' && !Array.isArray(value) && value.validated === true
    && Number.isSafeInteger(offers) && offers >= 0 && value.offers === offers
    && (value.version === 1 && value.timestampPolicy === 'js-sql-ms-v1'
      || value.version === 2 && value.timestampPolicy === 'js-sql-ms-v2');
}
