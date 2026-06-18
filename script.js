// =========================
// 送信先設定
// =========================

const RECEIVER_URL = "https://script.google.com/macros/s/AKfycbydEOtyE2VA1ujpeEC0cU3YfLwACH2r_5cd0jKEJTBh1TMjrpJRYU2rCRD_zVBoeXUIow/exec";

// Apps Script側の SECRET_TOKEN と同じ文字列にする
const SEND_TOKEN = "digit_span_2026_test_token";
const OFFLINE_MESSAGE = "\u30a4\u30f3\u30bf\u30fc\u30cd\u30c3\u30c8\u306b\u3064\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002";

// =========================
// 基本設定
// =========================

const DIGIT_PRESENT_MS = 1000;
const BLANK_MS = 250;

const FORWARD_MIN_SPAN = 2;
const FORWARD_MAX_SPAN = 8;

const BACKWARD_MIN_SPAN = 2;
const BACKWARD_MAX_SPAN = 8;

const TRIALS_PER_SPAN = 2;
const STOP_WRONG_COUNT = 2;

let answerTimeoutId = null;
let answerDeadline = null;
let answerTimeExtended = false;

const MODE_LABELS_RUBY = {
  forward: '<ruby>同<rt>おな</rt></ruby>じ<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>える<ruby>問題<rt>もんだい</rt></ruby>',
  backward: '<ruby>反対<rt>はんたい</rt></ruby>の<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>える<ruby>問題<rt>もんだい</rt></ruby>'
};

const MODE_SHORT_LABELS_RUBY = {
  forward: '<ruby>同<rt>おな</rt></ruby>じ<ruby>順番<rt>じゅんばん</rt></ruby>',
  backward: '<ruby>反対<rt>はんたい</rt></ruby>の<ruby>順番<rt>じゅんばん</rt></ruby>'
};

let attendanceDigits = [];
let attendanceNumber = "";
let formId = "";

let sessionId = "";

let currentMode = "";
let currentSpan = 2;
let trialInSpan = 1;
let wrongCountInSpan = 0;

let currentSequence = [];
let currentAnswer = [];
let results = [];

let isSubmitting = false;
let isPresenting = false;
let pendingOnlineRetry = null;

let phase = "practice";
let practiceIndex = 0;
let currentPracticeMode = "forward";

// =========================
// 練習問題
// =========================

const practiceTrialsByMode = {
  forward: [
    {
      mode: "forward",
      sequence: [3, 8],
      instruction: `
        <ruby>練習<rt>れんしゅう</rt></ruby>です。<br>
        <ruby>数字<rt>すうじ</rt></ruby>が<ruby>出<rt>で</rt></ruby>ているあいだは、よく<ruby>見<rt>み</rt></ruby>ておぼえてください。<br>
        「<ruby>答<rt>こた</rt></ruby>えてください」と<ruby>出<rt>で</rt></ruby>たら、<ruby>同<rt>おな</rt></ruby>じ<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>えます。
      `
    },
    {
      mode: "forward",
      sequence: [5, 1, 6],
      instruction: `
        もう<ruby>一度<rt>いちど</rt></ruby>、<ruby>練習<rt>れんしゅう</rt></ruby>します。<br>
        <ruby>数字<rt>すうじ</rt></ruby>が<ruby>出<rt>で</rt></ruby>ているあいだは、よく<ruby>見<rt>み</rt></ruby>ておぼえてください。<br>
        「<ruby>答<rt>こた</rt></ruby>えてください」と<ruby>出<rt>で</rt></ruby>たら、<ruby>同<rt>おな</rt></ruby>じ<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>えます。
      `
    }
  ],

  backward: [
    {
      mode: "backward",
      sequence: [3, 8],
      instruction: `
        <ruby>練習<rt>れんしゅう</rt></ruby>です。<br>
        <ruby>数字<rt>すうじ</rt></ruby>が<ruby>出<rt>で</rt></ruby>ているあいだは、よく<ruby>見<rt>み</rt></ruby>ておぼえてください。<br>
        「<ruby>答<rt>こた</rt></ruby>えてください」と<ruby>出<rt>で</rt></ruby>たら、<br>
        <ruby>反対<rt>はんたい</rt></ruby>の<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>えます。
      `
    },
    {
      mode: "backward",
      sequence: [5, 1, 6],
      instruction: `
        もう<ruby>一度<rt>いちど</rt></ruby>、<ruby>練習<rt>れんしゅう</rt></ruby>します。<br>
        <ruby>数字<rt>すうじ</rt></ruby>が<ruby>出<rt>で</rt></ruby>ているあいだは、よく<ruby>見<rt>み</rt></ruby>ておぼえてください。<br>
        「<ruby>答<rt>こた</rt></ruby>えてください」と<ruby>出<rt>で</rt></ruby>たら、<ruby>反対<rt>はんたい</rt></ruby>の<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>えます。
      `
    }
  ]
};

