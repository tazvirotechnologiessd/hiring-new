const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RUN_TIMEOUT_MS = 4000;

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((accumulator, key) => {
      accumulator[key] = normalizeValue(value[key]);
      return accumulator;
    }, {});
  }

  return value;
}

function valuesMatch(actual, expected) {
  return JSON.stringify(normalizeValue(actual)) === JSON.stringify(normalizeValue(expected));
}

function summarizeCaseResult(testCase, passed, actual, expected, error, index) {
  return {
    label: testCase.label || `Case ${index + 1}`,
    passed,
    input: testCase.input,
    expected,
    actual,
    error: error || '',
  };
}

function runProcess(command, args, workdir) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: workdir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, RUN_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        code: -1,
        stdout,
        stderr: error.code === 'ENOENT'
          ? `${command} is not installed or is not available on PATH.`
          : error.message,
        timedOut,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        code,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

async function withTempDir(task) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tazviro-coding-'));
  try {
    return await task(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function buildJavaScriptHarness(code, functionName, input) {
  return `${code}
const __input = ${JSON.stringify(input)};
const __result = ${functionName}(...Object.values(__input));
console.log(JSON.stringify(__result));
`;
}

function toCamelCase(value) {
  return String(value).replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function buildPythonHarness(code, functionName, input) {
  const alternateFunctionName = toCamelCase(functionName);
  return `${code}
import json
__input = json.loads(${JSON.stringify(JSON.stringify(input))})
__solution = globals().get('${functionName}') or globals().get('${alternateFunctionName}')
if __solution is None and 'Solution' in globals():
    __instance = Solution()
    __solution = getattr(__instance, '${functionName}', None) or getattr(__instance, '${alternateFunctionName}', None)
if __solution is None:
    raise NameError('Expected a Python function named ${functionName}${alternateFunctionName !== functionName ? ` or ${alternateFunctionName}` : ''}.')
__result = __solution(*list(__input.values()))
print(json.dumps(__result))
`;
}

function buildJavaHarness(code, functionName, input) {
  const keys = Object.keys(input);
  const declarations = keys.map((key) => {
    const value = input[key];
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === 'number')) {
        return `int[] ${key} = new int[] { ${value.join(', ')} };`;
      }

      if (value.every((item) => typeof item === 'string')) {
        return `String[] ${key} = new String[] { ${value.map((item) => `"${item}"`).join(', ')} };`;
      }
    }

    if (typeof value === 'number') {
      return `int ${key} = ${value};`;
    }

    return `String ${key} = "${String(value)}";`;
  }).join('\n        ');

  return `${code}

class Runner {
    public static void main(String[] args) {
        Solution solution = new Solution();
        ${declarations}
        Object result = solution.${functionName}(${keys.join(', ')});
        System.out.println(toJson(result));
    }

    private static String toJson(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof int[]) {
            return java.util.Arrays.toString((int[]) value).replace(" ", "");
        }
        if (value instanceof String[]) {
            return java.util.Arrays.toString((String[]) value).replace(" ", "").replace("\"", "\\\"");
        }
        if (value instanceof java.util.List<?>) {
            return listToJson((java.util.List<?>) value);
        }
        return String.valueOf(value);
    }

    private static String listToJson(java.util.List<?> list) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < list.size(); index += 1) {
            if (index > 0) {
                builder.append(',');
            }
            Object item = list.get(index);
            if (item instanceof java.util.List<?>) {
                builder.append(listToJson((java.util.List<?>) item));
            } else if (item instanceof String) {
                builder.append('"').append(item).append('"');
            } else {
                builder.append(String.valueOf(item));
            }
        }
        builder.append(']');
        return builder.toString();
    }
}
`;
}

function buildCValueDeclaration(key, value) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'number')) {
      return {
        declaration: `int ${key}[] = { ${value.join(', ')} };\n    int ${key}Size = ${value.length};`,
        argument: `${key}, ${key}Size`,
      };
    }

    if (value.every((item) => typeof item === 'string')) {
      return {
        declaration: `const char* ${key}[] = { ${value.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(', ')} };\n    int ${key}Size = ${value.length};`,
        argument: `${key}, ${key}Size`,
      };
    }
  }

  if (typeof value === 'number') {
    return {
      declaration: `int ${key} = ${value};`,
      argument: key,
    };
  }

  return {
    declaration: `const char* ${key} = "${String(value).replace(/"/g, '\\"')}";`,
    argument: key,
  };
}

