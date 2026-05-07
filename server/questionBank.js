const APTITUDE_TOTAL = 40;
const APTITUDE_PASS_MARK = 30;

const staticAptitudeQuestions = [
  { id: 'static-1', question: 'Find the next number: 3, 9, 27, 81, ?', options: ['108', '162', '216', '243'], answer: '243' },
  { id: 'static-2', question: 'Find the odd one: Apple, Mango, Carrot, Banana', options: ['Apple', 'Mango', 'Carrot', 'Banana'], answer: 'Carrot' },
  { id: 'static-3', question: 'Find the next letters: AB, DE, GH, ?', options: ['IJ', 'JK', 'KL', 'LM'], answer: 'JK' },
  { id: 'static-4', question: 'Which is the smallest fraction?', options: ['1/2', '2/3', '3/4', '4/5'], answer: '1/2' },
  { id: 'static-5', question: 'If CODING is written as DPEJOH, then TEST is written as:', options: ['UFTU', 'SDRS', 'VGUW', 'UERT'], answer: 'UFTU' },
  { id: 'static-6', question: 'The LCM of 12 and 18 is:', options: ['24', '30', '36', '72'], answer: '36' },
  { id: 'static-7', question: 'The HCF of 48 and 60 is:', options: ['6', '8', '12', '16'], answer: '12' },
  { id: 'static-8', question: 'What is the square root of 196?', options: ['12', '13', '14', '16'], answer: '14' },
  { id: 'static-9', question: 'Choose the synonym of "Rapid".', options: ['Slow', 'Fast', 'Weak', 'Late'], answer: 'Fast' },
  { id: 'static-10', question: 'Choose the antonym of "Expand".', options: ['Grow', 'Stretch', 'Contract', 'Increase'], answer: 'Contract' },
  { id: 'static-11', question: 'Which number is divisible by both 3 and 5?', options: ['25', '30', '32', '42'], answer: '30' },
  { id: 'static-12', question: 'Find the next number: 1, 4, 9, 16, ?', options: ['20', '24', '25', '36'], answer: '25' },
  { id: 'static-13', question: 'Which word is different: Dog, Cat, Lion, Sparrow', options: ['Dog', 'Cat', 'Lion', 'Sparrow'], answer: 'Sparrow' },
  { id: 'static-14', question: 'The value of 2^5 is:', options: ['16', '25', '32', '64'], answer: '32' },
  { id: 'static-15', question: 'A cube has how many faces?', options: ['4', '6', '8', '12'], answer: '6' },
  { id: 'static-16', question: 'Choose the correctly spelled word.', options: ['Definately', 'Definitely', 'Definetly', 'Defiantly'], answer: 'Definitely' },
  { id: 'static-17', question: 'The sum of angles in a triangle is:', options: ['90 degrees', '120 degrees', '180 degrees', '360 degrees'], answer: '180 degrees' },
  { id: 'static-18', question: 'Which comes next: Z, X, V, T, ?', options: ['R', 'S', 'U', 'W'], answer: 'R' },
  { id: 'static-19', question: 'Convert 0.75 to a percentage.', options: ['7.5%', '25%', '75%', '750%'], answer: '75%' },
];

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function uniqueOptions(correct, distractors) {
  const values = [correct, ...distractors].map(String);
  return [...new Set(values)].slice(0, 4);
}

function ensureFourOptions(correct, distractors) {
  const options = uniqueOptions(correct, distractors);
  let nextValue = Number(correct);

  while (options.length < 4) {
    nextValue += 1;
    options.push(String(nextValue));
  }

  return shuffle(options);
}