// =========================
// 画面要素
// =========================

const startScreen = document.getElementById("startScreen");
const taskScreen = document.getElementById("taskScreen");
const endScreen = document.getElementById("endScreen");

const modeTitle = document.getElementById("modeTitle");
const progress = document.getElementById("progress");
const message = document.getElementById("message");
const digitDisplay = document.getElementById("digitDisplay");

const answerArea = document.getElementById("answerArea");
const answerDisplay = document.getElementById("answerDisplay");
const numberButtons = document.getElementById("numberButtons");

const attendanceDisplay = document.getElementById("attendanceDisplay");
const attendanceButtons = document.getElementById("attendanceButtons");
const submitAnswerButton = document.getElementById("submitAnswerButton");

// =========================
// 初期化
// =========================

createAttendanceButtons();

// =========================
// 数字ボタン作成
// =========================

function createAttendanceButtons() {
  createNumberPad(attendanceButtons, addAttendanceDigit);
}

function createNumberButtons() {
  createNumberPad(numberButtons, addDigit);
}

function createNumberPad(container, clickHandler) {
  container.innerHTML = "";
  container.classList.add("numberPad");

  const rows = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 0]
  ];

  rows.forEach(rowDigits => {
    const row = document.createElement("div");
    row.className = "numberRow";

    rowDigits.forEach(digit => {
      const btn = document.createElement("button");
      btn.textContent = digit;
      btn.onclick = () => clickHandler(digit);
      row.appendChild(btn);
    });

    container.appendChild(row);
  });
}

// =========================
// 出席番号入力
// =========================

function addAttendanceDigit(digit) {
  // 出席番号は最大2桁想定。3桁まで必要なら 2 を 3 に変える
  if (attendanceDigits.length < 2) {
    attendanceDigits.push(digit);
    updateAttendanceDisplay();
  }
}

function backspaceAttendance() {
  attendanceDigits.pop();
  updateAttendanceDisplay();
}

function clearAttendance() {
  attendanceDigits = [];
  updateAttendanceDisplay();
}

function updateAttendanceDisplay() {
  if (attendanceDigits.length === 0) {
    attendanceDisplay.textContent = "＿";
  } else {
    attendanceDisplay.textContent = attendanceDigits.join("");
  }
}

// =========================
// 開始
// =========================

function startTask() {
  if (attendanceDigits.length === 0) {
    alert("出席番号を入れてください。");
    return;
  }

  attendanceNumber = attendanceDigits.join("");
  const num = Number(attendanceNumber);

  if (!Number.isInteger(num) || num <= 0) {
    alert("出席番号を正しく入れてください。");
    return;
  }

  if (!isOnline()) {
    recordStatus("offline_before_start", {
      attendance_number: attendanceNumber
    });
    alert(OFFLINE_MESSAGE);
    return;
  }

  formId = "form_" + (num % 4);
  sessionId = createSessionId();
  recordStatus("task_started", {
    session_id: sessionId,
    attendance_number: attendanceNumber,
    form_id: formId
  });

  startScreen.classList.add("hidden");
  taskScreen.classList.remove("hidden");

  createNumberButtons();
  saveProgressToLocalStorage("start");

  showForwardPracticeStartMessage();
}

// =========================
// 練習
// =========================

