const DRAFT_KEY = "flashlearn.builder.v1";
const TYPES = { single: "Single choice", multiple: "Multiple choice", true_false: "True / false", text: "Written answer" };
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function createQuestion() {
  return { id: crypto.randomUUID(), type: "single", question: "", code: "", explanation: "", options: [{ id: "A", text: "" }, { id: "B", text: "" }], correctOptions: [], correctTextAnswer: "" };
}

function newDraft() {
  return { id: crypto.randomUUID(), title: "", subject: "", description: "", createdAt: new Date().toISOString(), questions: [createQuestion()] };
}

export function buildDeck(draft) {
  if (!draft.title.trim()) throw new Error("Give your deck a title.");
  if (!draft.subject.trim()) throw new Error("Enter a course name for your deck.");
  if (!draft.questions.length) throw new Error("Add at least one question.");
  const questions = draft.questions.map((question, index) => {
    const prefix = `Question ${index + 1}: `;
    if (!TYPES[question.type]) throw new Error(`${prefix}choose a supported question type.`);
    if (!question.question.trim()) throw new Error(`${prefix}enter the question.`);
    const isText = question.type === "text";
    const options = isText ? [] : question.options.map((option) => ({ ...option, text: option.text.trim() }));
    const correctOptions = isText ? [] : question.correctOptions;
    if (isText && !question.correctTextAnswer.trim()) throw new Error(`${prefix}enter the correct written answer.`);
    if (!isText) {
      if (options.length < 2 || options.some((option) => !option.text)) throw new Error(`${prefix}fill in at least two answer options.`);
      if (!correctOptions.length || correctOptions.some((id) => !options.some((option) => option.id === id))) throw new Error(`${prefix}mark the correct answer.`);
      if (question.type !== "multiple" && correctOptions.length !== 1) throw new Error(`${prefix}mark exactly one correct answer.`);
    }
    return { id: question.id, type: question.type, question: question.question.trim(), code: question.code, explanation: question.explanation.trim(), options, correctOptions: [...correctOptions], correctTextAnswer: isText ? question.correctTextAnswer.trim() : "", tags: [], difficulty: "", source: "" };
  });
  return { schemaVersion: 1, id: draft.id, title: draft.title.trim(), subject: draft.subject.trim(), description: draft.description.trim(), createdAt: draft.createdAt, updatedAt: new Date().toISOString(), questions };
}