function buildCHarness(code, functionName, input, expected) {
  const keys = Object.keys(input);
  const values = keys.map((key) => buildCValueDeclaration(key, input[key]));
  const declarations = values.map((value) => value.declaration).join('\n    ');
  const args = values.map((value) => value.argument);

  if (Array.isArray(expected) && expected.every((item) => typeof item === 'number')) {
    return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

${code}

int main(void) {
    ${declarations}
    int returnSize = 0;
    int* result = ${functionName}(${[...args, '&returnSize'].join(', ')});
    printf("[");
    for (int index = 0; index < returnSize; index += 1) {
        if (index > 0) {
            printf(",");
        }
        printf("%d", result[index]);
    }
    printf("]");
    return 0;
}
`;
  }

  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

${code}

int main(void) {
    ${declarations}
    int result = ${functionName}(${args.join(', ')});
    printf("%d", result);
    return 0;
}
`;
}

function buildCppValueDeclaration(key, value) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'number')) {
      return {
        declaration: `vector<int> ${key} = { ${value.join(', ')} };`,
        argument: key,
      };
    }

    if (value.every((item) => typeof item === 'string')) {
      return {
        declaration: `vector<string> ${key} = { ${value.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(', ')} };`,
        argument: key,
      };
    }
  }

  if (typeof value === 'number') {
    return {
      declaration: `int ${key} = ${value};`,
      argument: key,
    };
  }

  return {
    declaration: `string ${key} = "${String(value).replace(/"/g, '\\"')}";`,
    argument: key,
  };
}

function buildCppHarness(code, functionName, input) {
  const keys = Object.keys(input);
  const values = keys.map((key) => buildCppValueDeclaration(key, input[key]));
  const declarations = values.map((value) => value.declaration).join('\n    ');
  const args = values.map((value) => value.argument).join(', ');

  return `#include <bits/stdc++.h>
using namespace std;

${code}

string toJson(int value) {
    return to_string(value);
}

string toJson(const string& value) {
    string output = "\\"";
    for (char ch : value) {
        if (ch == '"') {
            output += "\\\\\\"";
        } else {
            output += ch;
        }
    }
    output += "\\"";
    return output;
}

template <typename T>
string toJson(const vector<T>& values) {
    string output = "[";
    for (size_t index = 0; index < values.size(); index += 1) {
        if (index > 0) {
            output += ",";
        }
        output += toJson(values[index]);
    }
    output += "]";
    return output;
}

int main() {
    ${declarations}
    auto result = ${functionName}(${args});
    cout << toJson(result);
    return 0;
}
`;
}

async function runRuntimeCase(question, language, code, testCase) {
  return withTempDir(async (tempDir) => {
    if (language === 'JavaScript') {
      const filePath = path.join(tempDir, 'solution.js');
      await fs.writeFile(filePath, buildJavaScriptHarness(code, question.functionName[language], testCase.input), 'utf8');
      const result = await runProcess('node', [filePath], tempDir);
      return parseRuntimeResult(result, testCase);
    }

    if (language === 'Python') {
      const filePath = path.join(tempDir, 'solution.py');
      await fs.writeFile(filePath, buildPythonHarness(code, question.functionName[language], testCase.input), 'utf8');
      const result = await runProcess('python', [filePath], tempDir);
      return parseRuntimeResult(result, testCase);
    }

    if (language === 'Java') {
      const filePath = path.join(tempDir, 'Solution.java');
      await fs.writeFile(filePath, buildJavaHarness(code, question.functionName[language], testCase.input), 'utf8');
      const compileResult = await runProcess('javac', ['Solution.java'], tempDir);
      if (compileResult.code !== 0) {
        return {
          passed: false,
          actual: null,
          error: compileResult.stderr || 'Java compilation failed.',
        };
      }

      const runResult = await runProcess('java', ['Runner'], tempDir);
      return parseRuntimeResult(runResult, testCase);
    }

    if (language === 'C') {
      const filePath = path.join(tempDir, 'solution.c');
      await fs.writeFile(filePath, buildCHarness(code, question.functionName[language], testCase.input, testCase.expected), 'utf8');
      const compileResult = await runProcess('gcc', ['solution.c', '-o', 'solution.exe'], tempDir);
      if (compileResult.code !== 0) {
        return {
          passed: false,
          actual: null,
          error: compileResult.stderr || 'C compilation failed.',
        };
      }

      const runResult = await runProcess(path.join(tempDir, 'solution.exe'), [], tempDir);
      return parseRuntimeResult(runResult, testCase);
    }

    if (language === 'C++') {
      const filePath = path.join(tempDir, 'solution.cpp');
      await fs.writeFile(filePath, buildCppHarness(code, question.functionName[language], testCase.input), 'utf8');
      const compileResult = await runProcess('g++', ['solution.cpp', '-std=c++17', '-o', 'solution.exe'], tempDir);
      if (compileResult.code !== 0) {
        return {
          passed: false,
          actual: null,
          error: compileResult.stderr || 'C++ compilation failed.',
        };
      }

      const runResult = await runProcess(path.join(tempDir, 'solution.exe'), [], tempDir);
      return parseRuntimeResult(runResult, testCase);
    }

    return {
      passed: false,
      actual: null,
      error: `Unsupported runtime language: ${language}`,
    };
  });
}