function showForwardPracticeStartMessage() {
  modeTitle.innerHTML = MODE_LABELS_RUBY.forward;
  progress.textContent = "";
  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");

  message.innerHTML = `
    はじめに、<ruby>練習<rt>れんしゅう</rt></ruby>をします。
  `;

  setTimeout(() => {
    startPractice("forward");
  }, 2500);
}

function showBackwardPracticeStartMessage() {
  modeTitle.innerHTML = MODE_LABELS_RUBY.backward;
  progress.textContent = "";
  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");

  message.innerHTML = `
    <ruby>次<rt>つぎ</rt></ruby>は、<br>
    <ruby>反対<rt>はんたい</rt></ruby>の<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>える<ruby>問題<rt>もんだい</rt></ruby>です。<br>
    はじめに<ruby>練習<rt>れんしゅう</rt></ruby>をします。
  `;

  setTimeout(() => {
    startPractice("backward");
  }, 4000);
}

function startPractice(modeName) {
  phase = "practice";
  currentPracticeMode = modeName;
  practiceIndex = 0;
  runPracticeTrial();
}

async function runPracticeTrial() {
  if (!ensureOnlineBeforeTrial(() => runPracticeTrial())) {
    return;
  }

  const practiceTrials = practiceTrialsByMode[currentPracticeMode];
  const trial = practiceTrials[practiceIndex];

  currentMode = trial.mode;
  currentSequence = trial.sequence;
  currentAnswer = [];

  modeTitle.innerHTML = `${MODE_LABELS_RUBY[currentMode]}の<ruby>練習<rt>れんしゅう</rt></ruby>`;
  progress.innerHTML = `<ruby>練習<rt>れんしゅう</rt></ruby> ${practiceIndex + 1} / ${practiceTrials.length}`;
  message.innerHTML = trial.instruction;

  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");

  await wait(2500);
  await presentSequence(currentSequence);

  showAnswerArea();
}

function handlePracticeResult(isCorrect, correctAnswer) {
  answerArea.classList.add("hidden");

  if (isCorrect) {
    message.innerHTML = "<ruby>正解<rt>せいかい</rt></ruby>です。";
  } else {
    message.innerHTML = `
      <ruby>答<rt>こた</rt></ruby>えは<br>
      ${correctAnswer.join("、")} です。
    `;
  }

  practiceIndex++;

  const practiceTrials = practiceTrialsByMode[currentPracticeMode];

  setTimeout(() => {
    if (practiceIndex < practiceTrials.length) {
      runPracticeTrial();
    } else {
      if (currentPracticeMode === "forward") {
        showMainForwardStartMessage();
      } else {
        showMainBackwardStartMessage();
      }
    }
  }, 2500);
}

// =========================
// 本番
// =========================

function showMainForwardStartMessage() {
  modeTitle.innerHTML = "<ruby>本番<rt>ほんばん</rt></ruby>に<ruby>入<rt>はい</rt></ruby>ります";
  progress.textContent = "";
  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");

  message.innerHTML = `
    ここから<ruby>本番<rt>ほんばん</rt></ruby>です。<br>
    <ruby>本番<rt>ほんばん</rt></ruby>では、<ruby>正解<rt>せいかい</rt></ruby>かどうかは<ruby>画面<rt>がめん</rt></ruby>に<ruby>出<rt>で</rt></ruby>ません。<br>
    <ruby>出<rt>で</rt></ruby>てきた<ruby>数字<rt>すうじ</rt></ruby>を<ruby>同<rt>おな</rt></ruby>じ<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>えます。
  `;

  setTimeout(() => {
    startMainForward();
  }, 4500);
}

function showMainBackwardStartMessage() {
  modeTitle.innerHTML = "<ruby>本番<rt>ほんばん</rt></ruby>に<ruby>入<rt>はい</rt></ruby>ります";
  progress.textContent = "";
  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");

  message.innerHTML = `
    ここから<ruby>本番<rt>ほんばん</rt></ruby>です。<br>
    <ruby>本番<rt>ほんばん</rt></ruby>では、<ruby>正解<rt>せいかい</rt></ruby>かどうかは<ruby>画面<rt>がめん</rt></ruby>に<ruby>出<rt>で</rt></ruby>ません。<br>
    <ruby>出<rt>で</rt></ruby>てきた<ruby>数字<rt>すうじ</rt></ruby>を<ruby>反対<rt>はんたい</rt></ruby>の<ruby>順番<rt>じゅんばん</rt></ruby>で<ruby>答<rt>こた</rt></ruby>えます。
  `;

  setTimeout(() => {
    startMainBackward();
  }, 4500);
}

