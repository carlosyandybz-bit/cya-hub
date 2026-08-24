export type StaffPersonName = {
  display_name: string;
  internal_alias?: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

/** Staff-only presentation. Never use this resolver in student or outbound communication surfaces. */
export function staffPrimaryName(person: StaffPersonName) {
  return clean(person.internal_alias) || clean(person.display_name) || "Persona sin nombre";
}

export function staffRealNameWhenAliased(person: StaffPersonName) {
  const alias = clean(person.internal_alias);
  const realName = clean(person.display_name);
  return alias && realName && alias.localeCompare(realName, "es", { sensitivity: "base" }) !== 0 ? realName : null;
}

export function staffPersonMatches(person: StaffPersonName & { phone?: string | null; email?: string | null }, query: string) {
  const needle = query.trim().toLocaleLowerCase("es");
  if (!needle) return true;
  return [person.internal_alias, person.display_name, person.phone, person.email]
    .some((value) => clean(value).toLocaleLowerCase("es").includes(needle));
}
