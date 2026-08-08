import { Client, type QueryResultRow } from "pg";

export const localDatabaseUrl =
  process.env.ROFIES_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function queryDatabase<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
) {
  const client = new Client({ connectionString: localDatabaseUrl });
  await client.connect();
  try {
    return await client.query<Row>(text, [...values]);
  } finally {
    await client.end();
  }
}

export async function asActor<Row extends QueryResultRow = QueryResultRow>(
  actorId: string,
  text: string,
  values: readonly unknown[] = []
) {
  const client = new Client({ connectionString: localDatabaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
    const result = await client.query<Row>(text, [...values]);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
