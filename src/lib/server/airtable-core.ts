import "server-only";
// Transport takes credentials explicitly. Only the server-only entry point supplies them.
export type Fields = Record<string, unknown>;
export type RecordRow = { id: string; fields: Fields };
export type Field = {
  id?: string;
  name: string;
  type: string;
  options?: Fields;
};
export type Table = { id: string; name: string; fields: Field[] };
export class AirtableError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class AirtableClient {
  private nextRequest = 0;
  constructor(
    private token: string,
    public baseId: string,
    private fetcher: typeof fetch = fetch,
    private pace = true,
  ) {}
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    // Stay below the five-requests-per-second base limit; never retry a 429.
    if (this.pace) {
      const wait = Math.max(0, this.nextRequest - Date.now());
      this.nextRequest = Math.max(Date.now(), this.nextRequest) + 220;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const response = await this.fetcher(`https://api.airtable.com/v0/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      // Never include Airtable response bodies or credentials in public errors.
      throw new AirtableError(
        response.status,
        response.status === 429
          ? "Airtable rate limit or monthly allowance reached. No retry was made."
          : response.status === 401 || response.status === 403
            ? "Airtable denied access. Check the token's base access and permissions."
            : `Airtable request failed (${response.status}).`,
      );
    }
    return response.json() as Promise<T>;
  }
  async schema() {
    return (
      await this.request<{ tables: Table[] }>(
        `meta/bases/${this.baseId}/tables`,
      )
    ).tables;
  }
  async list(table: string, query: Record<string, string> = {}) {
    const rows: RecordRow[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({
        pageSize: "100",
        ...query,
        ...(offset ? { offset } : {}),
      });
      const page = await this.request<{
        records: RecordRow[];
        offset?: string;
      }>(`${this.baseId}/${encodeURIComponent(table)}?${params}`);
      rows.push(...page.records);
      offset = page.offset;
    } while (offset);
    return rows;
  }
  async write(
    table: string,
    records: { id?: string; fields: Fields }[],
    mode: "create" | "update" | "upsert" = "create",
    mergeOn = "ticket_id",
  ) {
    const rows: RecordRow[] = [];
    for (let i = 0; i < records.length; i += 10) {
      const page = await this.request<{ records: RecordRow[] }>(
        `${this.baseId}/${encodeURIComponent(table)}`,
        mode === "create" ? "POST" : "PATCH",
        {
          records: records.slice(i, i + 10),
          typecast: true,
          ...(mode === "upsert"
            ? { performUpsert: { fieldsToMergeOn: [mergeOn] } }
            : {}),
        },
      );
      rows.push(...page.records);
    }
    return rows;
  }
  async remove(table: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += 10) {
      const query = new URLSearchParams();
      ids.slice(i, i + 10).forEach((id) => query.append("records[]", id));
      await this.request(
        `${this.baseId}/${encodeURIComponent(table)}?${query}`,
        "DELETE",
      );
    }
  }
  async createField(tableId: string, field: Field) {
    return this.request<Field>(
      `meta/bases/${this.baseId}/tables/${tableId}/fields`,
      "POST",
      field,
    );
  }
}