function startMainForward() {
  phase = "main";
  currentMode = "forward";
  currentSpan = FORWARD_MIN_SPAN;
  trialInSpan = 1;
  wrongCountInSpan = 0;
  runMainTrial();
}

function startMainBackward() {
  phase = "main";
  currentMode = "backward";
  currentSpan = BACKWARD_MIN_SPAN;
  trialInSpan = 1;
  wrongCountInSpan = 0;
  runMainTrial();
}

async function runMainTrial() {
  if (!ensureOnlineBeforeTrial(() => runMainTrial())) {
    return;
  }

  currentSequence = getProblemSequence(formId, currentMode, currentSpan, trialInSpan);
  currentAnswer = [];

  modeTitle.innerHTML = MODE_LABELS_RUBY[currentMode];

  progress.innerHTML = "";

  message.innerHTML = `
    <ruby>数字<rt>すうじ</rt></ruby>が<ruby>出<rt>で</rt></ruby>ているあいだは、よく<ruby>見<rt>み</rt></ruby>ておぼえてください。<br>
    あとで、${MODE_SHORT_LABELS_RUBY[currentMode]}で<ruby>答<rt>こた</rt></ruby>えます。
  `;

  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");

  await wait(2500);
  await presentSequence(currentSequence);

  showAnswerArea();
}

async function handleMainResult(isCorrect) {
  if (!isCorrect) {
    wrongCountInSpan++;
  }

  if (trialInSpan < TRIALS_PER_SPAN) {
    trialInSpan++;
    saveProgressToLocalStorage("trial_end");
    runMainTrial();
    return;
  }

  // 同じ桁数で2問終わった後
  if (wrongCountInSpan >= STOP_WRONG_COUNT) {
    if (currentMode === "forward") {
      markModeCompleted("forward");
      saveProgressToLocalStorage("forward_completed");

      // 一問ごと送信に失敗していた未送信分だけ、ここでまとめて再送する
       sendResultsToReceiver("forward");

      showBackwardPracticeStartMessage();
    } else {
      markModeCompleted("backward");
      saveProgressToLocalStorage("backward_completed");

      // 一問ごと送信に失敗していた未送信分だけ、ここでまとめて再送する
       sendResultsToReceiver("backward");

      finishTask();
    }
    return;
  }

  // 次の桁へ
  currentSpan++;
  trialInSpan = 1;
  wrongCountInSpan = 0;

  const maxSpan = currentMode === "forward" ? FORWARD_MAX_SPAN : BACKWARD_MAX_SPAN;

  if (currentSpan > maxSpan) {
    if (currentMode === "forward") {
      markModeCompleted("forward");
      saveProgressToLocalStorage("forward_completed");

      // 一問ごと送信に失敗していた未送信分だけ、ここでまとめて再送する
       sendResultsToReceiver("forward");

      showBackwardPracticeStartMessage();
    } else {
      markModeCompleted("backward");
      saveProgressToLocalStorage("backward_completed");

      // 一問ごと送信に失敗していた未送信分だけ、ここでまとめて再送する
       sendResultsToReceiver("backward");

      finishTask();
    }
  } else {
    saveProgressToLocalStorage("span_end");
    runMainTrial();
  }
}

// =========================
// 数字提示
// =========================

async function presentSequence(sequence) {
  message.innerHTML = "よく<ruby>見<rt>み</rt></ruby>て<br>おぼえてください。";
  digitDisplay.classList.remove("hidden");
  digitDisplay.textContent = "";

  await wait(500);

  for (const digit of sequence) {
    digitDisplay.textContent = digit;
    await wait(DIGIT_PRESENT_MS);

    digitDisplay.textContent = "";
    await wait(BLANK_MS);
  }

  digitDisplay.classList.add("hidden");
  message.innerHTML = "<ruby>答<rt>こた</rt></ruby>えてください。";
}

