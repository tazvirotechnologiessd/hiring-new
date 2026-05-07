import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import logo from './assests/Tazviro Technologies logo design.png';

const APTITUDE_DURATION_SECONDS = 40 * 60;
const defaultDesignations = ['Backend Developer', 'Frontend Developer', 'Full Stack Developer'];
const customDesignationValue = '__custom_designation__';

const initialForm = {
  name: '',
  email: '',
  mobile: '',
  designation: defaultDesignations[0],
  designationSelection: defaultDesignations[0],
  customDesignation: '',
  resume: null,
};

const initialAdminLogin = {
  username: '',
  password: '',
};

const initialAdminCreate = {
  username: '',
  temporaryPassword: '',
};

const initialPasswordChange = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const adminStorageKey = 'tazviro-admin-session';
const configuredApiOrigin = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');

const assessmentRules = [
  'Each candidate can use only one email address and can attempt the assessment only once.',
  'Camera and microphone permissions are optional. If you allow them, keep them enabled until final submission.',
  'The aptitude round contains 40 questions and the total time limit is 40 minutes.',
  'Do not refresh the page, switch devices, or ask another person to answer on your behalf.',
  'Candidates must answer every aptitude question before manual submission.',
  'A minimum score of 30 out of 40 is required to unlock the coding round.',
  'The coding round must be completed in the provided editor layout and every coding question requires a response.',
  'Any suspicious activity, duplicate registration, or incomplete monitoring may lead to disqualification.',
];

const codingRules = [
  'Read the full problem statement, constraints, and sample cases before writing code.',
  'Use Run code to verify visible cases before the final submit.',
  'Submit coding round to evaluate the hidden test cases and save your score.',
  'Frontend and full stack rounds may include React or HTML/CSS tasks in addition to logic problems.',
];

const frontendQuestionModes = new Set(['markup', 'react']);
const technicalQuestionModes = new Set(['technical']);

function isFrontendQuestion(question) {
  return frontendQuestionModes.has(question?.mode);
}

function isTechnicalQuestion(question) {
  return technicalQuestionModes.has(question?.mode);
}

function splitMarkupStarter(starterCode = '') {
  const styleMatch = starterCode.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const css = styleMatch ? styleMatch[1].trim() : '';
  const html = starterCode.replace(/<style[^>]*>[\s\S]*?<\/style>/i, '').trim();

  return { html, css };
}

function buildFrontendPanes(question, language) {
  const starterCode = question.starterCode?.[language] || '';

  if (question.mode === 'react') {
    return {
      html: '<div id="root"></div>',
      css: 'body {\n  margin: 0;\n  font-family: Inter, Arial, sans-serif;\n}\n',
      react: starterCode,
    };
  }

  return {
    ...splitMarkupStarter(starterCode),
    react: '',
  };
}

function composeFrontendCode(panes = {}) {
  const html = panes.html || '';
  const css = panes.css || '';
  const react = panes.react || '';

  return [
    css.trim() ? `<style>\n${css}\n</style>` : '',
    html.trim(),
    react.trim() ? `\n/* React */\n${react}` : '',
  ].filter(Boolean).join('\n\n');
}

function escapeClosingScript(value = '') {
  return String(value).replace(/<\/script/gi, '<\\/script');
}

function stripReactModuleSyntax(value = '') {
  return String(value)
    .replace(/^\s*import\s+.*?;\s*$/gm, '')
    .replace(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/, 'function $1')
    .replace(/export\s+default\s+([A-Za-z0-9_$]+);?/, 'const __DefaultComponent = $1;')
    .trim();
}

