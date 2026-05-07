const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

function verifyPassword(password, storedHash = '') {
  const [salt, existingHash] = storedHash.split(':');
  if (!salt || !existingHash) {
    return false;
  }

  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const existingBuffer = Buffer.from(existingHash, 'hex');

  if (hashedBuffer.length !== existingBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashedBuffer, existingBuffer);
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set. API requests that use the database will fail.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stored_files (
      id SERIAL PRIMARY KEY,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      mobile TEXT NOT NULL,
      designation TEXT NOT NULL,
      resume_path TEXT,
      resume_file_id INTEGER REFERENCES stored_files(id) ON DELETE SET NULL,
      resume_original_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assessment_attempts (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      aptitude_score INTEGER DEFAULT 0,
      aptitude_total INTEGER DEFAULT 40,
      aptitude_passed BOOLEAN DEFAULT FALSE,
      aptitude_questions JSONB DEFAULT '[]'::jsonb,
      aptitude_answers JSONB DEFAULT '{}'::jsonb,
      coding_designation TEXT,
      coding_questions JSONB DEFAULT '[]'::jsonb,
      coding_submissions JSONB DEFAULT '{}'::jsonb,
      camera_recording_path TEXT,
      camera_recording_file_id INTEGER REFERENCES stored_files(id) ON DELETE SET NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      must_change_password BOOLEAN DEFAULT TRUE,
      created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS resume_file_id INTEGER REFERENCES stored_files(id) ON DELETE SET NULL;

    ALTER TABLE assessment_attempts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE assessment_attempts
    ADD COLUMN IF NOT EXISTS camera_recording_file_id INTEGER REFERENCES stored_files(id) ON DELETE SET NULL;

    ALTER TABLE assessment_attempts
    ADD COLUMN IF NOT EXISTS aptitude_questions JSONB DEFAULT '[]'::jsonb;
  `);

  const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin@tazviro.com';
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'Admin@2026';
  const defaultAdminHash = hashPassword(defaultAdminPassword);

  await pool.query(
    `INSERT INTO admin_users (username, password_hash, must_change_password)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (username) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         must_change_password = FALSE,
         updated_at = NOW()`,
    [defaultAdminUsername, defaultAdminHash],
  );
}

module.exports = { pool, initDb, hashPassword, verifyPassword };