// =========================
// 回答入力
// =========================

function showAnswerArea() {
  isSubmitting = false;
  setSubmitButtonDisabled(false);
  currentAnswer = [];
  updateAnswerDisplay();
  answerArea.classList.remove("hidden");
  scheduleAnswerTimeout();
}

function setSubmitButtonDisabled(disabled) {
  if (submitAnswerButton) {
    submitAnswerButton.disabled = disabled;
  }
}

function clearAnswerTimeout() {
  if (answerTimeoutId !== null) {
    clearTimeout(answerTimeoutId);
    answerTimeoutId = null;
  }
  answerDeadline = null;
  answerTimeExtended = false;
}

function scheduleAnswerTimeout() {
  clearAnswerTimeout();

  if (phase !== "main") {
    return;
  }

  const limitSeconds = getTimeLimit(currentMode, currentSequence.length);
  answerDeadline = Date.now() + limitSeconds * 1000;
  answerTimeExtended = false;

  answerTimeoutId = setTimeout(() => {
    answerTimeoutId = null;
    handleTimeLimitExceeded();
  }, limitSeconds * 1000);
}

function extendAnswerTimeoutByGracePeriod() {
  if (phase !== "main" || !answerDeadline || answerTimeExtended) {
    return;
  }

  const now = Date.now();
  const nextDeadline = Math.max(answerDeadline, now) + 5000;
  const delayMs = nextDeadline - now;

  answerDeadline = nextDeadline;
  answerTimeExtended = true;

  if (answerTimeoutId !== null) {
    clearTimeout(answerTimeoutId);
  }

  answerTimeoutId = setTimeout(() => {
    answerTimeoutId = null;
    handleTimeLimitExceeded();
  }, delayMs);
}

function getTimeLimit(mode, span) {
  if (mode === "forward") {
    return span <= 5 ? 15 : 25;
  }

  return span <= 5 ? 20 : 30;
}

function handleTimeLimitExceeded() {
  if (answerArea.classList.contains("hidden") || isSubmitting) {
    return;
  }

  message.innerHTML = `
    <ruby>時間<rt>じかん</rt></ruby>です。<br>
    <ruby>次<rt>つぎ</rt></ruby>の<ruby>問題<rt>もんだい</rt></ruby>に<ruby>進<rt>すす</rt></ruby>みます。
  `;

  setSubmitButtonDisabled(true);
  isSubmitting = true;

  const correctAnswer = getCorrectAnswer(currentSequence, currentMode);
  const savedRow = saveResult(false, correctAnswer);
  sendSingleResultToReceiver(savedRow).finally(() => {
    handleMainResult(false);
  });
}

function addDigit(digit) {
  if (currentAnswer.length < currentSequence.length) {
    currentAnswer.push(digit);
    updateAnswerDisplay();
  }
}

function backspaceAnswer() {
  currentAnswer.pop();
  updateAnswerDisplay();
}

function clearAnswer() {
  currentAnswer = [];
  updateAnswerDisplay();
}

function updateAnswerDisplay() {
  if (currentAnswer.length === 0) {
    answerDisplay.textContent = "＿ ".repeat(currentSequence.length);
  } else {
    const entered = currentAnswer.join(" ");
    const remaining = " ＿".repeat(currentSequence.length - currentAnswer.length);
    answerDisplay.textContent = entered + remaining;
  }
}

// =========================
// 回答送信
// =========================

