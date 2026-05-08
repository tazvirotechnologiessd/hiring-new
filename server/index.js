require('dotenv').config();

const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { hashPassword, initDb, pool, verifyPassword } = require('./db');
const {
  getMailConfigStatus,
  sendCandidateCompletionEmail,
  sendCandidateStartEmail,
  sendMail,
  verifyMailTransport,
} = require('./mailer');
const { evaluateQuestion } = require('./codeRunner');
const {
  APTITUDE_PASS_MARK,
  APTITUDE_TOTAL,
  getCodingQuestionById,
  getCodingQuestions,
  gradeAptitude,
  pickAptitudeQuestions,
  sanitizeCodingQuestion,
  sanitizeAptitudeQuestions,
} = require('./questionBank');

const app = express();
const port = process.env.PORT || 5000;
const uploadRoot = path.join(__dirname, 'uploads');
const clientBuildRoot = path.join(__dirname, '..', 'build');
const authSecret = process.env.ADMIN_AUTH_SECRET || 'tazviro-hiring-admin-secret';

fs.mkdirSync(path.join(uploadRoot, 'resumes'), { recursive: true });
fs.mkdirSync(path.join(uploadRoot, 'recordings'), { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});
const aptitudeBypassEmail = 'tazviro@gmail.com';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const trySendEmail = async (task, label) => {
  try {
    return await task();
  } catch (error) {
    console.error(`Failed to send ${label}:`, {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
    });
    return false;
  }
};

const normalizeMimeType = (value) => {
  const mime = (value || '').trim().toLowerCase();
  return mime || 'application/octet-stream';
};

const toPublicUploadUrl = (filePath = '') => {
  if (!filePath) {
    return null;
  }

  const relativePath = path.relative(uploadRoot, filePath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) {
    return null;
  }

  return `/uploads/${relativePath}`;
};

const sendLegacyDiskFile = ({ res, filePath, missingMessage, downloadName, forceDownload = false }) => {
  if (!filePath) {
    return res.status(404).json({ message: missingMessage });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Stored file was not found on disk.' });
  }

  if (downloadName) {
    const dispositionType = forceDownload ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(downloadName)}"`);
  }

  return res.sendFile(path.resolve(filePath));
};

const sendDbFile = ({ res, row, forceDownload = false }) => {
  if (!row || !row.file_data) {
    return res.status(404).json({ message: 'Stored file was not found.' });
  }

  const mimeType = normalizeMimeType(row.mime_type);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', Number(row.file_size || row.file_data.length || 0));

  const dispositionType = forceDownload ? 'attachment' : 'inline';
  const fileName = row.original_name || 'file';
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(fileName)}"`);

  return res.send(row.file_data);
};

const persistUploadToDb = async (file) => {
  if (!file || !file.buffer) {
    return null;
  }

  const originalName = file.originalname || 'file';
  const mimeType = normalizeMimeType(file.mimetype);
  const fileSize = Number(file.size || file.buffer.length || 0);

  const result = await pool.query(
    `INSERT INTO stored_files (original_name, mime_type, file_size, file_data)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [originalName, mimeType, fileSize, file.buffer],
  );

  return result.rows[0].id;
};

const maybeMigrateLegacyFile = async ({ filePath, originalName, mimeType, updateQueryText, updateParams }) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const fileData = fs.readFileSync(filePath);
  const inserted = await pool.query(
    `INSERT INTO stored_files (original_name, mime_type, file_size, file_data)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      originalName || path.basename(filePath),
      normalizeMimeType(mimeType),
      Number(fileData.length),
      fileData,
    ],
  );

  const newId = inserted.rows[0].id;
  await pool.query(updateQueryText, [...updateParams, newId]);
  return newId;
};

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const signAdminToken = (payload) => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', authSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const verifyAdminToken = (token) => {
  const [encodedPayload, signature] = (token || '').split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac('sha256', authSecret).update(encodedPayload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload.exp || payload.exp < Date.now()) {
    return null;
  }

  return payload;
};

const issueAdminSession = (adminUser) => {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  const token = signAdminToken({
    sub: adminUser.id,
    username: adminUser.username,
    mustChangePassword: adminUser.must_change_password,
    exp: expiresAt,
  });

  return {
    token,
    user: {
      id: adminUser.id,
      username: adminUser.username,
      mustChangePassword: adminUser.must_change_password,
    },
    expiresAt,
  };
};

const requireAdminAuth = asyncRoute(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyAdminToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Admin authentication is required.' });
  }

  const adminUser = await pool.query(
    'SELECT id, username, must_change_password FROM admin_users WHERE id = $1',
    [payload.sub],
  );

  if (!adminUser.rowCount) {
    return res.status(401).json({ message: 'Admin user was not found.' });
  }

  req.adminUser = adminUser.rows[0];
  next();
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(uploadRoot));