function getReactComponentName(value = '') {
  const defaultFunction = String(value).match(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/);
  if (defaultFunction) {
    return defaultFunction[1];
  }

  const namedFunction = String(value).match(/function\s+([A-Z][A-Za-z0-9_$]*)\s*\(/);
  if (namedFunction) {
    return namedFunction[1];
  }

  const namedConstant = String(value).match(/const\s+([A-Z][A-Za-z0-9_$]*)\s*=/);
  return namedConstant ? namedConstant[1] : '';
}

function buildPreviewDocument(question, answer = {}) {
  const panes = answer.panes || {};
  const html = panes.html || '';
  const css = panes.css || '';
  const react = panes.react || '';

  if (question?.mode === 'react') {
    const sanitizedReact = escapeClosingScript(stripReactModuleSyntax(react));
    const componentName = getReactComponentName(react);
    const componentResolver = componentName
      ? `typeof ${componentName} !== 'undefined' ? ${componentName} : null`
      : 'null';
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      ${css}
    </style>
  </head>
  <body>
    ${html || '<div id="root"></div>'}
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script type="text/babel">
      const useState = React.useState;
      ${sanitizedReact}
      const rootNode = document.getElementById('root') || document.body.appendChild(document.createElement('div'));
      const Component = typeof __DefaultComponent !== 'undefined'
        ? __DefaultComponent
        : ${componentResolver};
      if (Component) {
        ReactDOM.createRoot(rootNode).render(<Component />);
      } else {
        rootNode.innerHTML = '<section style="padding:24px;font-family:Arial,sans-serif;color:#334">Add a default React component to preview it here.</section>';
      }
    </script>
  </body>
</html>`;
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      ${css}
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`;
}

function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {!open && (
        <path
          d="M4 4l16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function buildCodingDrafts(questions) {
  return questions.reduce((accumulator, question) => {
    const firstLanguage = question.languages?.[0] || 'Plain text';
    const panes = isFrontendQuestion(question) ? buildFrontendPanes(question, firstLanguage) : null;
    accumulator[question.id] = {
      language: firstLanguage,
      code: panes ? composeFrontendCode(panes) : question.starterCode?.[firstLanguage] || '',
      panes,
      notes: '',
      lastRun: null,
      finalEvaluation: null,
    };
    return accumulator;
  }, {});
}

function getInitialScreenFromPath(pathname) {
  return pathname.startsWith('/admin') ? 'admin-login' : 'home';
}

function getApiAssetUrl(path) {
  if (!path) {
    return null;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (configuredApiOrigin) {
    return `${configuredApiOrigin}${path}`;
  }

  return path;
}

function buildApiUrl(path) {
  if (!path || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (configuredApiOrigin) {
    return `${configuredApiOrigin}${path}`;
  }

  return path;
}

async function enterFullscreenMode() {
  if (!document.documentElement.requestFullscreen || document.fullscreenElement) {
    return;
  }

  await document.documentElement.requestFullscreen();
}

async function exitFullscreenMode() {
  if (!document.fullscreenElement || !document.exitFullscreen) {
    return;
  }

  await document.exitFullscreen();
}

async function readResponsePayload(response) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch (_error) {
    return {
      message: response.ok
        ? 'Unexpected server response.'
        : rawText.includes('Proxy error')
          ? 'Backend server is not running. Please start the API server and try again.'
          : rawText || 'Unexpected server response.',
    };
  }
}

function App() {
  const [screen, setScreen] = useState(() => getInitialScreenFromPath(window.location.pathname));
  const [form, setForm] = useState(initialForm);
  const [candidate, setCandidate] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [aptitudeQuestions, setAptitudeQuestions] = useState([]);
  const [aptitudeAnswers, setAptitudeAnswers] = useState({});
  const [aptitudeResult, setAptitudeResult] = useState(null);
  const [aptitudeTimeLeft, setAptitudeTimeLeft] = useState(APTITUDE_DURATION_SECONDS);
  const [codingQuestions, setCodingQuestions] = useState([]);
  const [codingAnswers, setCodingAnswers] = useState({});
  const [activeCodingQuestionId, setActiveCodingQuestionId] = useState('');
  const [codingSummary, setCodingSummary] = useState(null);
  const [candidateMessage, setCandidateMessage] = useState('');
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [stream, setStream] = useState(null);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [assessmentLocked, setAssessmentLocked] = useState(false);
  const [assessmentTerminationReason, setAssessmentTerminationReason] = useState('');
  const [assessmentSecurity, setAssessmentSecurity] = useState({
    tabSwitches: 0,
    fullscreenExits: 0,
  });

  const [adminLogin, setAdminLogin] = useState(initialAdminLogin);
  const [adminCreate, setAdminCreate] = useState(initialAdminCreate);
  const [passwordChange, setPasswordChange] = useState(initialPasswordChange);
  const [adminSession, setAdminSession] = useState(null);
  const [adminCandidates, setAdminCandidates] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState(null);
  const [passwordVisibility, setPasswordVisibility] = useState({
    adminLogin: false,
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
    temporaryPassword: false,
  });

  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const autoSubmitTriggeredRef = useRef(false);
  const streamRef = useRef(null);
  const terminationTriggeredRef = useRef(false);

  const isAssessmentScreen = screen === 'aptitude' || screen === 'coding';
  const answeredCount = Object.keys(aptitudeAnswers).length;
  const activeDesignation = form.designationSelection === customDesignationValue
    ? form.customDesignation.trim()
    : form.designation;
  const canStart = form.name && form.email && form.mobile && activeDesignation && form.resume;
  const unansweredQuestions = useMemo(
    () =>
      aptitudeQuestions
        .map((question, index) => (!aptitudeAnswers[question.id] ? index + 1 : null))
        .filter(Boolean),
    [aptitudeAnswers, aptitudeQuestions],
  );
  const activeCodingQuestion =
    codingQuestions.find((question) => question.id === activeCodingQuestionId) || codingQuestions[0] || null;

  useEffect(() => {
    const storedSession = localStorage.getItem(adminStorageKey);
    if (!storedSession) {
      return;
    }

    try {
      const parsedSession = JSON.parse(storedSession);
      setAdminSession(parsedSession);
      setScreen(parsedSession.user?.mustChangePassword ? 'admin-password' : 'admin-dashboard');
    } catch (_error) {
      localStorage.removeItem(adminStorageKey);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const nextScreen = getInitialScreenFromPath(window.location.pathname);
      setScreen((current) => {
        if (nextScreen === 'admin-login' && current.startsWith('admin')) {
          return current;
        }
        return nextScreen;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const adminScreens = new Set(['admin-login', 'admin-password', 'admin-dashboard']);
    const nextPath = adminScreens.has(screen) ? '/admin' : '/';

    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  }, [screen]);

  useEffect(() => {
    streamRef.current = stream;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    } else if (videoRef.current && !stream) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    if (screen !== 'aptitude') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setAptitudeTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [screen]);

  const updateField = (event) => {
    const { name, value, files } = event.target;

    if (name === 'designationSelection') {
      setForm((current) => ({
        ...current,
        designationSelection: value,
        designation: value === customDesignationValue ? current.customDesignation.trim() : value,
      }));
      return;
    }

    if (name === 'customDesignation') {
      setForm((current) => ({
        ...current,
        customDesignation: value,
        designation: value.trim(),
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      [name]: files ? files[0] : value,
    }));
  };

  const updateAdminForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setPasswordVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const stopCameraHardware = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    streamRef.current = null;
  }, []);

  const cleanupCamera = useCallback(() => {
    stopCameraHardware();
    recorderRef.current = null;
    chunksRef.current = [];
  }, [stopCameraHardware]);

  const resetCandidateFlow = () => {
    cleanupCamera();
    setForm(initialForm);
    setCandidate(null);
    setAttempt(null);
    setAptitudeQuestions([]);
    setAptitudeAnswers({});
    setAptitudeResult(null);
    setAptitudeTimeLeft(APTITUDE_DURATION_SECONDS);
    setCodingQuestions([]);
    setCodingAnswers({});
    setActiveCodingQuestionId('');
    setCodingSummary(null);
    setCandidateMessage('');
    setRecordingSaved(false);
    setAssessmentTerminationReason('');
    autoSubmitTriggeredRef.current = false;
    terminationTriggeredRef.current = false;
  };

  const saveAdminSession = (session) => {
    setAdminSession(session);
    localStorage.setItem(adminStorageKey, JSON.stringify(session));
  };

  const clearAdminSession = () => {
    setAdminSession(null);
    setAdminCandidates([]);
    setAdminUsers([]);
    setAdminMessage('');
    setExpandedCandidateId(null);
    localStorage.removeItem(adminStorageKey);
  };

  const adminFetch = useCallback(async (url, options = {}, tokenOverride) => {
    const token = tokenOverride || adminSession?.token;
    const response = await fetch(buildApiUrl(url), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (response.status === 401) {
      clearAdminSession();
      setScreen('admin-login');
      throw new Error('Admin session expired. Please sign in again.');
    }

    return response;
  }, [adminSession?.token]);

  const loadAdminData = useCallback(async (tokenOverride) => {
    setAdminLoading(true);
    setAdminMessage('');

    try {
      const [candidateResponse, userResponse] = await Promise.all([
        adminFetch('/api/admin/candidates', {}, tokenOverride),
        adminFetch('/api/admin/users', {}, tokenOverride),
      ]);

      if (!candidateResponse.ok || !userResponse.ok) {
        throw new Error('Unable to load admin dashboard data.');
      }

      const candidateData = await readResponsePayload(candidateResponse);
      const userData = await readResponsePayload(userResponse);

      setAdminCandidates(candidateData.candidates || []);
      setAdminUsers(userData.users || []);
    } catch (error) {
      setAdminMessage(error.message || 'Unable to load admin dashboard.');
    } finally {
      setAdminLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    if (screen === 'admin-dashboard' && adminSession?.token && !adminSession.user?.mustChangePassword) {
      loadAdminData(adminSession.token);
    }
  }, [screen, adminSession, loadAdminData]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        enabled: false,
        warning: 'Camera and microphone access is optional. You can continue with the test without granting those permissions.',
      };
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      chunksRef.current = [];

      if (typeof MediaRecorder === 'function') {
        const recorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      }

      return { enabled: true, warning: '' };
    } catch (_error) {
      cleanupCamera();
      return {
        enabled: false,
        warning: 'Camera and microphone access is optional. You can continue with the test without granting those permissions.',
      };
    }
  };

  const stopCameraAndUpload = useCallback(async (attemptId) => {
    if (recordingSaved || !recorderRef.current) {
      cleanupCamera();
      return;
    }

    const recorder = recorderRef.current;
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    if (recorder.state !== 'inactive') {
      recorder.stop();
      await stopped;
    }

    const recordedChunks = [...chunksRef.current];
    stopCameraHardware();
    recorderRef.current = null;

    const recording = new Blob(recordedChunks, { type: 'video/webm' });
    if (!recording.size) {
      chunksRef.current = [];
      return;
    }

    const data = new FormData();
    data.append('cameraRecording', recording, `attempt-${attemptId}.webm`);

    await fetch(buildApiUrl(`/api/attempts/${attemptId}/recording`), {
      method: 'POST',
      body: data,
    });
    chunksRef.current = [];
    setRecordingSaved(true);
  }, [cleanupCamera, recordingSaved, stopCameraHardware]);

  const terminateAssessment = useCallback(async (reason, violationType) => {
    if (terminationTriggeredRef.current) {
      return;
    }

    terminationTriggeredRef.current = true;
    autoSubmitTriggeredRef.current = true;
    setAssessmentLocked(true);
    setCandidateBusy(true);
    setAssessmentTerminationReason(reason);
    setCandidateMessage(reason);

    if (violationType === 'tab') {
      setAssessmentSecurity((current) => ({
        ...current,
        tabSwitches: current.tabSwitches + 1,
      }));
    }

    if (violationType === 'fullscreen') {
      setAssessmentSecurity((current) => ({
        ...current,
        fullscreenExits: current.fullscreenExits + 1,
      }));
    }

    try {
      if (screen === 'aptitude' && attempt?.id) {
        const response = await fetch(buildApiUrl(`/api/attempts/${attempt.id}/aptitude`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: aptitudeAnswers }),
        });

        const result = await readResponsePayload(response);
        if (response.ok) {
          setAptitudeResult(result);
        }
      }

      if (screen === 'coding' && attempt?.id) {
        await stopCameraAndUpload(attempt.id);
      }
    } catch (_error) {
      // Keep the termination local even if persistence fails.
    } finally {
      await exitFullscreenMode().catch(() => {});
      setCandidateBusy(false);
      setScreen('failed');
    }
  }, [aptitudeAnswers, attempt?.id, screen, stopCameraAndUpload]);

  useEffect(() => {
    if (!isAssessmentScreen) {
      setAssessmentLocked(false);
      terminationTriggeredRef.current = false;
      exitFullscreenMode().catch(() => {});
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        return;
      }

      terminateAssessment('Tab switching is not allowed during the assessment. Your test has been ended.', 'tab');
    };

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        setAssessmentLocked(false);
        return;
      }

      terminateAssessment('Exiting fullscreen is not allowed during the assessment. Your test has been ended.', 'fullscreen');
    };

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAssessmentScreen, terminateAssessment]);

  const startAssessment = async (event) => {
    event.preventDefault();
    setCandidateMessage('');
    setCandidateBusy(true);
    setRecordingSaved(false);
    autoSubmitTriggeredRef.current = false;
    terminationTriggeredRef.current = false;
    setAssessmentTerminationReason('');
    setAssessmentLocked(false);
    setAssessmentSecurity({
      tabSwitches: 0,
      fullscreenExits: 0,
    });

    try {
      if (!document.documentElement.requestFullscreen) {
        throw new Error('Fullscreen is required to start the test. Please use a supported browser.');
      }

      await enterFullscreenMode();
      const cameraResult = await startCamera();

      const data = new FormData();
      data.append('name', form.name);
      data.append('email', form.email);
      data.append('mobile', form.mobile);
      data.append('designation', activeDesignation);
      data.append('resume', form.resume);

      const registerResponse = await fetch(buildApiUrl('/api/candidates'), {
        method: 'POST',
        body: data,
      });

      const registered = await readResponsePayload(registerResponse);
      if (!registerResponse.ok) {
        throw new Error(registered.message || 'Candidate registration failed.');
      }

      setCandidate(registered.candidate);
      setAttempt(registered.attempt);
      setAptitudeTimeLeft(APTITUDE_DURATION_SECONDS);
      setCandidateMessage(
        registered.aptitudeBypassed
          ? cameraResult.warning || 'Testing email detected. Aptitude round passed automatically.'
          : cameraResult.warning || '',
      );

      if (registered.aptitudeBypassed || registered.attempt?.aptitude_passed) {
        await proceedAfterAptitude({
          score: registered.attempt?.aptitude_score ?? 40,
          total: registered.attempt?.aptitude_total ?? 40,
          passed: true,
          attempt: registered.attempt,
        });
        return;
      }

      const questionResponse = await fetch(buildApiUrl(`/api/attempts/${registered.attempt.id}/aptitude/questions`));
      const questionData = await readResponsePayload(questionResponse);
      setAptitudeQuestions(questionData.questions || []);
      setScreen('aptitude');
    } catch (error) {
      await exitFullscreenMode().catch(() => {});
      cleanupCamera();
      setCandidateMessage(error.message || 'Please allow fullscreen access to continue.');
    } finally {
      setCandidateBusy(false);
    }
  };

  const proceedAfterAptitude = useCallback(async (result) => {
    setAptitudeResult(result);

    if (!result.passed) {
      await stopCameraAndUpload(attempt.id);
      setScreen('failed');
      return;
    }

    const codingResponse = await fetch(buildApiUrl(`/api/coding/questions?designation=${encodeURIComponent(activeDesignation)}`));
    const codingData = await readResponsePayload(codingResponse);
    const questions = codingData.questions || [];
    setCodingQuestions(questions);
    setCodingAnswers(buildCodingDrafts(questions));
    setActiveCodingQuestionId(questions[0]?.id || '');
    setScreen('coding');
  }, [activeDesignation, attempt?.id, stopCameraAndUpload]);

  const submitAptitude = useCallback(async ({ autoSubmit = false } = {}) => {
    if (!attempt) {
      return;
    }

    if (!autoSubmit && unansweredQuestions.length) {
      setCandidateMessage(`Please answer all aptitude questions before submitting. Unanswered question numbers: ${unansweredQuestions.join(', ')}.`);
      return;
    }

    setCandidateBusy(true);
    setCandidateMessage(autoSubmit ? 'Time is over. Your aptitude round is being submitted automatically.' : '');

    try {
      const response = await fetch(buildApiUrl(`/api/attempts/${attempt.id}/aptitude`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: aptitudeAnswers }),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message || 'Unable to submit aptitude round.');
      }

      await proceedAfterAptitude(result);
    } catch (error) {
      setCandidateMessage(error.message || 'Something went wrong.');
    } finally {
      setCandidateBusy(false);
    }
  }, [attempt, unansweredQuestions, aptitudeAnswers, proceedAfterAptitude]);

  useEffect(() => {
    if (screen !== 'aptitude' || aptitudeTimeLeft > 0 || candidateBusy || autoSubmitTriggeredRef.current) {
      return;
    }

    autoSubmitTriggeredRef.current = true;
    submitAptitude({ autoSubmit: true });
  }, [aptitudeTimeLeft, screen, candidateBusy, submitAptitude]);

  const updateCodingAnswer = (questionId, field, value) => {
    setCodingAnswers((current) => ({
      ...current,
      [questionId]: {
        ...current[questionId],
        [field]: value,
        ...(field === 'code' ? { lastRun: null, finalEvaluation: null } : {}),
      },
    }));
  };

  const updateFrontendPane = (questionId, pane, value) => {
    setCodingAnswers((current) => {
      const currentAnswer = current[questionId] || {};
      const panes = {
        ...(currentAnswer.panes || {}),
        [pane]: value,
      };

      return {
        ...current,
        [questionId]: {
          ...currentAnswer,
          panes,
          code: composeFrontendCode(panes),
          lastRun: null,
          finalEvaluation: null,
        },
      };
    });
  };

  const changeCodingLanguage = (question, language) => {
    setCodingAnswers((current) => ({
      ...current,
      [question.id]: {
        ...current[question.id],
        language,
        ...(
          isFrontendQuestion(question)
            ? (() => {
                const panes = current[question.id]?.language === language && current[question.id]?.panes
                  ? current[question.id].panes
                  : buildFrontendPanes(question, language);
                return {
                  panes,
                  code: composeFrontendCode(panes),
                };
              })()
            : {
                code:
                  current[question.id]?.language === language && current[question.id]?.code
                    ? current[question.id].code
                    : question.starterCode?.[language] || current[question.id]?.code || '',
              }
        ),
        lastRun: null,
        finalEvaluation: null,
      },
    }));
  };

  const runCodingCode = async () => {
    if (!activeCodingQuestion) {
      return;
    }

    const submission = codingAnswers[activeCodingQuestion.id];
    if (!submission?.code?.trim()) {
      setCandidateMessage('Please write some code before running test cases.');
      return;
    }

    if (isTechnicalQuestion(activeCodingQuestion)) {
      setCandidateBusy(true);
      setCandidateMessage('');

      try {
        const response = await fetch(buildApiUrl('/api/coding/run'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionId: activeCodingQuestion.id,
            submission: {
              language: submission.language,
              code: submission.code,
              notes: submission.notes,
            },
          }),
        });

        const result = await readResponsePayload(response);
        if (!response.ok) {
          throw new Error(result.message || 'Unable to check answer.');
        }

        setCodingAnswers((current) => ({
          ...current,
          [activeCodingQuestion.id]: {
            ...current[activeCodingQuestion.id],
            lastRun: result,
          },
        }));
        setCandidateMessage('Answer check complete. Your response will still be reviewed by the admin team.');
      } catch (error) {
        setCandidateMessage(error.message || 'Answer check failed.');
      } finally {
        setCandidateBusy(false);
      }
      return;
    }

    setCandidateBusy(true);
    setCandidateMessage('');

    try {
      const response = await fetch(buildApiUrl('/api/coding/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: activeCodingQuestion.id,
          submission: {
            language: submission.language,
            code: submission.code,
            notes: submission.notes,
          },
        }),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message || 'Unable to run test cases.');
      }

      setCodingAnswers((current) => ({
        ...current,
        [activeCodingQuestion.id]: {
          ...current[activeCodingQuestion.id],
          lastRun: result,
        },
      }));
      setCandidateMessage(`Run complete: ${result.passedCount}/${result.totalCount} visible test cases passed.`);
    } catch (error) {
      setCandidateMessage(error.message || 'Running code failed.');
    } finally {
      setCandidateBusy(false);
    }
  };

  const submitCoding = async () => {
    if (!attempt) {
      return;
    }

    const incompleteCoding = codingQuestions.filter((question) => {
      const answer = codingAnswers[question.id];
      return !answer?.code?.trim();
    });

    if (incompleteCoding.length) {
      setCandidateMessage(`Please complete all coding problems before submitting. Pending: ${incompleteCoding.map((question) => question.title).join(', ')}.`);
      return;
    }

    setCandidateBusy(true);
    setCandidateMessage('');

    try {
      const response = await fetch(buildApiUrl(`/api/attempts/${attempt.id}/coding`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designation: activeDesignation,
          questions: codingQuestions,
          submissions: codingAnswers,
        }),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message || 'Unable to submit coding round.');
      }

      setCodingAnswers((current) => {
        const next = { ...current };
        Object.entries(result.submissions || {}).forEach(([questionId, submission]) => {
          next[questionId] = {
            ...next[questionId],
            ...submission,
            finalEvaluation: submission.evaluation || null,
          };
        });
        return next;
      });
      setCodingSummary(result.submissions || {});
      await stopCameraAndUpload(attempt.id);
      setScreen('complete');
    } catch (error) {
      setCandidateMessage(error.message || `${isTechnicalRound ? 'Technical' : 'Coding'} round submission failed.`);
    } finally {
      setCandidateBusy(false);
    }
  };

  const loginAdmin = async (event) => {
    event.preventDefault();
    setAdminBusy(true);
    setAdminMessage('');

    try {
      const response = await fetch(buildApiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminLogin),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message || 'Admin login failed.');
      }

      saveAdminSession(result);
      setPasswordChange((current) => ({
        ...current,
        currentPassword: adminLogin.password,
      }));
      setScreen(result.user.mustChangePassword ? 'admin-password' : 'admin-dashboard');
    } catch (error) {
      setAdminMessage(error.message || 'Unable to sign in to admin portal.');
    } finally {
      setAdminBusy(false);
    }
  };

  const changeAdminPassword = async (event) => {
    event.preventDefault();
    setAdminBusy(true);
    setAdminMessage('');

    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      setAdminBusy(false);
      setAdminMessage('New password and confirm password must match.');
      return;
    }

    try {
      const response = await adminFetch('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordChange.currentPassword,
          newPassword: passwordChange.newPassword,
        }),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message || 'Unable to update password.');
      }

      saveAdminSession(result);
      setPasswordChange(initialPasswordChange);
      setScreen('admin-dashboard');
    } catch (error) {
      setAdminMessage(error.message || 'Password update failed.');
    } finally {
      setAdminBusy(false);
    }
  };

  const createAdminUser = async (event) => {
    event.preventDefault();
    setAdminBusy(true);
    setAdminMessage('');

    try {
      const response = await adminFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(adminCreate),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message || 'Unable to create admin user.');
      }

      setAdminCreate(initialAdminCreate);
      setAdminMessage(`Admin access user ${result.user.username} was created with a temporary password.`);
      await loadAdminData();
    } catch (error) {
      setAdminMessage(error.message || 'Admin user creation failed.');
    } finally {
      setAdminBusy(false);
    }
  };

  const candidateProgressLabel = (() => {
    if (screen === 'aptitude') {
      return 'Round: aptitude';
    }
    if (screen === 'coding') {
      return 'Round: coding';
    }
    if (screen === 'failed' || screen === 'complete') {
      return 'Assessment complete';
    }
    return 'Registration pending';
  })();
  const activeCodingAnswer = activeCodingQuestion ? codingAnswers[activeCodingQuestion.id] : null;
  const activeQuestionUsesFrontendEditor = isFrontendQuestion(activeCodingQuestion);
  const activeQuestionUsesTechnicalEditor = isTechnicalQuestion(activeCodingQuestion);
  const isTechnicalRound = codingQuestions.length > 0 && codingQuestions.every(isTechnicalQuestion);
  const activePreviewDocument = activeQuestionUsesFrontendEditor
    ? buildPreviewDocument(activeCodingQuestion, activeCodingAnswer)
    : '';

  return (
    <main className="app-shell">
      <section className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">Tazviro Technologies</p>
          <h1>Welcome to Tazviro Technologies Hiring Portal</h1>
        </div>

        <div className="status-panel" aria-live="polite">
          <div className="status-panel-logo-wrap">
            <img className="status-panel-logo" src={logo} alt="Tazviro Technologies logo" />
          </div>
          <span>{screen.startsWith('admin') ? 'Admin portal' : candidateProgressLabel}</span>
          <strong>
            {screen.startsWith('admin')
              ? adminSession?.user?.username || 'Secure access'
              : screen === 'aptitude'
                ? formatTime(aptitudeTimeLeft)
                : aptitudeResult
                  ? `${aptitudeResult.score}/40`
                  : `${answeredCount}/40 answered`}
          </strong>
          {!screen.startsWith('admin') && (
            <small>
              {screen === 'aptitude'
                ? `${answeredCount} answered, ${unansweredQuestions.length} pending`
                : 'Candidate assessment tracking'}
            </small>
          )}
        </div>
      </section>

      <nav className="portal-switcher" aria-label="Portal switcher">
        {!screen.startsWith('admin') && !isAssessmentScreen && (
          <button
            type="button"
            className="tab-button active"
            onClick={() => setScreen('home')}
          >
            Candidate Portal
          </button>
        )}
      </nav>

      {!screen.startsWith('admin') && candidateMessage && <div className="alert">{candidateMessage}</div>}
      {screen.startsWith('admin') && adminMessage && <div className="alert">{adminMessage}</div>}

      {screen === 'home' && (
        <section className="workspace">
          <article className="welcome-card">
            <div className="landing-header">
              <p className="eyebrow">Assessment flow</p>
              <h2>Candidate Assessment</h2>
              <p className="landing-lead">
                A simple screening flow for Tazviro Technologies with one-time email access,
                monitored aptitude evaluation, and a structured coding round.
              </p>
            </div>

            <div className="overview-grid">
              <article className="overview-item">
                <strong>One-time access</strong>
                <p>Each email address can take the test only once.</p>
              </article>
              <article className="overview-item">
                <strong>Live monitoring</strong>
                <p>Camera and microphone access is optional for candidates taking the assessment.</p>
              </article>
              <article className="overview-item">
                <strong>Round-based selection</strong>
                <p>Candidates need 30+ in aptitude to unlock the coding round.</p>
              </article>
            </div>

            <div className="mini-stats">
              <div className="stat-pill">
                <span>Questions</span>
                <strong>40</strong>
              </div>
              <div className="stat-pill">
                <span>Duration</span>
                <strong>40 min</strong>
              </div>
              <div className="stat-pill">
                <span>Pass mark</span>
                <strong>30/40</strong>
              </div>
            </div>

            <div className="card-actions">
              <button type="button" className="primary-cta" onClick={() => setScreen('register')}>
                Start Candidate Registration
              </button>
            </div>
          </article>

          <aside className="rule-list">
            <h2>Rules and Regulations</h2>
            <ul className="bullet-list">
              {assessmentRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </aside>
        </section>
      )}

      {screen === 'register' && (
        <section className="workspace">
          <form className="candidate-form candidate-form-panel" onSubmit={startAssessment}>
            <div className="form-panel-header">
              <p className="eyebrow">Candidate details</p>
              <h2>Start your Assessment</h2>
              <p className="form-support-text">
                Complete your basic information, upload your resume, and continue to the aptitude round.
              </p>
            </div>

            <label>
              Full name
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </label>
            <label>
              Email ID
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
                placeholder="Enter your email address"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Mobile number
              <input
                name="mobile"
                value={form.mobile}
                onChange={updateField}
                placeholder="Enter your mobile number"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
            <label>
              Designation
              <select name="designationSelection" value={form.designationSelection} onChange={updateField}>
                {defaultDesignations.map((designation) => (
                  <option key={designation} value={designation}>{designation}</option>
                ))}
                <option value={customDesignationValue}>Other</option>
              </select>
            </label>
            {form.designationSelection === customDesignationValue && (
              <label>
                Enter your role
                <input
                  name="customDesignation"
                  value={form.customDesignation}
                  onChange={updateField}
                  placeholder="Type your role"
                  autoComplete="organization-title"
                  required
                />
              </label>
            )}
            <label className="file-input resume-upload-field">
              <span>Resume upload</span>
              <div className="upload-shell">
                <input name="resume" type="file" accept=".pdf,.doc,.docx" onChange={updateField} required />
                <small>Accepted formats: PDF, DOC, DOCX</small>
              </div>
            </label>
            <button type="submit" className="form-submit-button" disabled={!canStart || candidateBusy}>
              {candidateBusy ? 'Starting...' : 'Start test'}
            </button>
          </form>

          <aside className="rule-list">
            <h2>Before the assessment starts</h2>
            <ul className="bullet-list">
              {assessmentRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </aside>
        </section>
      )}

      {(screen === 'aptitude' || screen === 'coding') && (
        <section className="monitor-strip">
          <div>
            <strong>{candidate?.name}</strong>
            <span>{candidate?.email} | {activeDesignation}</span>
          </div>
          <div className="monitor-metrics">
            <span className="timer-chip security-chip">
              Tab switches: {assessmentSecurity.tabSwitches}
            </span>
            <span className="timer-chip security-chip">
              Fullscreen exits: {assessmentSecurity.fullscreenExits}
            </span>
            {screen === 'aptitude' && (
              <>
                <span className={`timer-chip ${aptitudeTimeLeft <= 300 ? 'timer-warning' : ''}`}>
                  Time left: {formatTime(aptitudeTimeLeft)}
                </span>
                <span className="timer-chip">Answered: {answeredCount}/40</span>
              </>
            )}
            {stream && <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />}
          </div>
        </section>
      )}

      {screen === 'aptitude' && (
        <section className="questions">
          <div className="section-heading">
            <div>
              <h2>Aptitude round</h2>
              <p>Complete all 40 questions. You have 1 minute per question, for a total of 40 minutes.</p>
            </div>
          </div>

          <article className="question-card summary-card">
            <div className="summary-grid">
              <div>
                <strong>Answered</strong>
                <span>{answeredCount} / 40</span>
              </div>
              <div>
                <strong>Unanswered</strong>
                <span>{unansweredQuestions.length}</span>
              </div>
              <div>
                <strong>Time left</strong>
                <span>{formatTime(aptitudeTimeLeft)}</span>
              </div>
            </div>
            {!!unansweredQuestions.length && (
              <p className="warning-text">
                Unanswered question numbers: {unansweredQuestions.join(', ')}
              </p>
            )}
          </article>

          {aptitudeQuestions.map((question, index) => (
            <article className={`question-card ${!aptitudeAnswers[question.id] ? 'pending-question' : ''}`} key={question.id}>
              <div className="question-headline">
                <h3>{index + 1}. {question.question}</h3>
                <span className={`question-badge ${aptitudeAnswers[question.id] ? 'answered-badge' : 'pending-badge'}`}>
                  {aptitudeAnswers[question.id] ? 'Answered' : 'Pending'}
                </span>
              </div>
              <div className="options">
                {question.options.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={aptitudeAnswers[question.id] === option}
                      disabled={assessmentLocked}
                      onChange={() => setAptitudeAnswers((current) => ({ ...current, [question.id]: option }))}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </article>
          ))}

          <div className="section-heading">
            <div>
              <h2>Ready to submit?</h2>
              <p>Review the unanswered count above, then submit your aptitude round from here.</p>
            </div>
            <button type="button" onClick={() => submitAptitude()} disabled={candidateBusy || assessmentLocked}>
              {candidateBusy ? 'Submitting...' : 'Submit assessment'}
            </button>
          </div>
        </section>
      )}

      {screen === 'coding' && activeCodingQuestion && (
        <section className="coding-shell">
          <div className="section-heading">
            <div>
              <h2>{isTechnicalRound ? 'Technical round' : 'Coding round'}</h2>
              <p>
                {isTechnicalRound
                  ? 'Role-specific technical questions based on the designation entered during registration.'
                  : 'Platform-style workspace for real coding answers, explanations, and problem review.'}
              </p>
            </div>
            <button type="button" onClick={submitCoding} disabled={candidateBusy || assessmentLocked}>
              {candidateBusy ? 'Submitting...' : `Submit ${isTechnicalRound ? 'technical' : 'coding'} round`}
            </button>
          </div>

          <div className="coding-layout">
            <aside className="coding-sidebar">
              <div className="question-card">
                <h3>{isTechnicalRound ? 'Questions' : 'Problems'}</h3>
                <div className="coding-tabs">
                  {codingQuestions.map((question, index) => {
                    const answer = codingAnswers[question.id];
                    const evaluation = answer?.finalEvaluation || answer?.lastRun;
                    const statusText = evaluation
                      ? `${evaluation.passedCount}/${evaluation.totalCount} passed`
                      : Boolean(answer?.code?.trim())
                        ? 'Draft saved'
                        : 'Pending';
                    return (
                      <button
                        key={question.id}
                        type="button"
                        className={`coding-tab ${activeCodingQuestionId === question.id ? 'coding-tab-active' : ''}`}
                        disabled={assessmentLocked}
                        onClick={() => setActiveCodingQuestionId(question.id)}
                      >
                        <span>{index + 1}. {question.title}</span>
                        <small>{statusText}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="question-card">
                <h3>Rules</h3>
                <ul className="bullet-list">
                  {codingRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            </aside>

            <div className="coding-main">
              <article className="question-card coding-problem">
                <div className="problem-header">
                  <div>
                    <p className="eyebrow">{activeQuestionUsesTechnicalEditor ? 'Technical question' : 'Coding problem'}</p>
                    <h3>{activeCodingQuestion.title}</h3>
                  </div>
                  <div className="problem-meta">
                    <span>{activeCodingQuestion.difficulty}</span>
                    <span>{activeCodingQuestion.estimatedTime}</span>
                    <span>{activeCodingQuestion.category}</span>
                  </div>
                </div>
                <p>{activeCodingQuestion.prompt}</p>
                <p><strong>Task:</strong> {activeCodingQuestion.task}</p>
                <div className="constraint-box">
                  <strong>Constraints</strong>
                  <ul className="bullet-list">
                    {activeCodingQuestion.constraints?.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="sample-grid">
                  {(activeCodingQuestion.publicCases || []).map((sample) => (
                    <div className="sample-card" key={sample.label}>
                      <strong>{sample.label}</strong>
                      <pre>Input: {typeof sample.input === 'string' ? sample.input : JSON.stringify(sample.input, null, 2)}</pre>
                      <pre>Expected: {typeof sample.output === 'string' ? sample.output : JSON.stringify(sample.output, null, 2)}</pre>
                      <p>{sample.explanation}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="question-card editor-card">
                <div className="editor-toolbar">
                  <div className="editor-title-block">
                    <strong>Editor</strong>
                    <span>
                      {activeQuestionUsesTechnicalEditor
                        ? 'Write a clear technical answer, check it, then submit for admin review.'
                        : 'Write code, run visible cases, then submit for final evaluation.'}
                    </span>
                  </div>
                  <div className="language-picker">
                    <span className="language-label">Language</span>
                    <div className="language-options" role="tablist" aria-label="Programming languages">
                      {activeCodingQuestion.languages?.map((language) => (
                        <button
                          key={language}
                          type="button"
                          className={`language-option ${
                            (codingAnswers[activeCodingQuestion.id]?.language || activeCodingQuestion.languages?.[0] || '') === language
                              ? 'language-option-active'
                              : ''
                          }`}
                          disabled={assessmentLocked}
                          onClick={() => changeCodingLanguage(activeCodingQuestion, language)}
                        >
                          {language}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="editor-actions">
                  <button type="button" className="ghost-button" onClick={runCodingCode} disabled={candidateBusy || assessmentLocked}>
                    {candidateBusy ? 'Checking...' : activeQuestionUsesTechnicalEditor ? 'Check answer' : 'Run code'}
                  </button>
                  <button type="button" onClick={submitCoding} disabled={candidateBusy || assessmentLocked}>
                    {candidateBusy ? 'Submitting...' : `Submit ${isTechnicalRound ? 'technical' : 'coding'} round`}
                  </button>
                </div>

                {activeQuestionUsesFrontendEditor ? (
                  <div className="frontend-workbench">
                    <div className="frontend-panes" aria-label="Frontend editor panes">
                      <label className="frontend-pane">
                        <span>HTML</span>
                        <textarea
                          className="code-editor pane-editor"
                          value={activeCodingAnswer?.panes?.html || ''}
                          disabled={assessmentLocked}
                          onChange={(event) => updateFrontendPane(activeCodingQuestion.id, 'html', event.target.value)}
                          spellCheck="false"
                          placeholder="<section>...</section>"
                        />
                      </label>

                      <label className="frontend-pane">
                        <span>CSS</span>
                        <textarea
                          className="code-editor pane-editor"
                          value={activeCodingAnswer?.panes?.css || ''}
                          disabled={assessmentLocked}
                          onChange={(event) => updateFrontendPane(activeCodingQuestion.id, 'css', event.target.value)}
                          spellCheck="false"
                          placeholder=".profile-card { ... }"
                        />
                      </label>

                      <label className="frontend-pane">
                        <span>React</span>
                        <textarea
                          className="code-editor pane-editor"
                          value={activeCodingAnswer?.panes?.react || ''}
                          disabled={assessmentLocked}
                          onChange={(event) => updateFrontendPane(activeCodingQuestion.id, 'react', event.target.value)}
                          spellCheck="false"
                          placeholder="export default function App() { ... }"
                        />
                      </label>
                    </div>

                    <div className="preview-panel">
                      <div className="preview-header">
                        <strong>Live preview</strong>
                        <span>{activeCodingQuestion.mode === 'react' ? 'React' : 'HTML/CSS'}</span>
                      </div>
                      <iframe
                        title={`${activeCodingQuestion.title} live preview`}
                        sandbox="allow-scripts"
                        srcDoc={activePreviewDocument}
                      />
                    </div>
                  </div>
                ) : activeQuestionUsesTechnicalEditor ? (
                  <textarea
                    className="code-editor answer-editor"
                    value={codingAnswers[activeCodingQuestion.id]?.code || ''}
                    disabled={assessmentLocked}
                    onChange={(event) => updateCodingAnswer(activeCodingQuestion.id, 'code', event.target.value)}
                    spellCheck="true"
                    placeholder="Write your role-specific technical answer here."
                  />
                ) : (
                  <textarea
                    className="code-editor"
                    value={codingAnswers[activeCodingQuestion.id]?.code || ''}
                    disabled={assessmentLocked}
                    onChange={(event) => updateCodingAnswer(activeCodingQuestion.id, 'code', event.target.value)}
                    spellCheck="false"
                    placeholder="Write your code here like a real coding round submission."
                  />
                )}

                {!activeQuestionUsesTechnicalEditor && (
                  <label>
                    Explanation or notes
                    <textarea
                      className="notes-editor"
                      value={codingAnswers[activeCodingQuestion.id]?.notes || ''}
                      disabled={assessmentLocked}
                      onChange={(event) => updateCodingAnswer(activeCodingQuestion.id, 'notes', event.target.value)}
                      placeholder="Explain your approach, complexity, assumptions, or debugging notes."
                    />
                  </label>
                )}

                {(codingAnswers[activeCodingQuestion.id]?.lastRun || codingAnswers[activeCodingQuestion.id]?.finalEvaluation) && (
                  <div className="test-results-panel">
                    <div className="test-results-header">
                      <strong>Test results</strong>
                      <span>
                        {(codingAnswers[activeCodingQuestion.id]?.finalEvaluation || codingAnswers[activeCodingQuestion.id]?.lastRun).passedCount}
                        /
                        {(codingAnswers[activeCodingQuestion.id]?.finalEvaluation || codingAnswers[activeCodingQuestion.id]?.lastRun).totalCount}
                        {' '}passed
                      </span>
                    </div>
                    <div className="test-case-list">
                      {((codingAnswers[activeCodingQuestion.id]?.finalEvaluation || codingAnswers[activeCodingQuestion.id]?.lastRun).cases || []).map((item) => (
                        <article className={`test-case-card ${item.passed ? 'test-pass' : 'test-fail'}`} key={`${item.label}-${item.input ? JSON.stringify(item.input) : item.label}`}>
                          <div className="test-case-top">
                            <strong>{item.label}</strong>
                            <span>{item.passed ? 'Passed' : 'Failed'}</span>
                          </div>
                          <pre>Input: {typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2)}</pre>
                          <pre>Expected: {typeof item.expected === 'string' ? item.expected : JSON.stringify(item.expected, null, 2)}</pre>
                          {item.actual !== undefined && <pre>Actual: {typeof item.actual === 'string' ? item.actual : JSON.stringify(item.actual, null, 2)}</pre>}
                          {item.error && <p className="warning-text">{item.error}</p>}
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </div>
          </div>
        </section>
      )}

      {screen === 'failed' && (
        <section className="result-panel">
          <h2>{assessmentTerminationReason ? 'Assessment ended' : 'Assessment result saved'}</h2>
          {assessmentTerminationReason ? (
            <p>{assessmentTerminationReason}</p>
          ) : (
            <p>{candidate?.name} scored {aptitudeResult?.score}/40. Minimum required score is 30/40.</p>
          )}
          <p>
            {assessmentTerminationReason
              ? 'The candidate cannot continue after a tab switch or fullscreen exit.'
              : 'This candidate did not pass the aptitude round, and the result is now visible in the admin portal.'}
          </p>
          <button type="button" onClick={() => { resetCandidateFlow(); setScreen('home'); }}>
            Return to welcome screen
          </button>
        </section>
      )}

      {screen === 'complete' && (
        <section className="result-panel">
          <h2>Assessment submitted successfully</h2>
          <p>{candidate?.name} passed aptitude with {aptitudeResult?.score}/40 and completed the {isTechnicalRound ? 'technical' : 'coding'} round.</p>
          {codingSummary && (
            <div className="submission-list">
              {codingQuestions.map((question) => {
                const evaluation = codingSummary[question.id]?.evaluation;
                return (
                  <div className="submission-card" key={question.id}>
                    <strong>{question.title}</strong>
                    <p>{evaluation ? `${evaluation.passedCount}/${evaluation.totalCount} test cases passed.` : 'No evaluation available.'}</p>
                  </div>
                );
              })}
            </div>
          )}
          <p>Candidate details, resume, recording, and {isTechnicalRound ? 'technical' : 'coding'} answers are now available in the admin portal.</p>
          <button type="button" onClick={() => { resetCandidateFlow(); setScreen('home'); }}>
            Return to welcome screen
          </button>
        </section>
      )}

      {screen === 'admin-login' && (
        <section className="workspace admin-layout">
          <form className="admin-card" onSubmit={loginAdmin}>
            <h2>Admin login</h2>
            <p>Use your authorized admin credentials to access the Tazviro Technologies hiring dashboard.</p>
            <label>
              Username
              <input name="username" type="email" value={adminLogin.username} onChange={updateAdminForm(setAdminLogin)} required />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={passwordVisibility.adminLogin ? 'text' : 'password'}
                  value={adminLogin.password}
                  onChange={updateAdminForm(setAdminLogin)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => togglePasswordVisibility('adminLogin')}
                  aria-label={passwordVisibility.adminLogin ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={passwordVisibility.adminLogin} />
                </button>
              </div>
            </label>
            <button type="submit" disabled={adminBusy}>
              {adminBusy ? 'Signing in...' : 'Login to admin portal'}
            </button>
          </form>

          <aside className="rule-list">
            <h2>Admin access includes</h2>
            <p>Candidate list with full details, aptitude result, completion status, resume path, and recording path.</p>
            <p>Creation of additional admin users with a temporary password.</p>
            <p>Forced password change when a newly created admin logs in for the first time.</p>
          </aside>
        </section>
      )}

      {screen === 'admin-password' && (
        <section className="workspace admin-layout">
          <form className="admin-card" onSubmit={changeAdminPassword}>
            <h2>Change temporary password</h2>
            <p>First login requires a password update before entering the admin dashboard.</p>
            <label>
              Current password
              <div className="password-field">
                <input
                  name="currentPassword"
                  type={passwordVisibility.currentPassword ? 'text' : 'password'}
                  value={passwordChange.currentPassword}
                  onChange={updateAdminForm(setPasswordChange)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => togglePasswordVisibility('currentPassword')}
                  aria-label={passwordVisibility.currentPassword ? 'Hide current password' : 'Show current password'}
                >
                  <EyeIcon open={passwordVisibility.currentPassword} />
                </button>
              </div>
            </label>
            <label>
              New password
              <div className="password-field">
                <input
                  name="newPassword"
                  type={passwordVisibility.newPassword ? 'text' : 'password'}
                  value={passwordChange.newPassword}
                  onChange={updateAdminForm(setPasswordChange)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => togglePasswordVisibility('newPassword')}
                  aria-label={passwordVisibility.newPassword ? 'Hide new password' : 'Show new password'}
                >
                  <EyeIcon open={passwordVisibility.newPassword} />
                </button>
              </div>
            </label>
            <label>
              Confirm new password
              <div className="password-field">
                <input
                  name="confirmPassword"
                  type={passwordVisibility.confirmPassword ? 'text' : 'password'}
                  value={passwordChange.confirmPassword}
                  onChange={updateAdminForm(setPasswordChange)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => togglePasswordVisibility('confirmPassword')}
                  aria-label={passwordVisibility.confirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <EyeIcon open={passwordVisibility.confirmPassword} />
                </button>
              </div>
            </label>
            <button type="submit" disabled={adminBusy}>
              {adminBusy ? 'Updating...' : 'Save new password'}
            </button>
          </form>
        </section>
      )}

      {screen === 'admin-dashboard' && (
        <section className="dashboard-shell">
          <div className="dashboard-header">
            <div>
              <h2>Admin dashboard</h2>
              <p>Review who passed, who did not pass, and the full candidate submission details.</p>
            </div>
            <div className="card-actions">
              <button type="button" className="ghost-button" onClick={() => loadAdminData()}>
                {adminLoading ? 'Refreshing...' : 'Refresh data'}
              </button>
              <button type="button" onClick={() => { clearAdminSession(); setScreen('admin-login'); }}>
                Logout
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="admin-card">
              <h3>Create admin user</h3>
              <form className="stack-form" onSubmit={createAdminUser}>
                <label>
                  Admin username
                  <input
                    name="username"
                    type="email"
                    value={adminCreate.username}
                    onChange={updateAdminForm(setAdminCreate)}
                    required
                  />
                </label>
                <label>
                  Temporary password
                  <div className="password-field">
                    <input
                      name="temporaryPassword"
                      type={passwordVisibility.temporaryPassword ? 'text' : 'password'}
                      value={adminCreate.temporaryPassword}
                      onChange={updateAdminForm(setAdminCreate)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => togglePasswordVisibility('temporaryPassword')}
                      aria-label={passwordVisibility.temporaryPassword ? 'Hide temporary password' : 'Show temporary password'}
                    >
                      <EyeIcon open={passwordVisibility.temporaryPassword} />
                    </button>
                  </div>
                </label>
                <button type="submit" disabled={adminBusy}>
                  {adminBusy ? 'Creating...' : 'Create admin access'}
                </button>
              </form>
            </section>

            <section className="admin-card">
              <h3>Admin users</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Status</th>
                      <th>Created by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>{user.must_change_password ? 'Temporary password pending' : 'Active'}</td>
                        <td>{user.created_by_username || 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="admin-card">
            <h3>Candidate results</h3>
            <div className="candidate-result-list">
              {adminCandidates.map((item) => {
                const candidateKey = item.attempt_id || item.candidate_id;
                const isExpanded = expandedCandidateId === candidateKey;

                return (
                  <article className="candidate-result-card" key={candidateKey}>
                    <div className="candidate-result-top">
                      <div className="candidate-identity">
                        <h4>{item.name}</h4>
                        <p>{item.email}</p>
                      </div>
                      <span className={`status-pill ${item.aptitude_passed ? 'status-pass' : 'status-fail'}`}>
                        {item.assessment_status}
                      </span>
                    </div>

                    <div className="candidate-meta-grid">
                      <div>
                        <span>Mobile</span>
                        <strong>{item.mobile}</strong>
                      </div>
                      <div>
                        <span>Designation</span>
                        <strong>{item.designation}</strong>
                      </div>
                      <div>
                        <span>Aptitude</span>
                        <strong>{item.aptitude_score ?? 0}/{item.aptitude_total ?? 40}</strong>
                      </div>
                    </div>

                    <div className="asset-grid">
                      <div className="asset-card">
                        <span>Resume</span>
                        <strong>{item.resume_original_name || 'Not uploaded'}</strong>
                        <div className="inline-actions">
                          {item.resume_view_url ? (
                            <>
                              <a className="text-action" href={getApiAssetUrl(item.resume_view_url)} target="_blank" rel="noreferrer">View</a>
                              <a className="text-action" href={getApiAssetUrl(item.resume_download_url)}>Download</a>
                            </>
                          ) : (
                            <em>Unavailable</em>
                          )}
                        </div>
                      </div>

                      <div className="asset-card">
                        <span>Video recording</span>
                        <strong>{item.recording_view_url ? 'Available' : 'Not uploaded yet'}</strong>
                        <div className="inline-actions">
                          {item.recording_view_url ? (
                            <a className="text-action" href={getApiAssetUrl(item.recording_view_url)} target="_blank" rel="noreferrer">View recording</a>
                          ) : (
                            <em>Unavailable</em>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button details-button"
                        onClick={() => setExpandedCandidateId(isExpanded ? null : candidateKey)}
                      >
                        {isExpanded ? 'Hide details' : 'View more details'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="expanded-details">
                        <div className="details-block">
                          <h5>Coding answers</h5>
                          <pre>{JSON.stringify(item.coding_submissions || {}, null, 2)}</pre>
                        </div>
                        <div className="details-block">
                          <h5>Question set</h5>
                          <pre>{JSON.stringify(item.coding_questions || [], null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}

export default App;
