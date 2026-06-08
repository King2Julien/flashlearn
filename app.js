const STORAGE = {
  decks: "flashlearn.decks.v1",
  progress: "flashlearn.progress.v1",
  settings: "flashlearn.settings.v1",
};

const DECK_MANIFEST = "./decks/index.json";

const CARD_COLORS = ["#c8f25d", "#9adcf5", "#f5b766", "#f09b91", "#b8a7ed"];
const DAY = 24 * 60 * 60 * 1000;

const state = {
  view: "library",
  decks: [],
  progress: load(STORAGE.progress, {}),
  settings: load(STORAGE.settings, { theme: "light" }),
  search: "",
  session: null,
};

const app = document.querySelector("#app");
const importInput = document.querySelector("#deckImport");
const toastRegion = document.querySelector("#toastRegion");
const confirmDialog = document.querySelector("#confirmDialog");

init();

async function init() {
  applyTheme();
  bindGlobalEvents();
  state.decks = await loadDecks();
  render();
  registerServiceWorker();
}

function bindGlobalEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeyboard);
  importInput.addEventListener("change", (event) => importDeckFiles(event.target.files));

  for (const eventName of ["dragenter", "dragover"]) {
    document.addEventListener(eventName, (event) => {
      event.preventDefault();
      document.querySelector(".drop-zone")?.classList.add("dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    document.addEventListener(eventName, (event) => {
      event.preventDefault();
      document.querySelector(".drop-zone")?.classList.remove("dragging");
    });
  }

  document.addEventListener("drop", (event) => {
    if (event.dataTransfer?.files?.length) importDeckFiles(event.dataTransfer.files);
  });
}