if (fs.existsSync(clientBuildRoot)) {
  app.use(express.static(clientBuildRoot));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/assets/resume/:candidateId', asyncRoute(async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  const result = await pool.query(
    `SELECT
       c.resume_file_id,
       c.resume_path,
       c.resume_original_name,
       sf.original_name,
       sf.mime_type,
       sf.file_size,
       sf.file_data
     FROM candidates c
     LEFT JOIN stored_files sf ON sf.id = c.resume_file_id
     WHERE c.id = $1`,
    [candidateId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Resume was not found for this candidate.' });
  }

  const row = result.rows[0];
  if (row.resume_file_id) {
    return sendDbFile({ res, row, forceDownload: false });
  }

  const migratedId = await maybeMigrateLegacyFile({
    filePath: row.resume_path,
    originalName: row.resume_original_name,
    mimeType: 'application/octet-stream',
    updateQueryText: `UPDATE candidates SET resume_file_id = $2, updated_at = NOW() WHERE id = $1`,
    updateParams: [candidateId],
  });

  if (migratedId) {
    const migrated = await pool.query(
      `SELECT original_name, mime_type, file_size, file_data FROM stored_files WHERE id = $1`,
      [migratedId],
    );
    return sendDbFile({ res, row: migrated.rows[0], forceDownload: false });
  }

  return sendLegacyDiskFile({
    res,
    filePath: row.resume_path,
    missingMessage: 'Resume was not found for this candidate.',
    downloadName: row.resume_original_name,
    forceDownload: false,
  });
}));

app.get('/api/admin/assets/resume/:candidateId/download', asyncRoute(async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  const result = await pool.query(
    `SELECT
       c.resume_file_id,
       c.resume_path,
       c.resume_original_name,
       sf.original_name,
       sf.mime_type,
       sf.file_size,
       sf.file_data
     FROM candidates c
     LEFT JOIN stored_files sf ON sf.id = c.resume_file_id
     WHERE c.id = $1`,
    [candidateId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Resume was not found for this candidate.' });
  }

  const row = result.rows[0];
  if (row.resume_file_id) {
    return sendDbFile({ res, row, forceDownload: true });
  }

  const migratedId = await maybeMigrateLegacyFile({
    filePath: row.resume_path,
    originalName: row.resume_original_name,
    mimeType: 'application/octet-stream',
    updateQueryText: `UPDATE candidates SET resume_file_id = $2, updated_at = NOW() WHERE id = $1`,
    updateParams: [candidateId],
  });

  if (migratedId) {
    const migrated = await pool.query(
      `SELECT original_name, mime_type, file_size, file_data FROM stored_files WHERE id = $1`,
      [migratedId],
    );
    return sendDbFile({ res, row: migrated.rows[0], forceDownload: true });
  }

  return sendLegacyDiskFile({
    res,
    filePath: row.resume_path,
    missingMessage: 'Resume was not found for this candidate.',
    downloadName: row.resume_original_name || 'resume',
    forceDownload: true,
  });
}));

app.get('/api/admin/assets/recording/:attemptId', asyncRoute(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const result = await pool.query(
    `SELECT
       a.camera_recording_file_id,
       a.camera_recording_path,
       sf.original_name,
       sf.mime_type,
       sf.file_size,
       sf.file_data
     FROM assessment_attempts a
     LEFT JOIN stored_files sf ON sf.id = a.camera_recording_file_id
     WHERE a.id = $1`,
    [attemptId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Recording was not found for this attempt.' });
  }

  const row = result.rows[0];
  if (row.camera_recording_file_id) {
    return sendDbFile({ res, row, forceDownload: false });
  }

  const migratedId = await maybeMigrateLegacyFile({
    filePath: row.camera_recording_path,
    originalName: `attempt-${attemptId}.webm`,
    mimeType: 'video/webm',
    updateQueryText: `UPDATE assessment_attempts SET camera_recording_file_id = $2, updated_at = NOW() WHERE id = $1`,
    updateParams: [attemptId],
  });

  if (migratedId) {
    const migrated = await pool.query(
      `SELECT original_name, mime_type, file_size, file_data FROM stored_files WHERE id = $1`,
      [migratedId],
    );
    return sendDbFile({ res, row: migrated.rows[0], forceDownload: false });
  }

  return sendLegacyDiskFile({
    res,
    filePath: row.camera_recording_path,
    missingMessage: 'Recording was not found for this attempt.',
    downloadName: `attempt-${attemptId}.webm`,
    forceDownload: false,
  });
}));