export function createDeckBuilder({ downloadJson, confirmAction }) {
  let draft;
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && typeof saved.id === "string" && [saved.title, saved.subject, saved.description].every((value) => typeof value === "string") && Array.isArray(saved.questions) && saved.questions.every((question) => typeof question.id === "string" && TYPES[question.type] && [question.question, question.code, question.explanation, question.correctTextAnswer].every((value) => typeof value === "string") && Array.isArray(question.correctOptions) && Array.isArray(question.options) && question.options.every((option) => typeof option.id === "string" && typeof option.text === "string"))) draft = saved;
  } catch { /* An unavailable or invalid saved draft starts a fresh editor. */ }
  draft ||= newDraft();
  let root;

  function persist() {
    const status = root.querySelector("#draftStatus");
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      status.textContent = "Draft saved in this browser";
    } catch {
      status.textContent = "Draft could not be saved. Download it before leaving this page.";
    }
    root.querySelector("#builderMessage").textContent = "";
  }

  function field(label, name, value, { textarea = false, required = false, placeholder = "" } = {}) {
    const id = `builder-${name}`;
    const attrs = `id="${escape(id)}" data-field="${escape(name)}" ${required ? "required" : ""} placeholder="${escape(placeholder)}"`;
    return `<label class="builder-field" for="${escape(id)}"><span>${label}${required ? " <span aria-hidden=\"true\">*</span>" : ""}</span>${textarea ? `<textarea ${attrs} rows="3">${escape(value)}</textarea>` : `<input ${attrs} type="text" value="${escape(value)}" />`}</label>`;
  }

  function questionCard(question, index) {
    const choice = question.type !== "text";
    return `<fieldset class="builder-question" data-question="${escape(question.id)}">
      <legend>Question ${index + 1}</legend>
      <div class="builder-question-toolbar">
        <label class="builder-field" for="type-${escape(question.id)}"><span>Question type</span><select id="type-${escape(question.id)}" data-type>${Object.entries(TYPES).map(([value, label]) => `<option value="${value}" ${question.type === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <button type="button" class="button button-ghost" data-builder-action="remove-question" aria-label="Remove question ${index + 1}">Remove question</button>
      </div>
      ${field("Question", `${question.id}:question`, question.question, { textarea: true, required: true, placeholder: "What would you like to ask?" })}
      ${choice ? `<div class="builder-answer-heading"><strong>Answer options</strong><p class="quiet">${question.type === "multiple" ? "Mark every correct answer." : "Mark the one correct answer."}</p></div>
        <div class="builder-options">${question.options.map((option, optionIndex) => `<div class="builder-option">
          <label class="builder-correct" title="Mark as correct"><input type="${question.type === "multiple" ? "checkbox" : "radio"}" name="correct-${escape(question.id)}" data-correct="${escape(option.id)}" ${question.correctOptions.includes(option.id) ? "checked" : ""} aria-label="Option ${optionIndex + 1} is correct for question ${index + 1}" /><span>Correct</span></label>
          <input type="text" data-option="${escape(option.id)}" value="${escape(option.text)}" aria-label="Answer option ${optionIndex + 1} for question ${index + 1}" required ${question.type === "true_false" ? "readonly" : ""} />
          ${question.type !== "true_false" ? `<button type="button" class="builder-remove-option" data-builder-action="remove-option" data-option-id="${escape(option.id)}" aria-label="Remove answer option ${optionIndex + 1} from question ${index + 1}" ${question.options.length <= 2 ? "disabled" : ""}>×</button>` : ""}
        </div>`).join("")}</div>
        ${question.type !== "true_false" ? `<button type="button" class="button button-ghost builder-add-option" data-builder-action="add-option">+ Add answer option</button>` : ""}`
        : `${field("Correct answer", `${question.id}:correctTextAnswer`, question.correctTextAnswer, { required: true })}<p class="quiet builder-answer-hint">Answers ignore capitalization and extra spaces.</p>`}
      <details class="builder-extras"><summary>Explanation and code (optional)</summary>
        ${field("Explanation", `${question.id}:explanation`, question.explanation, { textarea: true, placeholder: "Explain why the answer is correct." })}
        ${field("Code snippet", `${question.id}:code`, question.code, { textarea: true })}
      </details>
    </fieldset>`;
  }

  function render(container) {
    root = container;
    root.innerHTML = `<section class="deck-builder">
      <div class="builder-heading"><div><p class="eyebrow">Your own study material</p><h1>Create a deck</h1><p class="lead">Build questions, download your JSON file, then use Import deck to study.</p></div></div>
      <div class="builder-privacy">
        <p>Only in your browser. Drafts and imported decks are stored on this device and are never uploaded or visible to other visitors. Clearing browser data removes them; keep your downloaded JSON as a backup.</p>
        <p class="builder-math-help"><strong>Math with LaTeX:</strong> In questions, answer options, and explanations, use <code>\\(x^2\\)</code> for inline math or <code>\\[\\frac{a}{b}\\]</code> for a formula on its own line. For example, <code>\\(\\sqrt{x} + \\alpha\\)</code> gives a square root and a Greek letter. Type single backslashes here; the JSON download escapes them automatically.</p>
      </div>
      <form id="deckBuilderForm">
        <section class="builder-metadata" aria-label="Deck details">
          ${field("Deck title", "title", draft.title, { required: true, placeholder: "e.g. Biology — Chapter 1" })}
          ${field("Course", "subject", draft.subject, { required: true, placeholder: "e.g. Biology" })}
          <div class="builder-description">${field("Description (optional)", "description", draft.description, { textarea: true })}</div>
        </section>
        <div class="builder-section-heading"><h2>Questions</h2><span class="quiet">${draft.questions.length} ${draft.questions.length === 1 ? "question" : "questions"}</span></div>
        <div class="builder-questions">${draft.questions.map(questionCard).join("")}</div>
        <button type="button" class="button button-ghost builder-add-question" data-builder-action="add-question">+ Add question</button>
        <div class="builder-footer"><div><p id="draftStatus" class="quiet" role="status"></p><p id="builderMessage" tabindex="-1" role="status"></p></div><div class="builder-footer-actions"><button type="button" class="button button-ghost" data-builder-action="new-deck">New deck</button><button type="submit" class="button button-primary">Download JSON</button></div></div>
      </form>
    </section>`;
    const form = root.querySelector("#deckBuilderForm");
    form.addEventListener("input", handleInput);
    form.addEventListener("change", handleChange);
    form.addEventListener("click", handleClick);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = root.querySelector("#builderMessage");
      try {
        const deck = buildDeck(draft);
        const filename = deck.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-deck";
        downloadJson(`${filename}.json`, deck);
        message.textContent = "JSON downloaded. Use Import deck to add it to your private library.";
      } catch (error) {
        message.textContent = error.message;
        message.focus();
      }
    });
    persist();
  }

  function questionFor(element) {
    return draft.questions.find((question) => question.id === element.closest("[data-question]")?.dataset.question);
  }

  function handleInput(event) {
    const target = event.target;
    if (target.dataset.field) {
      const [id, key] = target.dataset.field.split(":");
      if (key) draft.questions.find((question) => question.id === id)[key] = target.value;
      else draft[id] = target.value;
      persist();
    }
    if (target.dataset.option) {
      questionFor(target).options.find((option) => option.id === target.dataset.option).text = target.value;
      persist();
    }
  }

  function handleChange(event) {
    const target = event.target;
    const question = questionFor(target);
    if (target.hasAttribute("data-type")) {
      question.type = target.value;
      question.correctOptions = [];
      if (question.type === "true_false") question.options = [{ id: "A", text: "True" }, { id: "B", text: "False" }];
      else if (question.options.length < 2 || question.options.every((option) => ["True", "False"].includes(option.text))) question.options = [{ id: "A", text: "" }, { id: "B", text: "" }];
      persist();
      render(root);
      root.querySelector(`#type-${question.id}`).focus();
    }
    if (target.dataset.correct) {
      if (question.type === "multiple") question.correctOptions = target.checked ? [...new Set([...question.correctOptions, target.dataset.correct])] : question.correctOptions.filter((id) => id !== target.dataset.correct);
      else question.correctOptions = [target.dataset.correct];
      persist();
    }
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-builder-action]");
    if (!button) return;
    const action = button.dataset.builderAction;
    const question = questionFor(button);
    let focusSelector = "[data-builder-action='add-question']";
    if (action === "add-question") {
      const added = createQuestion();
      draft.questions.push(added);
      focusSelector = `[data-field='${added.id}:question']`;
    }
    if (action === "remove-question") draft.questions = draft.questions.filter((item) => item.id !== question.id);
    if (action === "add-option") {
      const id = crypto.randomUUID();
      question.options.push({ id, text: "" });
      focusSelector = `[data-option='${id}']`;
    }
    if (action === "remove-option") {
      if (question.options.length <= 2) return;
      question.options = question.options.filter((option) => option.id !== button.dataset.optionId);
      question.correctOptions = question.correctOptions.filter((id) => id !== button.dataset.optionId);
      focusSelector = `[data-question='${question.id}'] [data-builder-action='add-option']`;
    }
    if (action === "new-deck") {
      if (!(await confirmAction("Start a new deck?", "This replaces the draft in this browser. Download your current deck first if you want to keep it.", "New deck"))) return;
      draft = newDraft();
      focusSelector = "#builder-title";
    }
    persist();
    render(root);
    root.querySelector(focusSelector)?.focus();
  }

  return { render };
}
