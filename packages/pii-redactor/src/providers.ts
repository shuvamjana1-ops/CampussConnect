/** One person's name from the Tenant directory, in Latin and Devanagari script. */
export interface GazetteerName {
  /** Latin-script form, for example "Rahul Kumar Sharma". */
  readonly latin?: string | undefined;
  /** Devanagari form, for example "राहुल कुमार शर्मा". */
  readonly devanagari?: string | undefined;
}

/** The Tenant's directory names used by the NAME detector. */
export interface Gazetteer {
  /**
   * Changes whenever `names` changes. Workers cache the compiled matcher per Tenant and version, so the
   * names are sent to a staff only when it does not hold that version yet.
   */
  readonly version: string;
  readonly names: readonly GazetteerName[];
}

/** Supplies the Tenant's directory names (Latin and Devanagari forms) to the NAME detector. */
export interface GazetteerProvider {
  load(tenantId: string): Promise<Gazetteer>;
}

/** Supplies the Tenant's enrolment-number patterns, configured from the ERP format, to the ROLL_NO detector. */
export interface RollNumberPatternProvider {
  /** RE2-syntax patterns. They are matched case-insensitively, and the whole match is redacted. */
  patternsFor(tenantId: string): Promise<readonly string[]>;
}

let staticGazetteerCount = 0;

/** In-memory gazetteer for tests, local development and fixed directories. */
export class StaticGazetteerProvider implements GazetteerProvider {
  readonly #byTenant: ReadonlyMap<string, Gazetteer>;
  readonly #empty: Gazetteer;

  constructor(
    namesByTenant: Readonly<Record<string, readonly GazetteerName[]>>,
  ) {
    staticGazetteerCount += 1;
    const version = `static-${String(staticGazetteerCount)}`;
    this.#byTenant = new Map(
      Object.entries(namesByTenant).map(
        ([tenantId, names]) => [tenantId, { version, names }] as const,
      ),
    );
    this.#empty = { version, names: [] };
  }

  load(tenantId: string): Promise<Gazetteer> {
    return Promise.resolve(this.#byTenant.get(tenantId) ?? this.#empty);
  }
}

/** In-memory roll-number patterns for tests, local development and fixed configurations. */
export class StaticRollNumberPatternProvider implements RollNumberPatternProvider {
  readonly #byTenant: ReadonlyMap<string, readonly string[]>;

  constructor(patternsByTenant: Readonly<Record<string, readonly string[]>>) {
    this.#byTenant = new Map(Object.entries(patternsByTenant));
  }

  patternsFor(tenantId: string): Promise<readonly string[]> {
    return Promise.resolve(this.#byTenant.get(tenantId) ?? []);
  }
}