function submitAnswer() {
  if (isSubmitting) {
    return;
  }

  if (currentAnswer.length !== currentSequence.length) {
    message.innerHTML = `
      <ruby>数字<rt>すうじ</rt></ruby>をぜんぶ<ruby>入<rt>い</rt></ruby>れてから、「<ruby>決定<rt>けってい</rt></ruby>」をおしてください。
    `;
    extendAnswerTimeoutByGracePeriod();
    return;
  }

  clearAnswerTimeout();

  isSubmitting = true;
  setSubmitButtonDisabled(true);

  const correctAnswer = getCorrectAnswer(currentSequence, currentMode);
  const isCorrect = arraysEqual(currentAnswer, correctAnswer);

  const savedRow = saveResult(isCorrect, correctAnswer);

  // 一問ごとに自動送信する。
  // 途中でやめた場合でも、そこまでのデータが残りやすくなる。
  sendSingleResultToReceiver(savedRow);

  if (phase === "practice") {
    handlePracticeResult(isCorrect, correctAnswer);
  } else {
    handleMainResult(isCorrect);
  }
}

function finishTask() {
  recordStatus("task_finished", {
    result_count: results.length
  });

  document.body.innerHTML = `
    <div style="
      text-align: center;
      padding-top: 40px;
      font-family: sans-serif;
    ">
      <h1 style="font-size: 34px; margin-bottom: 28px;">
        <ruby>数字<rt>すうじ</rt></ruby>チャレンジ
      </h1>

      <h2 style="font-size: 32px; margin-bottom: 28px;">
        ありがとうございました
      </h2>

      <p style="
        font-size: 24px;
        line-height: 1.8;
        margin: 0 auto;
        max-width: 760px;
      ">
        これで<ruby>数字<rt>すうじ</rt></ruby>チャレンジはおわりです。<br>
        タブレットをそのまま、つくえの<ruby>上<rt>うえ</rt></ruby>において、<br>
        <ruby>先生<rt>せんせい</rt></ruby>の<ruby>指示<rt>しじ</rt></ruby>を<ruby>待<rt>ま</rt></ruby>ってください。
      </p>
    </div>
  `;
}

// =========================
// 採点・記録
// =========================

function getCorrectAnswer(sequence, mode) {
  if (mode === "forward") {
    return [...sequence];
  } else {
    return [...sequence].reverse();
  }
}

function saveResult(isCorrect, correctAnswer) {
  const row = {
    result_id: createResultId(),
    session_id: sessionId,
    attendance_number: attendanceNumber,
    form_id: formId,
    phase: phase,
    mode: currentMode,
    span: currentSequence.length,
    trial_in_span: phase === "practice" ? practiceIndex + 1 : trialInSpan,
    sequence: currentSequence.join(""),
    correct_answer: correctAnswer.join(""),
    response: currentAnswer.join(""),
    correct: isCorrect ? 1 : 0,
    mode_completed: 0,
    timestamp: new Date().toISOString(),
    sent: 0
  };

  results.push(row);
  saveProgressToLocalStorage("answer_saved");
  recordStatus("answer_saved", {
    result_id: row.result_id,
    phase: row.phase,
    mode: row.mode,
    span: row.span,
    trial_in_span: row.trial_in_span,
    correct: row.correct
  });

  return row;
}

function createResultId() {
  const trialNumber = phase === "practice" ? practiceIndex + 1 : trialInSpan;

  return [
    sessionId,
    phase,
    currentMode,
    currentSequence.length,
    trialNumber,
    currentSequence.join("")
  ].join("_");
}

function markModeCompleted(modeName) {
  results.forEach(row => {
    if (row.phase === "main" && row.mode === modeName) {
      row.mode_completed = 1;
    }
  });
  recordStatus("mode_completed", {
    mode: modeName
  });
}

// =========================
// Online check
// =========================

function isOnline() {
  return navigator.onLine !== false;
}

function ensureOnlineBeforeTrial(retryCallback) {
  if (isOnline()) {
    pendingOnlineRetry = null;
    return true;
  }

  answerArea.classList.add("hidden");
  digitDisplay.classList.add("hidden");
  message.textContent = OFFLINE_MESSAGE;

  recordStatus("offline_before_trial", {
    phase: phase,
    mode: currentMode,
    span: currentSpan,
    trial_in_span: phase === "practice" ? practiceIndex + 1 : trialInSpan
  });

  pendingOnlineRetry = retryCallback;
  window.addEventListener("online", resumePendingOnlineTrial, { once: true });
  return false;
}

