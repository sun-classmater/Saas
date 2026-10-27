export async function all(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

export async function first(conn, sql, params = []) {
  const rows = await all(conn, sql, params);
  return rows[0] || null;
}

export async function run(conn, sql, params = []) {
  const [result] = await conn.query(sql, params);
  return result;
}

export async function withTransaction(db, fn) {
  const conn = await db.$client.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 忽略回滚失败，保留原始错误
    }
    throw error;
  } finally {
    conn.release();
  }
}
