import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';

// Manual .env loader for standalone Node scripts
if (!process.env.TURSO_DATABASE_URL) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEquals = trimmed.indexOf('=');
          if (firstEquals !== -1) {
            const key = trimmed.slice(0, firstEquals).trim();
            let value = trimmed.slice(firstEquals + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    // Ignore loader error
  }
}

// Initializing connection to Turso DB (libSQL) using environment variables
if (!process.env.TURSO_DATABASE_URL) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction) {
    throw new Error('[FATAL] TURSO_DATABASE_URL is not set. Refusing to start in production without a remote database.');
  }
  console.warn('[WARNING] TURSO_DATABASE_URL not set. Using local SQLite fallback.');
}

const remoteClient = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

// Local fallback only available in development
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const localClient = isProduction ? null : createClient({ url: 'file:local.db' });

// Helper to identify network connectivity failures
function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  const code = String(err.code || '').toLowerCase();
  return msg.includes('enotfound') || 
         msg.includes('fetch failed') || 
         msg.includes('eai_again') || 
         code === 'enotfound' || 
         code === 'eai_again';
}

/**
 * Executes a single SQL query that returns rows.
 * @param {string} sql - SQL statement
 * @param {Array} [params] - Parameter values
 * @returns {Promise<Array>} List of rows matching the query
 */
export async function query(sql, params = []) {
  try {
    const res = await remoteClient.execute({ sql, args: params });
    return res.rows;
  } catch (err) {
    if (!isProduction && localClient && isNetworkError(err)) {
      console.warn('[WARNING] Remote Turso connection offline. Falling back to local SQLite DB.');
      try {
        const res = await localClient.execute({ sql, args: params });
        return res.rows;
      } catch (localErr) {
        console.error('Local database query error:', localErr, 'SQL:', sql);
        throw localErr;
      }
    }
    console.error('Database query error:', err, 'SQL:', sql);
    throw err;
  }
}

/**
 * Executes a write/update SQL statement.
 * @param {string} sql - SQL statement
 * @param {Array} [params] - Parameter values
 * @returns {Promise<Object>} Execution result summary
 */
export async function execute(sql, params = []) {
  try {
    const res = await remoteClient.execute({ sql, args: params });
    return {
      rowsAffected: res.rowsAffected,
      lastInsertRowid: res.lastInsertRowid
    };
  } catch (err) {
    if (!isProduction && localClient && isNetworkError(err)) {
      console.warn('[WARNING] Remote Turso connection offline. Falling back to local SQLite DB.');
      try {
        const res = await localClient.execute({ sql, args: params });
        return {
          rowsAffected: res.rowsAffected,
          lastInsertRowid: res.lastInsertRowid
        };
      } catch (localErr) {
        console.error('Local database execution error:', localErr, 'SQL:', sql);
        throw localErr;
      }
    }
    console.error('Database execution error:', err, 'SQL:', sql);
    throw err;
  }
}

/**
 * Executes multiple SQL statements in a transaction.
 * @param {Array<Object>} statements - Array of { sql, args } objects
 * @returns {Promise<Array>} Results of each statement execution
 */
export async function batch(statements) {
  try {
    return await remoteClient.batch(statements);
  } catch (err) {
    if (!isProduction && localClient && isNetworkError(err)) {
      console.warn('[WARNING] Remote Turso connection offline. Falling back to local SQLite DB.');
      try {
        return await localClient.batch(statements);
      } catch (localErr) {
        console.error('Local database batch error:', localErr);
        throw localErr;
      }
    }
    console.error('Database batch transaction error:', err);
    throw err;
  }
}

/**
 * Runs migration scripts to set up schemas if they do not exist.
 * @returns {Promise<void>}
 */
export async function initializeDb() {
  try {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.warn(`[WARNING] Migrations directory not found at ${migrationsDir}`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      const statements = sqlContent
        .split(/;\s*[\r\n]+/)
        .map(stmt => {
          return stmt
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n')
            .trim();
        })
        .filter(stmt => stmt.length > 0);

      if (statements.length === 0) continue;

      const batchStmts = statements.map(sql => ({
        sql: sql.endsWith(';') ? sql : sql + ';',
        args: []
      }));

      try {
        // Run each statement individually so non-fatal errors (like duplicate column) don't block others
        for (const stmt of batchStmts) {
          try {
            await execute(stmt.sql, stmt.args);
          } catch (stmtErr) {
            if (stmtErr.message && stmtErr.message.includes('duplicate column')) {
              // Column already exists — skip silently
            } else if (stmtErr.message && stmtErr.message.includes('already exists')) {
              // Index or table already exists — skip silently
            } else {
              console.warn(`[WARNING] Migration ${file} statement failed:`, stmtErr.message);
            }
          }
        }
        console.log(`[SUCCESS] Migration ${file} applied.`);
      } catch (err) {
        console.error(`[ERROR] Migration ${file} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ERROR] Failed to auto-initialize DB:', err);
  }
}