function resumePendingOnlineTrial() {
  if (!pendingOnlineRetry || !isOnline()) {
    return;
  }

  const retryCallback = pendingOnlineRetry;
  pendingOnlineRetry = null;

  recordStatus("online_trial_resumed", {
    phase: phase,
    mode: currentMode,
    span: currentSpan,
    trial_in_span: phase === "practice" ? practiceIndex + 1 : trialInSpan
  });

  setTimeout(retryCallback, 1000);
}

// =========================
// Google Apps Scriptへ送信
// =========================

async function sendSingleResultToReceiver(row) {
  if (!row || row.sent === 1) {
    return;
  }

  recordStatus("single_send_started", {
    result_id: row.result_id,
    mode: row.mode,
    span: row.span,
    trial_in_span: row.trial_in_span
  });

  const payload = {
    token: SEND_TOKEN,
    session_id: sessionId,
    attendance_number: attendanceNumber,
    form_id: formId,
    mode: row.mode,
    sent_at: new Date().toISOString(),
    results: [row]
  };

  try {
    await fetch(RECEIVER_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    row.sent = 1;
    saveProgressToLocalStorage("single_result_sent");
    recordStatus("single_send_request_finished", {
      result_id: row.result_id
    });

  } catch (error) {
    console.error("一問ごとの送信に失敗しました。", error);
    saveProgressToLocalStorage("single_result_send_failed");
    recordStatus("single_send_failed", {
      result_id: row.result_id,
      error: String(error)
    });
  }
}

async function sendResultsToReceiver(modeToSend) {
  const dataToSend = results.filter(row =>
    row.mode === modeToSend &&
    row.sent !== 1
  );

  if (dataToSend.length === 0) {
    recordStatus("batch_send_skipped", {
      mode: modeToSend,
      reason: "no_unsent_results"
    });
    return;
  }

  recordStatus("batch_send_started", {
    mode: modeToSend,
    count: dataToSend.length,
    result_ids: dataToSend.map(row => row.result_id)
  });

  const payload = {
    token: SEND_TOKEN,
    session_id: sessionId,
    attendance_number: attendanceNumber,
    form_id: formId,
    mode: modeToSend,
    sent_at: new Date().toISOString(),
    results: dataToSend
  };

  try {
    await fetch(RECEIVER_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    dataToSend.forEach(row => {
      row.sent = 1;
    });

    saveProgressToLocalStorage(`${modeToSend}_sent`);
    recordStatus("batch_send_request_finished", {
      mode: modeToSend,
      count: dataToSend.length,
      result_ids: dataToSend.map(row => row.result_id)
    });

  } catch (error) {
    console.error("まとめ送信に失敗しました。", error);
    saveProgressToLocalStorage(`${modeToSend}_send_failed`);
    recordStatus("batch_send_failed", {
      mode: modeToSend,
      count: dataToSend.length,
      result_ids: dataToSend.map(row => row.result_id),
      error: String(error)
    });
  }
}

// =========================
// 問題系列
// =========================
// form_id, mode, span, trial によって毎回同じ系列を作る。
// 4種類のフォームで、同じ桁数・同じ試行数だが、数字系列だけが変わる。

function getProblemSequence(formId, mode, span, trialInSpan) {
  const seedText = [
    "digit_span_2026",
    formId,
    mode,
    span,
    trialInSpan
  ].join("_");

  const rng = mulberry32(hashString(seedText));
  const sequence = [];

  while (sequence.length < span) {
    const digit = Math.floor(rng() * 10);

    // 直前と同じ数字は避ける
    if (sequence.length > 0 && sequence[sequence.length - 1] === digit) {
      continue;
    }

    sequence.push(digit);
  }

  return sequence;
}

function hashString(str) {
  let h = 2166136261;

  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =========================
// ローカル退避
// =========================

function saveProgressToLocalStorage(eventName) {
  const payload = {
    event: eventName,
    session_id: sessionId,
    attendance_number: attendanceNumber,
    form_id: formId,
    saved_at: new Date().toISOString(),
    results: results
  };

  try {
    localStorage.setItem(
      `digit_span_backup_${sessionId}`,
      JSON.stringify(payload)
    );
  } catch (e) {
    console.error("localStorageへの保存に失敗しました。", e);
  }
}

function recordStatus(eventName, detail = {}) {
  const status = {
    event: eventName,
    session_id: sessionId,
    attendance_number: attendanceNumber,
    form_id: formId,
    at: new Date().toISOString(),
    detail: detail
  };

  console.log("[digit-span-status]", status);

  try {
    const key = `digit_span_status_${sessionId || "before_start"}`;
    const logs = JSON.parse(localStorage.getItem(key) || "[]");
    logs.push(status);
    localStorage.setItem(key, JSON.stringify(logs));
  } catch (e) {
    console.error("status log save failed", e);
  }
}

function exportDigitSpanStatusLogs() {
  const allLogs = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (key && key.startsWith("digit_span_status_")) {
        allLogs[key] = JSON.parse(localStorage.getItem(key) || "[]");
      }
    }
  } catch (e) {
    console.error("status log export failed", e);
  }

  return allLogs;
}

function getDigitSpanStatusLogRows() {
  const allLogs = exportDigitSpanStatusLogs();

  return Object.entries(allLogs).flatMap(([storage_key, logs]) =>
    logs.map(log => ({
      storage_key: storage_key,
      at: log.at,
      event: log.event,
      session_id: log.session_id,
      attendance_number: log.attendance_number,
      form_id: log.form_id,
      result_id: log.detail && log.detail.result_id ? log.detail.result_id : "",
      mode: log.detail && log.detail.mode ? log.detail.mode : "",
      span: log.detail && log.detail.span ? log.detail.span : "",
      trial_in_span: log.detail && log.detail.trial_in_span ? log.detail.trial_in_span : "",
      error: log.detail && log.detail.error ? log.detail.error : ""
    }))
  );
}

function checkDigitSpanSendAttempts() {
  const rows = getDigitSpanStatusLogRows();
  const byResultId = {};

  rows.forEach(row => {
    if (!row.result_id) {
      return;
    }

    if (!byResultId[row.result_id]) {
      byResultId[row.result_id] = {
        result_id: row.result_id,
        session_id: row.session_id,
        attendance_number: row.attendance_number,
        mode: row.mode,
        span: row.span,
        trial_in_span: row.trial_in_span,
        answer_saved: "no",
        single_send_started: "no",
        single_send_request_finished: "no",
        single_send_failed: "no",
        last_event_at: row.at,
        error: ""
      };
    }

    const summary = byResultId[row.result_id];
    summary.last_event_at = row.at;

    if (row.mode) summary.mode = row.mode;
    if (row.span) summary.span = row.span;
    if (row.trial_in_span) summary.trial_in_span = row.trial_in_span;
    if (row.error) summary.error = row.error;

    if (row.event === "answer_saved") summary.answer_saved = "yes";
    if (row.event === "single_send_started") summary.single_send_started = "yes";
    if (row.event === "single_send_request_finished") summary.single_send_request_finished = "yes";
    if (row.event === "single_send_failed") summary.single_send_failed = "yes";
  });

  const summaryRows = Object.values(byResultId);
  console.table(summaryRows);
  return summaryRows;
}

window.exportDigitSpanStatusLogs = exportDigitSpanStatusLogs;
window.getDigitSpanStatusLogRows = getDigitSpanStatusLogRows;
window.checkDigitSpanSendAttempts = checkDigitSpanSendAttempts;

// =========================
// 便利関数
// =========================

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createSessionId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const random = Math.random().toString(36).substring(2, 8);

  return `${yyyy}${mm}${dd}_${hh}${min}${ss}_${random}`;
}

function logError(message, error) {
  console.error(message, error);
}

window.addEventListener("error", event => {
  logError("Unhandled error occurred:", event.error || event.message || event);
  recordStatus("unhandled_error", {
    message: event.message || String(event.error || event)
  });
});

window.addEventListener("unhandledrejection", event => {
  logError("Unhandled promise rejection:", event.reason || event);
  recordStatus("unhandled_promise_rejection", {
    reason: String(event.reason || event)
  });
});
