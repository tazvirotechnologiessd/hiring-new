const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
const fromName = process.env.SMTP_FROM_NAME || 'Tazviro Technologies';
const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

const isMailConfigured = Boolean(smtpUser && smtpPass && fromEmail);

const transporter = isMailConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null;

const fromAddress = () => `"${fromName}" <${fromEmail}>`;

async function sendMail(message) {
  if (!transporter) {
    console.warn('SMTP is not configured. Skipping outgoing email.');
    return false;
  }

  await transporter.sendMail({
    from: fromAddress(),
    ...message,
  });

  return true;
}

function buildStartEmail(candidate) {
  const subject = 'Tazviro Technologies Assessment Started';
  const text = [
    `Hello ${candidate.name},`,
    '',
    'Your assessment for Tazviro Technologies has started successfully.',
    '',
    'Candidate details:',
    `Name: ${candidate.name}`,
    `Email: ${candidate.email}`,
    `Mobile: ${candidate.mobile}`,
    `Role: ${candidate.designation}`,
    '',
    'Important test information:',
    '- This assessment can be attempted only once per email address.',
    '- The aptitude round contains 40 questions with a 40 minute time limit.',
    '- A minimum score of 30 out of 40 is required to unlock the coding round.',
    '- Camera and microphone permissions are optional. If you allow them, keep them enabled throughout the test.',
    '- Do not refresh the page or switch devices during the assessment.',
    '',
    'Please complete the assessment carefully.',
    '',
    'Regards,',
    'Tazviro Technologies',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Assessment Started</h2>
      <p>Hello ${candidate.name},</p>
      <p>Your assessment for <strong>Tazviro Technologies</strong> has started successfully.</p>
      <p><strong>Candidate details</strong></p>
      <ul>
        <li>Name: ${candidate.name}</li>
        <li>Email: ${candidate.email}</li>
        <li>Mobile: ${candidate.mobile}</li>
        <li>Role: ${candidate.designation}</li>
      </ul>
      <p><strong>Important test information</strong></p>
      <ul>
        <li>This assessment can be attempted only once per email address.</li>
        <li>The aptitude round contains 40 questions with a 40 minute time limit.</li>
        <li>A minimum score of 30 out of 40 is required to unlock the coding round.</li>
        <li>Camera and microphone permissions are optional. If you allow them, keep them enabled throughout the test.</li>
        <li>Do not refresh the page or switch devices during the assessment.</li>
      </ul>
      <p>Please complete the assessment carefully.</p>
      <p>Regards,<br />Tazviro Technologies</p>
    </div>
  `;

  return { subject, text, html };
}

function buildCompletionEmail(candidate) {
  const subject = 'Tazviro Technologies Assessment Completed';
  const text = [
    `Hello ${candidate.name},`,
    '',
    'Your assessment has been completed successfully.',
    'Further updates will reach you soon from the Tazviro Technologies team.',
    '',
    'Regards,',
    'Tazviro Technologies',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Assessment Completed</h2>
      <p>Hello ${candidate.name},</p>
      <p>Your assessment has been completed successfully.</p>
      <p>Further updates will reach you soon from the <strong>Tazviro Technologies</strong> team.</p>
      <p>Regards,<br />Tazviro Technologies</p>
    </div>
  `;

  return { subject, text, html };
}

async function sendCandidateStartEmail(candidate) {
  if (!candidate?.email) {
    return false;
  }

  return sendMail({
    to: candidate.email,
    ...buildStartEmail(candidate),
  });
}

async function sendCandidateCompletionEmail(candidate) {
  if (!candidate?.email) {
    return false;
  }

  return sendMail({
    to: candidate.email,
    ...buildCompletionEmail(candidate),
  });
}

module.exports = {
  isMailConfigured,
  sendCandidateStartEmail,
  sendCandidateCompletionEmail,
};
