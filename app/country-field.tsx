"use client";

import { useMemo } from "react";

const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["es"], { type: "region" })
  : null;

export function countryName(code: string | null | undefined) {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return "Sin indicar";
  try {
    return regionNames?.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

export type CountryOption = { value: string; label: string };

export function countryOptions(): CountryOption[] {
  return COUNTRY_CODES
    .map((value) => ({ value, label: countryName(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
}

type CountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
};

export function CountrySelect({ value, onChange, name, disabled, required, id, "aria-label": ariaLabel }: CountrySelectProps) {
  const options = useMemo(countryOptions, []);
  const normalized = value.trim().toUpperCase();
  return <select
    id={id}
    name={name}
    value={normalized}
    disabled={disabled}
    required={required}
    aria-label={ariaLabel}
    onChange={(event) => onChange(event.target.value)}
  >
    <option value="">Seleccionar país</option>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}