async function loadDecks() {
  const stored = load(STORAGE.decks, []);
  const storedById = new Map(stored.map((deck) => [deck.id, deck]));
  const builtin = [];
  let builtinDecks = [];

  try {
    const response = await fetch(DECK_MANIFEST);
    if (!response.ok) throw new Error("Could not load the deck manifest.");
    builtinDecks = await response.json();
    if (!Array.isArray(builtinDecks)) throw new Error("The deck manifest is invalid.");
  } catch (error) {
    console.warn(error);
  }

  for (const path of builtinDecks) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load ${path}`);
      const deck = normalizeDeck(await response.json());
      builtin.push(storedById.get(deck.id) || deck);
      storedById.delete(deck.id);
    } catch (error) {
      console.warn(error);
    }
  }

  return [...builtin, ...storedById.values()];
}

function normalizeDeck(raw) {
  if (!raw || !Array.isArray(raw.questions)) {
    throw new Error("This file is not a valid deck.");
  }

  return {
    schemaVersion: raw.schemaVersion || 1,
    id: raw.id || crypto.randomUUID(),
    title: String(raw.title || "Untitled deck"),
    subject: String(raw.subject || "General"),
    description: String(raw.description || ""),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    questions: raw.questions.map((question, index) => ({
      id: question.id || `${raw.id || "deck"}-${index}`,
      type: ["single", "multiple", "true_false", "text"].includes(question.type)
        ? question.type
        : "single",
      question: String(question.question || ""),
      code: String(question.code || ""),
      image: question.image || null,
      options: Array.isArray(question.options)
        ? question.options.map((option, optionIndex) => ({
            id: String(option.id || String.fromCharCode(65 + optionIndex)),
            text: String(option.text || ""),
          }))
        : [],
      correctOptions: Array.isArray(question.correctOptions)
        ? question.correctOptions.map(String)
        : [],
      correctTextAnswer: String(question.correctTextAnswer || ""),
      explanation: String(question.explanation || ""),
      tags: Array.isArray(question.tags) ? question.tags.map(String) : [],
      difficulty: String(question.difficulty || ""),
      source: String(question.source || ""),
    })),
  };
}

function render() {
  updateNavigation();
  if (state.view === "library") renderLibrary();
  if (state.view === "progress") renderProgress();
  if (state.view === "study") renderStudy();
  if (state.view === "summary") renderSummary();
}

function updateNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function renderLibrary() {
  const filtered = state.decks.filter((deck) => {
    const query = state.search.toLowerCase();
    return `${deck.title} ${deck.subject} ${deck.description}`.toLowerCase().includes(query);
  });

  app.innerHTML = `
    <section class="library-head">
      <div>
        <p class="eyebrow">${greeting()}</p>
        <h1>What will you master today?</h1>
        <p class="lead">Choose a deck, answer at your own pace, and let Flashlearn bring difficult questions back when you need them.</p>
      </div>
      <div class="library-actions">
        <input class="search" id="deckSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Search your library" aria-label="Search decks" />
      </div>
    </section>

    <section>
      <div class="section-row">
        <h2>Your decks</h2>
        <span class="quiet">${state.decks.length} decks · ${sum(state.decks.map((deck) => deck.questions.length))} cards</span>
      </div>
      <div class="deck-grid">
        ${filtered.map(renderDeckCard).join("")}
        ${
          filtered.length
            ? `<label class="drop-zone import-button">
                <strong>Drop another JSON deck here</strong>
                <p class="quiet">or click to browse</p>
                <input type="file" accept=".json,application/json" multiple data-import />
              </label>`
            : `<div class="empty-state"><h2>No decks match that search.</h2><p class="quiet">Try another title or subject.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderDeckCard(deck, index) {
  const stats = deckStats(deck);
  return `
    <article class="deck-card" style="--card-color:${CARD_COLORS[index % CARD_COLORS.length]}">
      <div class="card-top">
        <span class="deck-number">${String(index + 1).padStart(2, "0")}</span>
        <button class="menu-button" data-action="export" data-deck="${deck.id}" title="Export deck">↓</button>
      </div>
      <h3>${escapeHtml(humanizeTitle(deck.title))}</h3>
      <p class="subject">${escapeHtml(deck.subject)} · ${deck.questions.length} cards</p>
      <div class="card-footer">
        <div class="progress-line" aria-label="${stats.mastery}% mastered"><span style="width:${stats.mastery}%"></span></div>
        <span class="card-stats">${stats.due ? `${stats.due} due` : `${stats.mastery}% mastered`}</span>
      </div>
      <div class="card-actions">
        <button class="button button-primary" data-action="study" data-deck="${deck.id}">${stats.seen ? "Continue" : "Start studying"}</button>
        <button class="button button-ghost" data-action="quick-study" data-deck="${deck.id}" title="Study 10 cards">10 cards</button>
        <button class="button button-ghost" data-action="reset" data-deck="${deck.id}" title="Reset progress">↺</button>
      </div>
    </article>
  `;
}

function renderStudy() {
  const session = state.session;
  if (!session) return goTo("library");

  const deck = getDeck(session.deckId);
  const question = session.questions[session.index];
  if (!question) return finishSession();

  const questionNumber = session.index + 1;
  const total = session.questions.length;
  const progress = Math.round((session.index / total) * 100);
  const isText = question.type === "text";
  const checked = session.checked;

  app.innerHTML = `
    <section class="study-layout">
      <header class="study-header">
        <div class="study-header-top">
          <button class="back-button" data-action="end-session" aria-label="End session">←</button>
          <div class="study-title">
            <h2>${escapeHtml(humanizeTitle(deck.title))}</h2>
            <p class="quiet">Card ${questionNumber} of ${total}</p>
          </div>
          <span class="pill">${session.mode === "due" ? "Review" : "Study"}</span>
        </div>
        <div class="study-progress"><span style="width:${progress}%"></span></div>
      </header>

      <article class="study-card">
        <div class="question-meta">
          <span class="eyebrow">${escapeHtml(questionTypeLabel(question.type))}</span>
          <span class="pill">${escapeHtml(question.difficulty || question.source || "Practice")}</span>
        </div>
        <h1>${escapeHtml(question.question)}</h1>
        ${question.code ? `<pre class="code-block"><code>${escapeHtml(question.code)}</code></pre>` : ""}
        ${renderQuestionImage(question.image)}
        ${
          isText
            ? renderTextAnswer(question, checked, session.textAnswer)
            : renderOptions(question, session.selected, checked)
        }
        ${checked ? renderFeedback(question, session.correct) : ""}
        <footer class="study-footer">
          <span class="keyboard-hint">${
            isText ? "Type your answer and press " : "Use "
          }<kbd>${isText ? "Enter" : "1–9"}</kbd>${isText ? "" : " to choose"}</span>
          ${
            checked
              ? `<button class="button button-primary" data-action="next">Next card <span>→</span></button>`
              : `<button class="button button-dark" data-action="check" ${
                  canCheck(question) ? "" : "disabled"
                }>Check answer</button>`
          }
        </footer>
      </article>
    </section>
  `;

  if (isText && !checked) {
    requestAnimationFrame(() => document.querySelector("#textAnswer")?.focus());
  }
}

function renderOptions(question, selected, checked) {
  return `
    <div class="options">
      ${question.options
        .map((option, index) => {
          const isSelected = selected.includes(option.id);
          const isCorrect = question.correctOptions.includes(option.id);
          const classes = [
            "option",
            isSelected ? "selected" : "",
            checked && isCorrect ? "correct" : "",
            checked && isSelected && !isCorrect ? "incorrect" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `
            <button class="${classes}" data-action="select-option" data-option="${escapeHtml(option.id)}" ${
              checked ? "disabled" : ""
            }>
              <span class="option-key">${index + 1}</span>
              <span>${escapeHtml(option.text)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTextAnswer(question, checked, value) {
  return `
    <input id="textAnswer" class="text-answer" type="text" value="${escapeHtml(value)}" placeholder="Type your answer…" ${
      checked ? "disabled" : ""
    } autocomplete="off" />
  `;
}

function renderFeedback(question, correct) {
  const answer = question.type === "text"
    ? question.correctTextAnswer
    : question.options
        .filter((option) => question.correctOptions.includes(option.id))
        .map((option) => option.text)
        .join(", ");

  return `
    <section class="feedback ${correct ? "correct" : "incorrect"}">
      <div class="answer-topline">
        <h3>${correct ? "Correct" : "Not quite"}</h3>
        <span class="pill">${correct ? "Building mastery" : "Scheduled sooner"}</span>
      </div>
      ${!correct ? `<p><strong>Answer:</strong> ${escapeHtml(answer)}</p>` : ""}
      ${question.explanation ? `<p>${escapeHtml(question.explanation)}</p>` : ""}
    </section>
  `;
}

function renderQuestionImage(image) {
  if (!image) return "";
  const src = typeof image === "string" ? image : image.dataUrl || image.path || "";
  return src ? `<img class="question-image" src="${escapeHtml(src)}" alt="Question illustration" />` : "";
}

function renderSummary() {
  const session = state.session;
  if (!session) return goTo("library");
  const deck = getDeck(session.deckId);
  const accuracy = session.answers.length
    ? Math.round((session.correctCount / session.answers.length) * 100)
    : 0;

  app.innerHTML = `
    <section class="summary">
      <div class="summary-mark">${accuracy}%</div>
      <p class="eyebrow">Session complete</p>
      <h1>${accuracy >= 80 ? "Strong work." : accuracy >= 55 ? "Good momentum." : "Keep reviewing."}</h1>
      <p class="lead">You completed ${session.answers.length} cards from ${escapeHtml(humanizeTitle(deck.title))}. Your next reviews have been scheduled automatically.</p>
      <div class="summary-stats">
        <div class="stat-card"><strong>${session.correctCount}</strong><span>Correct</span></div>
        <div class="stat-card"><strong>${session.answers.length - session.correctCount}</strong><span>To review</span></div>
        <div class="stat-card"><strong>${formatDuration(Date.now() - session.startedAt)}</strong><span>Study time</span></div>
      </div>
      <div class="result-actions">
        <button class="button button-ghost" data-view="library">Back to library</button>
        <button class="button button-primary" data-action="study-missed">Review missed cards</button>
      </div>
    </section>
  `;
}

function renderProgress() {
  const allProgress = Object.values(state.progress);
  const attempts = sum(allProgress.map((item) => item.attempts || 0));
  const correct = sum(allProgress.map((item) => item.correct || 0));
  const mastered = allProgress.filter((item) => (item.interval || 0) >= 7).length;
  const due = allProgress.filter((item) => !item.dueAt || item.dueAt <= Date.now()).length;

  app.innerHTML = `
    <section class="progress-dashboard">
      <header>
        <p class="eyebrow">Your progress</p>
        <h1>Small sessions add up.</h1>
        <p class="lead">Progress is stored on this device. A card counts as mastered after reaching a review interval of at least seven days.</p>
      </header>

      <div class="dashboard-grid">
        ${dashboardCard("Cards studied", attempts, "Total answers")}
        ${dashboardCard("Accuracy", attempts ? `${Math.round((correct / attempts) * 100)}%` : "—", "Across all sessions")}
        ${dashboardCard("Mastered", mastered, "Long-term cards")}
        ${dashboardCard("Due now", due, "Ready to review")}
      </div>

      <section>
        <div class="section-row">
          <h2>Deck mastery</h2>
          <button class="button button-ghost" data-action="export-progress">Export progress</button>
        </div>
        <div class="mastery-list">
          ${state.decks
            .map((deck) => {
              const stats = deckStats(deck);
              return `
                <div class="mastery-row">
                  <div><h3>${escapeHtml(humanizeTitle(deck.title))}</h3><p class="quiet">${stats.seen} of ${deck.questions.length} seen</p></div>
                  <div class="progress-line"><span style="width:${stats.mastery}%"></span></div>
                  <strong>${stats.mastery}%</strong>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function dashboardCard(label, value, note) {
  return `<article class="dashboard-card"><span class="quiet">${label}</span><strong>${value}</strong><span class="quiet">${note}</span></article>`;
}

function handleClick(event) {
  const target = event.target.closest("[data-action], [data-view]");
  if (!target) return;
  if (target.dataset.view) return goTo(target.dataset.view);

  const action = target.dataset.action;
  const deckId = target.dataset.deck;

  if (action === "home") goTo("library");
  if (action === "theme") toggleTheme();
  if (action === "study") startSession(deckId, "due");
  if (action === "quick-study") startSession(deckId, "quick");
  if (action === "select-option") selectOption(target.dataset.option);
  if (action === "check") checkAnswer();
  if (action === "next") nextQuestion();
  if (action === "end-session") endSession();
  if (action === "study-missed") studyMissed();
  if (action === "export") exportDeck(deckId);
  if (action === "export-progress") exportProgress();
  if (action === "reset") resetDeck(deckId);
}

function handleInput(event) {
  if (event.target.id === "deckSearch") {
    state.search = event.target.value;
    renderLibrary();
    document.querySelector("#deckSearch")?.focus();
  }
  if (event.target.id === "textAnswer" && state.session) {
    state.session.textAnswer = event.target.value;
  }
}

function handleChange(event) {
  if (event.target.matches("[data-import]")) importDeckFiles(event.target.files);
}

function handleKeyboard(event) {
  if (state.view !== "study" || !state.session) return;
  const question = state.session.questions[state.session.index];

  if (event.key === "Escape") endSession();
  if (event.key === "Enter") {
    event.preventDefault();
    state.session.checked ? nextQuestion() : checkAnswer();
  }
  if (!state.session.checked && question.type !== "text" && /^[1-9]$/.test(event.key)) {
    const option = question.options[Number(event.key) - 1];
    if (option) selectOption(option.id);
  }
}

function startSession(deckId, mode, providedQuestions = null) {
  const deck = getDeck(deckId);
  if (!deck) return;

  let questions = providedQuestions || deck.questions;
  if (mode === "due") {
    questions = questions.filter((question) => isDue(progressKey(deckId, question.id)));
  }
  if (mode === "quick") {
    const due = questions.filter((question) => isDue(progressKey(deckId, question.id)));
    const rest = questions.filter((question) => !due.includes(question));
    questions = [...shuffle(due), ...shuffle(rest)].slice(0, 10);
  } else {
    questions = shuffle(questions);
  }

  if (!questions.length) {
    showToast("Nothing is due yet. Starting a mixed session instead.");
    questions = shuffle(deck.questions).slice(0, 10);
  }

  state.session = {
    deckId,
    mode,
    questions,
    index: 0,
    selected: [],
    textAnswer: "",
    checked: false,
    correct: false,
    correctCount: 0,
    answers: [],
    startedAt: Date.now(),
  };
  goTo("study");
}

function selectOption(optionId) {
  const session = state.session;
  if (!session || session.checked) return;
  const question = session.questions[session.index];

  if (question.type === "multiple") {
    session.selected = session.selected.includes(optionId)
      ? session.selected.filter((id) => id !== optionId)
      : [...session.selected, optionId];
  } else {
    session.selected = [optionId];
  }
  renderStudy();
}

function canCheck(question) {
  if (!state.session) return false;
  return question.type === "text"
    ? state.session.textAnswer.trim().length > 0
    : state.session.selected.length > 0;
}

function checkAnswer() {
  const session = state.session;
  if (!session || session.checked) return;
  const question = session.questions[session.index];
  if (!canCheck(question)) return;

  const correct = isAnswerCorrect(question, session);
  session.checked = true;
  session.correct = correct;
  if (correct) session.correctCount += 1;
  session.answers.push({ questionId: question.id, correct });
  updateQuestionProgress(session.deckId, question.id, correct);
  renderStudy();
}

function isAnswerCorrect(question, session) {
  if (question.type === "text") {
    return normalizeText(session.textAnswer) === normalizeText(question.correctTextAnswer);
  }
  const selected = [...session.selected].sort();
  const correct = [...question.correctOptions].sort();
  return selected.length === correct.length && selected.every((value, index) => value === correct[index]);
}

function updateQuestionProgress(deckId, questionId, wasCorrect) {
  const key = progressKey(deckId, questionId);
  const previous = state.progress[key] || {
    attempts: 0,
    correct: 0,
    streak: 0,
    interval: 0,
  };

  const streak = wasCorrect ? previous.streak + 1 : 0;
  const interval = wasCorrect
    ? previous.interval === 0
      ? 1
      : previous.interval === 1
        ? 3
        : Math.min(Math.round(previous.interval * 2.2), 180)
    : 0;

  state.progress[key] = {
    attempts: previous.attempts + 1,
    correct: previous.correct + (wasCorrect ? 1 : 0),
    streak,
    interval,
    lastAnsweredAt: Date.now(),
    dueAt: Date.now() + (wasCorrect ? interval * DAY : 10 * 60 * 1000),
  };
  save(STORAGE.progress, state.progress);
}

function nextQuestion() {
  const session = state.session;
  if (!session?.checked) return;
  session.index += 1;
  session.selected = [];
  session.textAnswer = "";
  session.checked = false;
  session.correct = false;
  if (session.index >= session.questions.length) finishSession();
  else renderStudy();
}

function finishSession() {
  state.view = "summary";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function endSession() {
  if (!state.session?.answers.length) return goTo("library");
  const confirmed = await confirmAction(
    "End this session?",
    "Your answered cards are saved. Unanswered cards will remain available for the next session.",
    "End session",
  );
  if (confirmed) goTo("library");
}

function studyMissed() {
  const session = state.session;
  const missedIds = new Set(session.answers.filter((answer) => !answer.correct).map((answer) => answer.questionId));
  const missed = session.questions.filter((question) => missedIds.has(question.id));
  if (!missed.length) {
    showToast("No missed cards in that session.");
    return goTo("library");
  }
  startSession(session.deckId, "missed", missed);
}

async function importDeckFiles(fileList) {
  const files = Array.from(fileList || []);
  let imported = 0;

  for (const file of files) {
    try {
      const deck = normalizeDeck(JSON.parse(await file.text()));
      const existingIndex = state.decks.findIndex((item) => item.id === deck.id);
      if (existingIndex >= 0) state.decks[existingIndex] = deck;
      else state.decks.push(deck);
      imported += 1;
    } catch (error) {
      showToast(`${file.name}: ${error.message}`);
    }
  }

  if (imported) {
    save(STORAGE.decks, state.decks);
    state.search = "";
    goTo("library");
    showToast(`${imported} deck${imported === 1 ? "" : "s"} imported.`);
  }
  importInput.value = "";
}

function exportDeck(deckId) {
  const deck = getDeck(deckId);
  downloadJson(`${slugify(deck.title)}.json`, deck);
}

function exportProgress() {
  downloadJson(`flashlearn-progress-${new Date().toISOString().slice(0, 10)}.json`, {
    exportedAt: new Date().toISOString(),
    progress: state.progress,
  });
}

async function resetDeck(deckId) {
  const deck = getDeck(deckId);
  const confirmed = await confirmAction(
    "Reset deck progress?",
    `This removes all study history for “${humanizeTitle(deck.title)}”.`,
    "Reset progress",
  );
  if (!confirmed) return;
  for (const question of deck.questions) delete state.progress[progressKey(deckId, question.id)];
  save(STORAGE.progress, state.progress);
  render();
  showToast("Deck progress reset.");
}

function goTo(view) {
  state.view = view;
  render();
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deckStats(deck) {
  const records = deck.questions
    .map((question) => state.progress[progressKey(deck.id, question.id)])
    .filter(Boolean);
  const mastered = records.filter((record) => record.interval >= 7).length;
  return {
    seen: records.length,
    due: records.filter((record) => !record.dueAt || record.dueAt <= Date.now()).length,
    mastery: deck.questions.length ? Math.round((mastered / deck.questions.length) * 100) : 0,
  };
}

function isDue(key) {
  const record = state.progress[key];
  return !record || !record.dueAt || record.dueAt <= Date.now();
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  save(STORAGE.settings, state.settings);
  applyTheme();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
}

function confirmAction(title, message, buttonLabel) {
  document.querySelector("#confirmTitle").textContent = title;
  document.querySelector("#confirmMessage").textContent = message;
  document.querySelector("#confirmButton").textContent = buttonLabel;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "confirm"), {
      once: true,
    });
  });
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), 3300);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
  }
}

function getDeck(id) {
  return state.decks.find((deck) => deck.id === id);
}

function progressKey(deckId, questionId) {
  return `${deckId}:${questionId}`;
}

function questionTypeLabel(type) {
  return {
    single: "Choose one answer",
    multiple: "Choose all that apply",
    true_false: "True or false",
    text: "Type your answer",
  }[type];
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function humanizeTitle(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeText(value) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function formatDuration(milliseconds) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  return `${minutes}m`;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function downloadJson(fileName, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