app.post('/api/candidates', upload.single('resume'), asyncRoute(async (req, res) => {
  const { name, email, mobile, designation } = req.body;
  const normalizedEmail = (email || '').trim().toLowerCase();
  const shouldBypassAptitude = normalizedEmail === aptitudeBypassEmail;

  if (!name || !normalizedEmail || !mobile || !designation || !req.file) {
    return res.status(400).json({ message: 'Name, email, mobile, designation, and resume are required.' });
  }

  const existingCandidate = await pool.query(
    'SELECT id FROM candidates WHERE LOWER(email) = $1 LIMIT 1',
    [normalizedEmail],
  );

  if (existingCandidate.rowCount && !shouldBypassAptitude) {
    return res.status(409).json({
      message: 'This email has already been used for the Tazviro Technologies hiring test and cannot take the test again.',
    });
  }

  const resumeFileId = await persistUploadToDb(req.file);

  const candidate = await pool.query(
    `INSERT INTO candidates (name, email, mobile, designation, resume_path, resume_file_id, resume_original_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name.trim(), normalizedEmail, mobile.trim(), designation, null, resumeFileId, req.file.originalname],
  );

  const aptitudeQuestions = pickAptitudeQuestions(APTITUDE_TOTAL);

  const attempt = await pool.query(
    `INSERT INTO assessment_attempts (
       candidate_id,
       coding_designation,
       aptitude_questions,
       aptitude_total,
       aptitude_score,
       aptitude_passed,
       aptitude_answers
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      candidate.rows[0].id,
      designation,
      JSON.stringify(aptitudeQuestions),
      APTITUDE_TOTAL,
      shouldBypassAptitude ? APTITUDE_TOTAL : 0,
      shouldBypassAptitude,
      JSON.stringify(shouldBypassAptitude ? { bypass: 'testing-email' } : {}),
    ],
  );

  const emailSent = await trySendEmail(
    () => sendCandidateStartEmail({
      name: candidate.rows[0].name,
      email: candidate.rows[0].email,
      mobile: candidate.rows[0].mobile,
      designation: candidate.rows[0].designation,
    }),
    'candidate start email',
  );

  res.status(201).json({
    candidate: candidate.rows[0],
    attempt: attempt.rows[0],
    aptitudeBypassed: shouldBypassAptitude,
    emailSent,
  });
}));

app.get('/api/attempts/:attemptId/aptitude/questions', asyncRoute(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const result = await pool.query(
    `SELECT aptitude_questions, aptitude_total
     FROM assessment_attempts
     WHERE id = $1`,
    [attemptId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Attempt not found.' });
  }

  const attempt = result.rows[0];
  const questions = Array.isArray(attempt.aptitude_questions) ? attempt.aptitude_questions : [];
  res.json({
    questions: sanitizeAptitudeQuestions(questions),
    passMark: APTITUDE_PASS_MARK,
    total: Number(attempt.aptitude_total || APTITUDE_TOTAL),
  });
}));

app.get('/api/aptitude/questions', (_req, res) => {
  res.json({
    questions: sanitizeAptitudeQuestions(pickAptitudeQuestions(APTITUDE_TOTAL)),
    passMark: APTITUDE_PASS_MARK,
    total: APTITUDE_TOTAL,
  });
});