function parseRuntimeResult(processResult, testCase) {
  if (processResult.timedOut) {
    return {
      passed: false,
      actual: null,
      error: 'Execution timed out.',
    };
  }

  if (processResult.code !== 0) {
    return {
      passed: false,
      actual: null,
      error: processResult.stderr || 'Execution failed.',
    };
  }

  try {
    const actual = JSON.parse(processResult.stdout.trim());
    return {
      passed: valuesMatch(actual, testCase.expected),
      actual,
      error: '',
    };
  } catch (_error) {
    return {
      passed: false,
      actual: processResult.stdout.trim(),
      error: 'Runner returned output that could not be parsed.',
    };
  }
}

function evaluateMarkupQuestion(code, testCase) {
  const normalized = code.toLowerCase();
  const checks = (testCase.checks || []).map((item) => item.toLowerCase());
  const missing = checks.filter((item) => !normalized.includes(item));
  return {
    passed: missing.length === 0,
    actual: missing.length ? `Missing: ${missing.join(', ')}` : 'All required elements found.',
    error: '',
  };
}

function evaluateReactQuestion(code, testCase) {
  const normalized = code.toLowerCase();
  const checks = (testCase.checks || []).map((item) => item.toLowerCase());
  const missing = checks.filter((item) => !normalized.includes(item));
  return {
    passed: missing.length === 0,
    actual: missing.length ? `Missing: ${missing.join(', ')}` : 'All required React patterns found.',
    error: '',
  };
}

function evaluateTechnicalQuestion(code, testCase) {
  const normalized = code.toLowerCase();
  const checks = (testCase.checks || []).map((item) => item.toLowerCase());
  const matched = checks.filter((item) => normalized.includes(item));
  const minimumMatches = testCase.minimumMatches || Math.min(2, checks.length);

  return {
    passed: checks.length === 0 || matched.length >= minimumMatches,
    actual: checks.length
      ? `Matched ${matched.length}/${checks.length} expected concepts.`
      : 'Answer saved for manual review.',
    error: '',
  };
}

async function evaluateQuestion(question, submission = {}, options = {}) {
  const language = submission.language || question.languages?.[0];
  const code = String(submission.code || '');
  const includeHidden = Boolean(options.includeHidden);
  const cases = includeHidden
    ? [...(question.publicCases || []), ...(question.hiddenCases || [])]
    : [...(question.publicCases || [])];

  const results = [];

  for (const [index, testCase] of cases.entries()) {
    let outcome;
    if (question.mode === 'runtime') {
      outcome = await runRuntimeCase(question, language, code, testCase);
    } else if (question.mode === 'markup') {
      outcome = evaluateMarkupQuestion(code, testCase);
    } else if (question.mode === 'technical') {
      outcome = evaluateTechnicalQuestion(code, testCase);
    } else {
      outcome = evaluateReactQuestion(code, testCase);
    }

    results.push(summarizeCaseResult(
      testCase,
      outcome.passed,
      outcome.actual,
      testCase.expected ?? testCase.output ?? 'Pattern check',
      outcome.error,
      index,
    ));
  }

  const passedCount = results.filter((item) => item.passed).length;
  return {
    language,
    passedCount,
    totalCount: results.length,
    allPassed: passedCount === results.length && results.length > 0,
    cases: results,
  };
}

module.exports = {
  evaluateQuestion,
};