function createQuestion(id, question, answer, distractors) {
  return {
    id,
    question,
    options: ensureFourOptions(answer, distractors),
    answer: String(answer),
  };
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function buildGeneratedAptitudeQuestions() {
  const generated = [];

  range(1, 20).forEach((index) => {
    const workers = 8 + index;
    const days = 10 + index;
    const fasterWorkers = workers + 4 + (index % 5);
    const answer = Math.round((workers * days) / fasterWorkers);

    generated.push(createQuestion(
      `workers-${index}`,
      `If ${workers} workers finish a job in ${days} days, how many days will ${fasterWorkers} workers take?`,
      answer,
      [answer - 2, answer + 2, answer + 4],
    ));
  });

  range(1, 20).forEach((index) => {
    const original = 80 + index * 10;
    const percent = 10 + (index % 5) * 5;
    const increased = original + ((original * percent) / 100);

    generated.push(createQuestion(
      `percent-rise-${index}`,
      `A number increased by ${percent}% becomes ${increased}. What is the original number?`,
      original,
      [original - 20, original + 10, original + 20],
    ));
  });

  range(1, 18).forEach((index) => {
    const value = 120 + index * 8;
    const percent = 15 + (index % 4) * 5;
    const answer = (value * percent) / 100;

    generated.push(createQuestion(
      `percent-of-${index}`,
      `What is ${percent}% of ${value}?`,
      answer,
      [answer - 8, answer + 4, answer + 12],
    ));
  });

  range(1, 18).forEach((index) => {
    const price = 300 + index * 25;
    const discount = 5 + (index % 4) * 5;
    const sellingPrice = price - ((price * discount) / 100);

    generated.push(createQuestion(
      `discount-${index}`,
      `A shopkeeper marks an item at Rs. ${price} and gives ${discount}% discount. What is the selling price?`,
      `Rs. ${sellingPrice}`,
      [`Rs. ${sellingPrice - 20}`, `Rs. ${sellingPrice + 10}`, `Rs. ${sellingPrice + 25}`],
    ));
  });

  range(1, 18).forEach((index) => {
    const number = 160 + index * 10;
    const percent = 10 + (index % 5) * 5;
    const part = (number * percent) / 100;

    generated.push(createQuestion(
      `percent-find-${index}`,
      `If ${percent}% of a number is ${part}, the number is:`,
      number,
      [number - 40, number + 20, number + 40],
    ));
  });

  range(1, 16).forEach((index) => {
    const boys = 12 + index * 2;
    const girls = 8 + index;
    const total = boys + girls;
    const answer = Math.round((girls / total) * 100);

    generated.push(createQuestion(
      `girls-percent-${index}`,
      `A class has ${boys} boys and ${girls} girls. What percentage of the class are girls?`,
      `${answer}%`,
      [`${answer - 5}%`, `${answer + 5}%`, `${answer + 10}%`],
    ));
  });

  range(1, 16).forEach((index) => {
    const start = 100 + index * 10;
    const rise = 15 + (index % 4) * 5;
    const end = start + ((start * rise) / 100);

    generated.push(createQuestion(
      `price-rise-${index}`,
      `If the price rises from ${start} to ${end}, what is the percentage increase?`,
      `${rise}%`,
      [`${rise - 5}%`, `${rise + 5}%`, `${rise + 10}%`],
    ));
  });

  range(1, 16).forEach((index) => {
    const distance = 45 + index * 5;
    const hours = 1 + (index % 3) * 0.5;
    const answer = Math.round(distance / hours);

    generated.push(createQuestion(
      `speed-${index}`,
      `A person travels ${distance} km in ${hours} hours. What is the speed?`,
      `${answer} km/h`,
      [`${answer - 10} km/h`, `${answer - 5} km/h`, `${answer + 5} km/h`],
    ));
  });

  return generated;
}

const fullAptitudeQuestionBank = [
  ...staticAptitudeQuestions,
  ...buildGeneratedAptitudeQuestions(),
];

function pickAptitudeQuestions(total = APTITUDE_TOTAL) {
  return shuffle(fullAptitudeQuestionBank).slice(0, total);
}

function sanitizeAptitudeQuestions(questions = []) {
  return questions.map(({ answer, ...question }) => question);
}

function gradeAptitude(answers = {}, questions = []) {
  return questions.reduce((score, question) => {
    return String(answers[question.id] || '') === String(question.answer) ? score + 1 : score;
  }, 0);
}

const backendProblems = [
  {
    id: 'be-1',
    title: 'Array Pair Sum',
    difficulty: 'Medium',
    estimatedTime: '20 min',
    category: 'backend',
    mode: 'runtime',
    languages: ['JavaScript', 'Python', 'Java', 'C', 'C++'],
    functionName: {
      JavaScript: 'findPair',
      Python: 'find_pair',
      Java: 'findPair',
      C: 'findPair',
      'C++': 'findPair',
    },
    prompt: 'Given an array of integers and a target value, return the indices of any two numbers whose sum equals the target.',
    task: 'Implement the function so that it returns a two-element array in ascending index order. Return an empty array when no valid pair exists.',
    constraints: [
      'Use zero-based indices.',
      'Do not use the same element twice.',
      'A correct solution should work efficiently on larger arrays.',
    ],
    publicCases: [
      { label: 'Sample 1', input: { nums: [2, 7, 11, 15], target: 9 }, expected: [0, 1], explanation: '2 + 7 equals 9.' },
      { label: 'Sample 2', input: { nums: [3, 2, 4], target: 6 }, expected: [1, 2], explanation: '2 + 4 equals 6.' },
    ],
    hiddenCases: [
      { input: { nums: [1, 5, 3, 9], target: 8 }, expected: [0, 2] },
      { input: { nums: [10, -2, 8, 5], target: 3 }, expected: [1, 3] },
      { input: { nums: [4, 4], target: 8 }, expected: [0, 1] },
    ],
    starterCode: {
      JavaScript: 'function findPair(nums, target) {\n  // return [index1, index2]\n  return [];\n}\n',
      Python: 'def find_pair(nums, target):\n    # return [index1, index2]\n    return []\n',
      Java: 'class Solution {\n    public int[] findPair(int[] nums, int target) {\n        return new int[0];\n    }\n}\n',
      C: 'int* findPair(int nums[], int numsSize, int target, int* returnSize) {\n    *returnSize = 0;\n    return NULL;\n}\n',
      'C++': 'vector<int> findPair(vector<int> nums, int target) {\n    return {};\n}\n',
    },
  },
  {
    id: 'be-2',
    title: 'Group Anagrams',
    difficulty: 'Medium',
    estimatedTime: '22 min',
    category: 'backend',
    mode: 'runtime',
    languages: ['JavaScript', 'Python', 'Java', 'C++'],
    functionName: {
      JavaScript: 'groupAnagrams',
      Python: 'group_anagrams',
      Java: 'groupAnagrams',
      'C++': 'groupAnagrams',
    },
    prompt: 'Group words that are anagrams of each other.',
    task: 'Return a list of groups. Each group should contain the original words that belong together. Sort each group alphabetically and sort the final list by the first word in each group.',
    constraints: [
      'Treat lowercase strings only.',
      'Every input word must appear exactly once in the output.',
      'Sort each group alphabetically before returning, and sort the final list by each group\'s first word.',
    ],
    publicCases: [
      { label: 'Sample 1', input: { words: ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'] }, expected: [['ate', 'eat', 'tea'], ['bat'], ['nat', 'tan']], explanation: 'Anagrams share the same sorted-character signature.' },
      { label: 'Sample 2', input: { words: ['abc', 'bca', 'cab', 'foo'] }, expected: [['abc', 'bca', 'cab'], ['foo']], explanation: 'The three permutations of abc form one group.' },
    ],
    hiddenCases: [
      { input: { words: ['listen', 'silent', 'enlist', 'google'] }, expected: [['enlist', 'listen', 'silent'], ['google']] },
      { input: { words: ['rat', 'tar', 'art', 'car'] }, expected: [['art', 'rat', 'tar'], ['car']] },
      { input: { words: ['a'] }, expected: [['a']] },
    ],
    starterCode: {
      JavaScript: 'function groupAnagrams(words) {\n  // return an array of groups\n  return [];\n}\n',
      Python: 'def group_anagrams(words):\n    # return a list of groups\n    return []\n',
      Java: 'import java.util.*;\n\nclass Solution {\n    public List<List<String>> groupAnagrams(String[] words) {\n        return new ArrayList<>();\n    }\n}\n',
      'C++': 'vector<vector<string>> groupAnagrams(vector<string> words) {\n    return {};\n}\n',
    },
  },
  {
    id: 'be-3',
    title: 'Count Vowels',
    difficulty: 'Easy',
    estimatedTime: '15 min',
    category: 'backend',
    mode: 'runtime',
    languages: ['JavaScript', 'Python', 'Java', 'C', 'C++'],
    functionName: {
      JavaScript: 'countVowels',
      Python: 'count_vowels',
      Java: 'countVowels',
      C: 'countVowels',
      'C++': 'countVowels',
    },
    prompt: 'Given a string, count how many vowels it contains.',
    task: 'Return the total count of a, e, i, o, and u characters. The match should be case-insensitive.',
    constraints: [
      'Treat uppercase and lowercase vowels the same.',
      'Only English vowels a, e, i, o, and u should be counted.',
      'Return 0 when the string has no vowels.',
    ],
    publicCases: [
      { label: 'Sample 1', input: { text: 'Tazviro Technologies' }, expected: 8, explanation: 'The string contains eight vowels.' },
      { label: 'Sample 2', input: { text: 'Backend' }, expected: 2, explanation: 'The vowels are a and e.' },
    ],
    hiddenCases: [
      { input: { text: 'AEIOUxyz' }, expected: 5 },
      { input: { text: 'rhythm' }, expected: 0 },
      { input: { text: 'Full Stack Developer' }, expected: 6 },
    ],
    starterCode: {
      JavaScript: 'function countVowels(text) {\n  return 0;\n}\n',
      Python: 'def count_vowels(text):\n    return 0\n',
      Java: 'class Solution {\n    public int countVowels(String text) {\n        return 0;\n    }\n}\n',
      C: 'int countVowels(const char* text) {\n    return 0;\n}\n',
      'C++': 'int countVowels(string text) {\n    return 0;\n}\n',
    },
  },
];

const frontendProblems = [
  {
    id: 'fe-1',
    title: 'Responsive Profile Card',
    difficulty: 'Medium',
    estimatedTime: '18 min',
    category: 'frontend',
    mode: 'markup',
    languages: ['HTML/CSS'],
    prompt: 'Build a responsive profile card with avatar, candidate name, role, and a CTA button.',
    task: 'Write HTML and CSS in one editor. Use semantic markup and make the card stack neatly on small screens.',
    constraints: [
      'Include a root container with class `profile-card`.',
      'Include candidate name, role text, and a button.',
      'Use either `display: grid` or `display: flex` for layout.',
    ],
    publicCases: [
      { label: 'Sample 1', input: 'Required sections', output: 'Card, name, role, CTA', explanation: 'The card should include core content blocks.' },
    ],
    hiddenCases: [
      { checks: ['profile-card', '<button', 'display:'] },
      { checks: ['profile-card', 'candidate-role', '@media'] },
    ],
    starterCode: {
      'HTML/CSS': `<style>\n.profile-card {\n  /* add styles */\n}\n\n.candidate-role {\n  /* add styles */\n}\n</style>\n\n<section class="profile-card">\n  <img src="https://via.placeholder.com/96" alt="Candidate avatar" />\n  <div>\n    <h1>Candidate Name</h1>\n    <p class="candidate-role">Frontend Developer</p>\n    <button type="button">View profile</button>\n  </div>\n</section>\n`,
    },
  },
  {
    id: 'fe-2',
    title: 'React Candidate Filter',
    difficulty: 'Medium',
    estimatedTime: '22 min',
    category: 'frontend',
    mode: 'react',
    languages: ['JavaScript', 'TypeScript'],
    prompt: 'Create a React component that filters candidate names as the user types.',
    task: 'Render an input and a filtered list. The component should update immediately and show a fallback message when no items match.',
    constraints: [
      'Use React state for the search term.',
      'Filter using a case-insensitive match.',
      'Render a fallback like "No candidates found" when the filtered list is empty.',
    ],
    publicCases: [
      { label: 'Sample 1', input: 'search = "an"', output: 'Shows only candidates whose names contain "an"', explanation: 'Filtering should be case-insensitive.' },
    ],
    hiddenCases: [
      { checks: ['useState', 'filter(', 'toLowerCase', 'No candidates found'] },
      { checks: ['<input', '.map(', 'search'] },
    ],
    starterCode: {
      JavaScript: `import React, { useState } from 'react';\n\nconst candidates = ['Anu', 'Bharath', 'Deepa', 'Kiran'];\n\nexport default function CandidateFilter() {\n  const [search, setSearch] = useState('');\n\n  return (\n    <section>\n      <input\n        value={search}\n        onChange={(event) => setSearch(event.target.value)}\n        placeholder="Search candidates"\n      />\n    </section>\n  );\n}\n`,
      TypeScript: `import React, { useState } from 'react';\n\nconst candidates: string[] = ['Anu', 'Bharath', 'Deepa', 'Kiran'];\n\nexport default function CandidateFilter(): JSX.Element {\n  const [search, setSearch] = useState('');\n\n  return (\n    <section>\n      <input\n        value={search}\n        onChange={(event) => setSearch(event.target.value)}\n        placeholder="Search candidates"\n      />\n    </section>\n  );\n}\n`,
    },
  },
];

function createTechnicalProblem(id, title, category, prompt, task, checks) {
  return {
    id,
    title,
    difficulty: 'Medium',
    estimatedTime: '12 min',
    category,
    mode: 'technical',
    languages: ['Answer'],
    prompt,
    task,
    constraints: [
      'Write a practical answer in your own words.',
      'Mention tools, trade-offs, and real project considerations where relevant.',
      'Your answer will be saved for admin review.',
    ],
    publicCases: [
      {
        label: 'Review focus',
        input: 'Written technical answer',
        expected: 'Clear role-specific concepts and practical reasoning',
        explanation: 'The answer is checked for important concepts and remains available for manual review.',
        checks,
        minimumMatches: 2,
      },
    ],
    hiddenCases: [
      { checks, minimumMatches: 2 },
    ],
    starterCode: {
      Answer: '',
    },
  };
}

const qaProblems = [
  createTechnicalProblem(
    'qa-1',
    'Test Plan for Login Flow',
    'qa',
    'You need to test a login screen with email, password, validation messages, and forgot-password link.',
    'Write the key functional, negative, edge-case, and regression test cases you would execute.',
    ['positive', 'negative', 'validation', 'edge', 'regression', 'forgot', 'security'],
  ),
  createTechnicalProblem(
    'qa-2',
    'Bug Report Quality',
    'qa',
    'A user says the submit button sometimes creates two records.',
    'Write a good bug report with steps to reproduce, expected result, actual result, severity, and useful evidence.',
    ['steps', 'expected', 'actual', 'severity', 'screenshot', 'logs', 'reproduce'],
  ),
];

const devopsProblems = [
  createTechnicalProblem(
    'devops-1',
    'Deployment Pipeline',
    'devops',
    'Design a simple CI/CD pipeline for a Node.js and React application.',
    'Explain build, test, environment variables, deployment, rollback, and monitoring steps.',
    ['build', 'test', 'environment', 'deploy', 'rollback', 'monitoring', 'pipeline'],
  ),
  createTechnicalProblem(
    'devops-2',
    'Production Incident',
    'devops',
    'An API is returning 500 errors after a deployment.',
    'Explain how you would investigate, mitigate, roll back if needed, and prevent the issue from recurring.',
    ['logs', 'metrics', 'rollback', 'deploy', 'monitoring', 'root cause', 'alert'],
  ),
];

const dataProblems = [
  createTechnicalProblem(
    'data-1',
    'Candidate Funnel Metrics',
    'data',
    'You have candidate registration, aptitude score, and coding completion data.',
    'Describe useful metrics, SQL/table assumptions, and how you would present insights to the hiring team.',
    ['conversion', 'score', 'sql', 'dashboard', 'filter', 'trend', 'insight'],
  ),
  createTechnicalProblem(
    'data-2',
    'Data Cleaning Approach',
    'data',
    'Candidate data has duplicate emails, inconsistent mobile numbers, and missing designations.',
    'Explain how you would clean, validate, deduplicate, and report data quality issues.',
    ['duplicate', 'missing', 'validate', 'clean', 'deduplicate', 'quality', 'standardize'],
  ),
];

const mobileProblems = [
  createTechnicalProblem(
    'mobile-1',
    'Mobile App Offline Handling',
    'mobile',
    'A mobile assessment app must work when the network becomes unstable.',
    'Explain how you would handle offline state, retries, local storage, sync, and user feedback.',
    ['offline', 'retry', 'storage', 'sync', 'network', 'feedback', 'cache'],
  ),
  createTechnicalProblem(
    'mobile-2',
    'Mobile Performance Review',
    'mobile',
    'A screen with a long candidate list is slow on low-end devices.',
    'Explain how you would diagnose and improve rendering, memory usage, and API loading.',
    ['render', 'memory', 'pagination', 'lazy', 'cache', 'profile', 'performance'],
  ),
];

const generalTechnicalProblems = [
  createTechnicalProblem(
    'tech-1',
    'Role-Specific Technical Approach',
    'technical',
    'Describe how you would approach a real task in the role you applied for.',
    'Include the tools you would use, the steps you would follow, risks you would watch for, and how you would verify quality.',
    ['tools', 'steps', 'risk', 'quality', 'verify', 'test', 'deliver'],
  ),
  createTechnicalProblem(
    'tech-2',
    'Problem Solving Scenario',
    'technical',
    'You receive an unclear task from a manager with a short deadline.',
    'Explain what questions you would ask, how you would break down the work, and how you would communicate progress.',
    ['questions', 'deadline', 'priority', 'breakdown', 'communicate', 'progress', 'clarify'],
  ),
];

const codingQuestions = {
  backend: backendProblems,
  frontend: frontendProblems,
  qa: qaProblems,
  devops: devopsProblems,
  data: dataProblems,
  mobile: mobileProblems,
  technical: generalTechnicalProblems,
  fullstack: [
    { ...backendProblems[0], id: 'fs-be-1', title: 'Backend: Array Pair Sum' },
    { ...frontendProblems[1], id: 'fs-fe-1', title: 'Frontend: React Candidate Filter' },
  ],
};

function sanitizeCodingQuestion(question) {
  const { hiddenCases, functionName, mode, category, ...rest } = question;
  return {
    ...rest,
    mode,
    category,
    publicCases: (question.publicCases || []).map((item) => ({
      label: item.label,
      input: item.input,
      output: item.expected ?? item.output,
      explanation: item.explanation,
    })),
  };
}

function getQuestionSetKey(designation = '') {
  const normalized = designation.toLowerCase();

  if (normalized.includes('front') || normalized.includes('react') || normalized.includes('ui')) {
    return 'frontend';
  }

  if (normalized.includes('full')) {
    return 'fullstack';
  }

  if (normalized.includes('back') || normalized.includes('api') || normalized.includes('node') || normalized.includes('java') || normalized.includes('python')) {
    return 'backend';
  }

  if (normalized.includes('qa') || normalized.includes('test') || normalized.includes('quality')) {
    return 'qa';
  }

  if (normalized.includes('devops') || normalized.includes('cloud') || normalized.includes('aws') || normalized.includes('azure') || normalized.includes('sre')) {
    return 'devops';
  }

  if (normalized.includes('data') || normalized.includes('analyst') || normalized.includes('machine') || normalized.includes('ml') || normalized.includes('ai')) {
    return 'data';
  }

  if (normalized.includes('mobile') || normalized.includes('android') || normalized.includes('ios') || normalized.includes('flutter') || normalized.includes('react native')) {
    return 'mobile';
  }

  return 'technical';
}

function getCodingQuestions(designation = '') {
  const key = getQuestionSetKey(designation);
  return codingQuestions[key];
}

function getCodingQuestionById(questionId) {
  return Object.values(codingQuestions).flat()
    .find((question) => question.id === questionId) || null;
}

module.exports = {
  APTITUDE_PASS_MARK,
  APTITUDE_TOTAL,
  getCodingQuestionById,
  getCodingQuestions,
  gradeAptitude,
  pickAptitudeQuestions,
  sanitizeCodingQuestion,
  sanitizeAptitudeQuestions,
};