app.post('/api/attempts/:attemptId/aptitude', asyncRoute(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const answers = req.body.answers || {};
  const existingAttempt = await pool.query(
    `SELECT aptitude_questions, aptitude_total
     FROM assessment_attempts
     WHERE id = $1`,
    [attemptId],
  );

  if (!existingAttempt.rowCount) {
    return res.status(404).json({ message: 'Attempt not found.' });
  }

  const attemptQuestions = Array.isArray(existingAttempt.rows[0].aptitude_questions)
    ? existingAttempt.rows[0].aptitude_questions
    : [];
  const totalQuestions = Number(existingAttempt.rows[0].aptitude_total || APTITUDE_TOTAL);
  const score = gradeAptitude(answers, attemptQuestions);
  const passed = score >= APTITUDE_PASS_MARK;

  const result = await pool.query(
    `UPDATE assessment_attempts
     SET aptitude_score = $1, aptitude_total = $2, aptitude_passed = $3, aptitude_answers = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [score, totalQuestions, passed, JSON.stringify(answers), attemptId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Attempt not found.' });
  }

  if (!passed) {
    const candidateResult = await pool.query(
      `SELECT c.name, c.email
       FROM assessment_attempts a
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.id = $1`,
      [attemptId],
    );

    if (candidateResult.rowCount) {
      await trySendEmail(
        () => sendCandidateCompletionEmail(candidateResult.rows[0]),
        'candidate completion email',
      );
    }
  }

  res.json({ score, total: totalQuestions, passed, attempt: result.rows[0] });
}));

app.get('/api/coding/questions', (req, res) => {
  res.json({ questions: getCodingQuestions(req.query.designation).map(sanitizeCodingQuestion) });
});

app.post('/api/coding/run', asyncRoute(async (req, res) => {
  const { questionId, submission } = req.body || {};
  const question = getCodingQuestionById(questionId);

  if (!question) {
    return res.status(404).json({ message: 'Coding question not found.' });
  }

  if (!submission?.code?.trim()) {
    return res.status(400).json({ message: 'Code is required to run test cases.' });
  }

  const result = await evaluateQuestion(question, submission, { includeHidden: false });
  res.json(result);
}));

app.post('/api/attempts/:attemptId/coding', asyncRoute(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const { designation, questions, submissions } = req.body;

  const existing = await pool.query('SELECT aptitude_passed FROM assessment_attempts WHERE id = $1', [attemptId]);
  if (!existing.rowCount) {
    return res.status(404).json({ message: 'Attempt not found.' });
  }

  if (!existing.rows[0].aptitude_passed) {
    return res.status(403).json({ message: 'Candidate must pass aptitude before coding round.' });
  }

  const evaluatedSubmissions = {};
  for (const question of questions || []) {
    const canonicalQuestion = getCodingQuestionById(question.id);
    if (!canonicalQuestion) {
      continue;
    }

    const submission = submissions?.[question.id] || {};
    const evaluation = submission.code?.trim()
      ? await evaluateQuestion(canonicalQuestion, submission, { includeHidden: true })
      : {
          language: submission.language || canonicalQuestion.languages?.[0] || '',
          passedCount: 0,
          totalCount: (canonicalQuestion.publicCases?.length || 0) + (canonicalQuestion.hiddenCases?.length || 0),
          allPassed: false,
          cases: [],
        };

    evaluatedSubmissions[question.id] = {
      ...submission,
      evaluation,
    };
  }

  const result = await pool.query(
    `UPDATE assessment_attempts
     SET coding_designation = $1, coding_questions = $2, coding_submissions = $3, completed_at = NOW(), updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [designation, JSON.stringify(questions || []), JSON.stringify(evaluatedSubmissions), attemptId],
  );

  const candidateResult = await pool.query(
    `SELECT c.name, c.email
     FROM assessment_attempts a
     JOIN candidates c ON c.id = a.candidate_id
     WHERE a.id = $1`,
    [attemptId],
  );

  if (candidateResult.rowCount) {
    await trySendEmail(
      () => sendCandidateCompletionEmail(candidateResult.rows[0]),
      'candidate completion email',
    );
  }

  res.json({ attempt: result.rows[0], submissions: evaluatedSubmissions });
}));

app.post('/api/attempts/:attemptId/recording', upload.single('cameraRecording'), asyncRoute(async (req, res) => {
  const attemptId = Number(req.params.attemptId);

  if (!req.file) {
    return res.status(400).json({ message: 'Camera recording is required.' });
  }

  const recordingFileId = await persistUploadToDb(req.file);

  const result = await pool.query(
    `UPDATE assessment_attempts
     SET camera_recording_path = $1, camera_recording_file_id = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING camera_recording_file_id`,
    [null, recordingFileId, attemptId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ message: 'Attempt not found.' });
  }

  res.json({ recordingFileId: result.rows[0].camera_recording_file_id });
}));

app.post('/api/admin/login', asyncRoute(async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const result = await pool.query(
    'SELECT id, username, password_hash, must_change_password FROM admin_users WHERE username = $1',
    [username],
  );

  if (!result.rowCount || !verifyPassword(password, result.rows[0].password_hash)) {
    return res.status(401).json({ message: 'Invalid admin username or password.' });
  }

  res.json(issueAdminSession(result.rows[0]));
}));

app.post('/api/admin/change-password', requireAdminAuth, asyncRoute(async (req, res) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  const adminUser = await pool.query(
    'SELECT id, username, password_hash, must_change_password FROM admin_users WHERE id = $1',
    [req.adminUser.id],
  );

  if (!adminUser.rowCount || !verifyPassword(currentPassword, adminUser.rows[0].password_hash)) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }

  const updated = await pool.query(
    `UPDATE admin_users
     SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
     WHERE id = $2
     RETURNING id, username, must_change_password`,
    [hashPassword(newPassword), req.adminUser.id],
  );

  res.json(issueAdminSession(updated.rows[0]));
}));

