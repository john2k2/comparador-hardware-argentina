export function sqliteAdapter(database) {
  const metrics={queries:0,rowsReturned:0};
  return {
    metrics,
    async all(sql,values=[]) {metrics.queries++;const rows=database.prepare(sql).all(...values);metrics.rowsReturned+=rows.length;return rows;},
    async first(sql,values=[]) {metrics.queries++;const row=database.prepare(sql).get(...values);metrics.rowsReturned+=Number(Boolean(row));return row;},
  };
}
export function d1Adapter(database) {
  const metrics={queries:0,rowsRead:0,rowsWritten:0,sqlDurationMs:0};
  async function run(sql,values) {
    const response=await database.prepare(sql).bind(...values).all();
    if(!response.success) throw new Error('CATALOG_DATABASE_READ_FAILED');
    metrics.queries++;metrics.rowsRead+=Number(response.meta?.rows_read??0);metrics.rowsWritten+=Number(response.meta?.rows_written??0);metrics.sqlDurationMs+=Number(response.meta?.duration??0);
    return response.results;
  }
  return {metrics,all:(sql,values=[])=>run(sql,values),first:async(sql,values=[]) => (await run(sql,values))[0]};
}