app.get('/api/admin/candidates', requireAdminAuth, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      c.id AS candidate_id,
      c.name,
      c.email,
      c.mobile,
      c.designation,
      c.resume_original_name,
      c.resume_path,
      c.resume_file_id,
      c.created_at AS candidate_created_at,
      a.id AS attempt_id,
      a.aptitude_score,
      a.aptitude_total,
      a.aptitude_passed,
      a.coding_designation,
      a.coding_questions,
      a.coding_submissions,
      a.camera_recording_path,
      a.camera_recording_file_id,
      a.completed_at,
      a.created_at AS attempt_created_at,
      CASE
        WHEN a.aptitude_passed = TRUE AND a.completed_at IS NOT NULL THEN 'Passed aptitude and completed coding'
        WHEN a.aptitude_passed = TRUE THEN 'Passed aptitude'
        WHEN a.aptitude_passed = FALSE AND a.aptitude_score > 0 THEN 'Not passed aptitude'
        ELSE 'Started registration'
      END AS assessment_status
    FROM candidates c
    LEFT JOIN assessment_attempts a ON a.candidate_id = c.id
    ORDER BY c.created_at DESC
  `);

  const candidates = result.rows.map((row) => ({
    ...row,
    resume_url: toPublicUploadUrl(row.resume_path),
    recording_url: toPublicUploadUrl(row.camera_recording_path),
    resume_view_url: row.resume_file_id || row.resume_path ? `/api/admin/assets/resume/${row.candidate_id}` : null,
    resume_download_url: row.resume_file_id || row.resume_path ? `/api/admin/assets/resume/${row.candidate_id}/download` : null,
    recording_view_url: row.camera_recording_file_id || row.camera_recording_path ? `/api/admin/assets/recording/${row.attempt_id}` : null,
  }));

  res.json({ candidates });
}));

app.get('/api/admin/users', requireAdminAuth, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      u.id,
      u.username,
      u.must_change_password,
      u.created_at,
      creator.username AS created_by_username
    FROM admin_users u
    LEFT JOIN admin_users creator ON creator.id = u.created_by
    ORDER BY u.created_at DESC
  `);

  res.json({ users: result.rows });
}));

app.get('/api/admin/mail/status', requireAdminAuth, asyncRoute(async (_req, res) => {
  res.json(getMailConfigStatus());
}));

app.post('/api/admin/mail/test', requireAdminAuth, asyncRoute(async (req, res) => {
  const to = (req.body.email || req.adminUser.username || '').trim().toLowerCase();

  if (!to) {
    return res.status(400).json({ message: 'A test recipient email is required.' });
  }

  const verified = await verifyMailTransport();
  if (!verified.ok) {
    return res.status(400).json(verified);
  }

  const sent = await trySendEmail(
    () => sendMail({
      to,
      subject: 'Tazviro Technologies SMTP Test',
      text: 'This is a test email from the Tazviro Technologies hiring portal.',
      html: '<p>This is a test email from the <strong>Tazviro Technologies</strong> hiring portal.</p>',
    }),
    'admin SMTP test email',
  );

  if (!sent) {
    return res.status(502).json({
      message: 'SMTP credentials were loaded, but the test email could not be sent. Check backend logs for the provider response.',
      config: getMailConfigStatus(),
    });
  }

  res.json({ sent: true, to, config: getMailConfigStatus() });
}));

app.post('/api/admin/users', requireAdminAuth, asyncRoute(async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const temporaryPassword = req.body.temporaryPassword || '';

  if (!username || !temporaryPassword) {
    return res.status(400).json({ message: 'Username and temporary password are required.' });
  }

  if (temporaryPassword.length < 8) {
    return res.status(400).json({ message: 'Temporary password must be at least 8 characters.' });
  }

  const result = await pool.query(
    `INSERT INTO admin_users (username, password_hash, must_change_password, created_by, updated_at)
     VALUES ($1, $2, TRUE, $3, NOW())
     RETURNING id, username, must_change_password, created_at`,
    [username, hashPassword(temporaryPassword), req.adminUser.id],
  );

  res.status(201).json({ user: result.rows[0] });
}));

if (fs.existsSync(clientBuildRoot)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(clientBuildRoot, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === '23505') {
    return res.status(409).json({ message: 'This username already exists.' });
  }
  res.status(500).json({ message: 'Server error. Please check backend logs.' });
});

initDb()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Hiring API running on http://localhost:${port}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Stop the existing process or change PORT in .env before starting the API.`);
      } else {
        console.error('Failed to start HTTP server:', error);
      }
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('Failed to start API:', error);
    process.exit(1);
  });
