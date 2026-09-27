(function () {
  const app = document.getElementById("app");
  const printRoot = document.getElementById("print-root");

  let db = load();
  let query = "";
  let section = sessionStorage.getItem("karta-section") || "anketa";
  let scorePeriod = "start";
  let saveTimer = null;
  let saveFailed = false;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function fmtDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return value || "";
    return match[3] + "." + match[2] + "." + match[1];
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { children: [] };
      const data = JSON.parse(raw);
      data.children = data.children || [];
      return data;
    } catch (err) {
      return { children: [] };
    }
  }

  function persist(label) {
    db.savedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      saveFailed = false;
    } catch (err) {
      saveFailed = true;
    }
    showSaveError();
    const el = document.getElementById("save-state");
    if (el) el.textContent = saveLabel(label);
    return !saveFailed;
  }

  function saveLabel(label) {
    return saveFailed ? "Не сохранено" : label || "Сохранено";
  }

  function saveStateClass() {
    return saveFailed ? "save-state is-error" : "save-state";
  }

  function showSaveError() {
    let box = document.getElementById("save-error");
    const el = document.getElementById("save-state");
    if (el) el.className = saveStateClass();
    if (!saveFailed) {
      if (box) box.remove();
      return;
    }
    if (box) return;
    box = document.createElement("div");
    box.id = "save-error";
    box.className = "save-error";
    box.setAttribute("role", "alert");
    box.textContent =
      "Не удалось сохранить изменения в браузере: память переполнена или запрещена. " +
      "Нажмите «Копия», чтобы сохранить данные в файл, иначе они пропадут после закрытия страницы.";
    document.body.prepend(box);
  }

  function scheduleSave() {
    const el = document.getElementById("save-state");
    if (el) el.textContent = "Сохранение…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      persist();
    }, 250);
  }

  const BACKUP_KEY = STORAGE_KEY + ":backupAt";
  const SNOOZE_KEY = STORAGE_KEY + ":backupSnooze";
  const BACKUP_DAYS = 7;
  const DAY = 24 * 60 * 60 * 1000;

  function readNum(key) {
    try {
      return Number(localStorage.getItem(key)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function writeNum(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (err) {}
  }

  function markBackup() {
    writeNum(BACKUP_KEY, Date.now());
    writeNum(SNOOZE_KEY, 0);
  }

  function backupNotice() {
    if (!db.children.length || !db.savedAt) return "";
    const now = Date.now();
    let backupAt = readNum(BACKUP_KEY);
    if (!backupAt) {
      // Копию ещё не делали: отсчёт с первого запуска с данными.
      backupAt = now;
      writeNum(BACKUP_KEY, backupAt);
    }
    if (db.savedAt <= backupAt) return "";
    if (now - backupAt < BACKUP_DAYS * DAY) return "";
    if (now < readNum(SNOOZE_KEY)) return "";
    const days = Math.floor((now - backupAt) / DAY);
    return (
      '<div class="backup-note" role="status">' +
      "<span>Копию картотеки не сохраняли " +
      days +
      " дн. Данные хранятся только в этом браузере — сохраните файл копии.</span>" +
      '<div class="row">' +
      '<button class="btn btn-primary" data-action="export">Сохранить копию</button>' +
      '<button class="btn btn-ghost" data-action="snooze-backup">Позже</button>' +
      "</div></div>"
    );
  }

  function route() {
    const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
    if (parts[0] === "c" && parts[2] === "m") {
      return { view: "map", childId: parts[1], mapId: parts[3] };
    }
    if (parts[0] === "c") return { view: "child", childId: parts[1] };
    return { view: "home" };
  }

  function findChild(id) {
    return db.children.find(function (child) {
      return child.id === id;
    });
  }

  function findMap(child, id) {
    return (child.maps || []).find(function (map) {
      return map.id === id;
    });
  }

  function ageText(birth, onDate) {
    if (!birth) return "";
    const start = new Date(birth);
    const end = onDate ? new Date(onDate) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    if (end.getDate() < start.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    const yWord = years === 1 ? "год" : years >= 2 && years <= 4 ? "года" : "лет";
    const mWord = months === 1 ? "месяц" : months >= 2 && months <= 4 ? "месяца" : "месяцев";
    if (years <= 0) return months + " " + mWord;
    if (months === 0) return years + " " + yWord;
    return years + " " + yWord + " " + months + " " + mWord;
  }

  function emptyChild() {
    return {
      id: uid(),
      fio: "",
      birthDate: "",
      group: "",
      address: "",
      phone: "",
      mobile: "",
      rmpk: "",
      protocolNo: "",
      protocolDate: "",
      admittedFrom: "",
      mother: { name: "", year: "", nation: "", specialty: "", work: "" },
      father: { name: "", year: "", nation: "", specialty: "", work: "" },
      parentsSpeech: "",
      bilingual: "",
      anamnesis: {},
      maps: [],
    };
  }

  function emptyMap(age) {
    return {
      id: uid(),
      age: Number(age),
      date: today(),
      answers: {},
      scores: {
        start: { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", conclusion: "" },
        mid: { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", conclusion: "" },
        end: { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", conclusion: "" },
      },
      conclusions: { year1: "", year2: "", year3: "" },
      signDate: "",
      head: "",
      logoped: "",
      diary: "",
      missedDays: "",
      incomplete: false,
    };
  }

  function ans(map, key) {
    return map.answers[key] || "";
  }

  function an(child, key) {
    return child.anamnesis[key] || "";
  }

  function topbar(extra) {
    return (
      '<header class="topbar">' +
      '<div class="brand"><h1>' +
      APP_TITLE +
      "</h1><span>Крупенчук, 4 / 5 / 6 лет</span></div>" +
      '<div class="top-actions">' +
      (extra || "") +
      '<button class="btn" data-action="export">Копия</button>' +
      '<button class="btn" data-action="import">Загрузить копию</button>' +
      '<input class="hidden-file" id="import-file" type="file" accept="application/json">' +
      "</div></header>" +
      backupNotice()
    );
  }

  function chips(name, setName) {
    const list = CHIPS[setName] || [];
    if (!list.length) return "";
    return (
      '<div class="chips">' +
      list
        .map(function (item) {
          return (
            '<button type="button" class="chip" data-chip="' +
            esc(name) +
            '" data-value="' +
            esc(item) +
            '">' +
            esc(item) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function field(label, name, opts) {
    opts = opts || {};
    const value = opts.value || "";
    const type = opts.type || "text";
    const control =
      type === "textarea"
        ? '<textarea class="control" name="' +
          esc(name) +
          '" data-scope="' +
          esc(opts.scope || "map") +
          '">' +
          esc(value) +
          "</textarea>"
        : '<input class="control" type="' +
          type +
          '" name="' +
          esc(name) +
          '" data-scope="' +
          esc(opts.scope || "map") +
          '" value="' +
          esc(value) +
          '"' +
          (opts.min ? ' min="' + esc(opts.min) + '"' : "") +
          (opts.max ? ' max="' + esc(opts.max) + '"' : "") +
          (opts.scope === "readonly" ? " disabled" : "") +
          ">";
    return (
      '<label class="field' +
      (opts.span ? " span-2" : "") +
      '"><span class="field-label">' +
      esc(label) +
      "</span>" +
      (opts.chips ? chips(name, opts.chips) : "") +
      control +
      "</label>"
    );
  }

  function renderHome() {
    const q = query.trim().toLowerCase();
    const list = db.children
      .filter(function (child) {
        return !q || (child.fio || "").toLowerCase().indexOf(q) !== -1;
      })
      .sort(function (a, b) {
        return (a.fio || "").localeCompare(b.fio || "", "ru");
      });

    const cards = list.length
      ? '<div class="grid-cards">' +
        list
          .map(function (child) {
            const maps = child.maps || [];
            return (
              '<article class="card child-card">' +
              "<div><h3>" +
              esc(child.fio || "Без имени") +
              "</h3><div class='meta'><span class='pill'>" +
              esc(ageText(child.birthDate) || "возраст не указан") +
              "</span><span>" +
              esc(child.group || "группа не указана") +
              "</span><span>карт: " +
              maps.length +
              "</span></div></div>" +
              '<div class="toolbar">' +
              '<button class="btn btn-primary" data-action="open-child" data-id="' +
              child.id +
              '">Изменить</button>' +
              '<button class="btn btn-danger" data-action="delete-child" data-id="' +
              child.id +
              '">Удалить</button>' +
              "</div></article>"
            );
          })
          .join("") +
        "</div>"
      : '<div class="card empty"><h2>Картотека пуста</h2><p class="muted">Добавьте ребёнка — и можно заполнять речевую карту по Крупенчук.</p></div>';

    app.innerHTML =
      topbar() +
      '<main class="wrap"><div class="hero"><div><h2>Дети</h2><p class="muted">Данные хранятся только на этом компьютере.</p></div>' +
      '<div class="toolbar"><input class="search" name="query" placeholder="Поиск по имени" value="' +
      esc(query) +
      '"><button class="btn btn-primary" data-action="add-child">Добавить ребёнка</button></div></div>' +
      cards +
      "</main>";
    printRoot.innerHTML = "";
  }

  function renderChild(child) {
    const maps = child.maps || [];
    const mapList = maps.length
      ? '<div class="list">' +
        maps
          .map(function (map) {
            const tpl = AGES[map.age] || AGES[5];
            return (
              '<div class="map-item"><div><b>' +
              esc(tpl.title) +
              "</b><div class='muted'>дата обследования: " +
              esc(map.date || "не указана") +
              "</div></div><div class='toolbar'><button class='btn btn-primary' data-action='open-map' data-id='" +
              map.id +
              "'>Изменить</button><button class='btn btn-danger' data-action='delete-map' data-id='" +
              map.id +
              "'>Удалить</button></div></div>"
            );
          })
          .join("") +
        "</div>"
      : '<p class="muted">Карт пока нет. Выберите возраст обследования.</p>';

    app.innerHTML =
      topbar('<button class="btn" data-action="home">К списку</button>') +
      '<main class="wrap"><div class="panel"><div class="editor-head"><div><h2>Карточка ребёнка</h2>' +
      '<p class="muted">' +
      esc(child.fio || "Заполните данные. Изменения сохраняются сразу.") +
      '</p></div><div class="toolbar"><span class="' + saveStateClass() + '" id="save-state">' + saveLabel() + '</span>' +
      '<button class="btn btn-danger" data-action="delete-child" data-id="' +
      child.id +
      '">Удалить карточку</button></div></div><div class="fields two">' +
      field("Фамилия, имя, отчество", "fio", { scope: "child", value: child.fio }) +
      field("Дата рождения", "birthDate", {
        scope: "child",
        type: "date",
        value: child.birthDate,
        min: "1990-01-01",
        max: today(),
      }) +
      field("Группа", "group", { scope: "child", value: child.group }) +
      field("Возраст сейчас", "ageNow", { scope: "readonly", value: ageText(child.birthDate), type: "text" }) +
      field("Домашний адрес", "address", { scope: "child", value: child.address, span: true }) +
      field("Домашний телефон", "phone", { scope: "child", value: child.phone }) +
      field("Мобильный (родителя)", "mobile", { scope: "child", value: child.mobile }) +
      "</div></div><div class='panel'><h2>Речевые карты</h2>" +
      '<div class="toolbar"><button class="btn btn-primary" data-action="add-map" data-age="4">Карта 4 года</button>' +
      '<button class="btn btn-primary" data-action="add-map" data-age="5">Карта 5 лет</button>' +
      '<button class="btn btn-primary" data-action="add-map" data-age="6">Карта 6 лет</button></div>' +
      mapList +
      "</div></main>";
    printRoot.innerHTML = "";
  }

  function sectionHtml(child, map) {
    const tpl = AGES[map.age];
    if (section === "anketa") return sectionAnketa(child, map);
    if (section === "parents") return sectionParents(child);
    if (section === "anamnesis") return sectionAnamnesis(child);
    if (section === "speech-anamnesis") return sectionSpeechAnamnesis(child);
    if (section === "apparatus") return sectionApparatus(map);
    if (section === "motor") return sectionMotor(map);
    if (section === "sounds") return sectionSounds(map);
    if (section === "syllables") return sectionSyllables(map, tpl);
    if (section === "phonem") return sectionPhonem(map, tpl);
    if (section === "grammar") return sectionGrammar(map, tpl);
    if (section === "lexicon") return sectionLexicon(map, tpl);
    if (section === "comprehension") return sectionComprehension(map);
    if (section === "connected") return sectionConnected(map, tpl);
    if (section === "scores") return sectionScores(map);
    if (section === "diary") return sectionDiary(map);
    return "";
  }

  function sectionAnketa(child, map) {
    return (
      "<h2 class='section-title'>Анкета</h2>" +
      '<div class="fields two">' +
      field("Фамилия, имя, отчество ребёнка", "fio", { scope: "child", value: child.fio }) +
      field("Дата рождения", "birthDate", {
        scope: "child",
        type: "date",
        value: child.birthDate,
        min: "1990-01-01",
        max: today(),
      }) +
      field("Возраст", "ageCalc", { scope: "readonly", value: ageText(child.birthDate, map.date) }) +
      field("Дата обследования", "date", { scope: "mapField", type: "date", value: map.date }) +
      field("Группа", "group", { scope: "child", value: child.group }) +
      field("Домашний адрес", "address", { scope: "child", value: child.address, span: true }) +
      field("Домашний телефон", "phone", { scope: "child", value: child.phone }) +
      field("Мобильный (родителя)", "mobile", { scope: "child", value: child.mobile }) +
      field("Заключение РМПК", "rmpk", { scope: "child", value: child.rmpk, type: "textarea", span: true }) +
      field("Протокол №", "protocolNo", { scope: "child", value: child.protocolNo }) +
      field("от", "protocolDate", { scope: "child", type: "date", value: child.protocolDate }) +
      field("Поступил / из д/с", "admittedFrom", { scope: "child", value: child.admittedFrom, span: true }) +
      "</div>"
    );
  }

  function parentFields(prefix, person, title) {
    return (
      "<h2 class='section-title'>" +
      title +
      "</h2><div class='fields two'>" +
      field("ФИО", prefix + ".name", { scope: "parent", value: person.name }) +
      field("Год рождения", prefix + ".year", { scope: "parent", value: person.year }) +
      field("Национальность", prefix + ".nation", { scope: "parent", value: person.nation }) +
      field("Специальность", prefix + ".specialty", { scope: "parent", value: person.specialty }) +
      field("Место работы", prefix + ".work", { scope: "parent", value: person.work, span: true }) +
      "</div>"
    );
  }

  function sectionParents(child) {
    return (
      parentFields("mother", child.mother, "Мать") +
      parentFields("father", child.father, "Отец") +
      '<div class="fields">' +
      field("Речь родителей и родственников", "parentsSpeech", {
        scope: "child",
        value: child.parentsSpeech,
        type: "textarea",
      }) +
      field("Двуязычие в семье", "bilingual", { scope: "child", value: child.bilingual, chips: "yesno" }) +
      "</div>"
    );
  }

  function sectionAnamnesis(child) {
    return (
      "<h2 class='section-title'>Общий анамнез</h2><div class='fields two'>" +
      field("От беременности", "pregnancyNo", { scope: "anam", value: an(child, "pregnancyNo") }) +
      field("Роды", "birthNo", { scope: "anam", value: an(child, "birthNo") }) +
      field("Как протекала беременность", "pregnancy", {
        scope: "anam",
        value: an(child, "pregnancy"),
        type: "textarea",
        span: true,
      }) +
      field("Роды в недель", "weeks", { scope: "anam", value: an(child, "weeks") }) +
      field("Характер родов", "birthType", { scope: "anam", value: an(child, "birthType"), chips: "birth" }) +
      field("Стимуляция", "stim", { scope: "anam", value: an(child, "stim"), chips: "stim" }) +
      field("Крик", "cry", { scope: "anam", value: an(child, "cry"), chips: "cry" }) +
      field("Асфиксия", "asphyxia", { scope: "anam", value: an(child, "asphyxia"), chips: "asphyxia" }) +
      field("Rh", "rh", { scope: "anam", value: an(child, "rh"), chips: "rh" }) +
      field("Вес / рост", "weight", { scope: "anam", value: an(child, "weight") }) +
      field("Родовые травмы", "trauma", { scope: "anam", value: an(child, "trauma"), span: true }) +
      field("Когда принесли кормить", "feedWhen", { scope: "anam", value: an(child, "feedWhen") }) +
      field("Сосал", "suck", { scope: "anam", value: an(child, "suck"), chips: "suck" }) +
      field("Грудное вскармливание с", "breastFrom", { scope: "anam", value: an(child, "breastFrom") }) +
      field("до", "breastTo", { scope: "anam", value: an(child, "breastTo") }) +
      field("Голову держит (до 3 мес.)", "head", { scope: "anam", value: an(child, "head") }) +
      field("Ползает (6)", "crawl", { scope: "anam", value: an(child, "crawl") }) +
      field("Сидит сам (7)", "sit", { scope: "anam", value: an(child, "sit") }) +
      field("Пошёл сам (12)", "walk", { scope: "anam", value: an(child, "walk") }) +
      field("Появился 1-й зуб", "tooth", { scope: "anam", value: an(child, "tooth") }) +
      field("Заболевания до 1 года", "ill1", { scope: "anam", value: an(child, "ill1"), type: "textarea", span: true }) +
      field("После года", "ill2", { scope: "anam", value: an(child, "ill2"), type: "textarea", span: true }) +
      field("Инфекционные", "infect", { scope: "anam", value: an(child, "infect"), span: true }) +
      field("Травмы головы", "headTrauma", { scope: "anam", value: an(child, "headTrauma") }) +
      field("Судороги на t°", "seizures", { scope: "anam", value: an(child, "seizures") }) +
      field("Диспансерный учёт", "disp", { scope: "anam", value: an(child, "disp"), span: true }) +
      "</div>"
    );
  }

  function sectionSpeechAnamnesis(child) {
    return (
      "<h2 class='section-title'>Речевой анамнез</h2><div class='fields two'>" +
      field("Первые слова к (1 год)", "firstWords", { scope: "anam", value: an(child, "firstWords") }) +
      field("Фразы к (2 года)", "phrasesAge", { scope: "anam", value: an(child, "phrasesAge") }) +
      field("Прерывалось ли речевое развитие", "interrupt", {
        scope: "anam",
        value: an(child, "interrupt"),
        chips: "yesno",
        span: true,
      }) +
      field("Отношение к своей речи", "attitude", { scope: "anam", value: an(child, "attitude"), span: true }) +
      field("Занимались ли с логопедом", "logopedBefore", {
        scope: "anam",
        value: an(child, "logopedBefore"),
        type: "textarea",
        span: true,
      }) +
      "</div>"
    );
  }

  function sectionApparatus(map) {
    return (
      "<h2 class='section-title'>Речевой аппарат, голос, просодика</h2><div class='fields two'>" +
      field("Губы", "lips", { value: ans(map, "lips"), chips: "lips" }) +
      field("Зубы", "teeth", { value: ans(map, "teeth"), chips: "teeth" }) +
      field("Клыки", "fangs", { value: ans(map, "fangs"), chips: "fangs" }) +
      field("Прикус", "bite", { value: ans(map, "bite"), chips: "bite" }) +
      field("Сагиттальная щель", "gap", { value: ans(map, "gap"), chips: "gap" }) +
      field("Твёрдое нёбо", "palate", { value: ans(map, "palate"), chips: "palate" }) +
      field("Нёбный шов", "suture", { value: ans(map, "suture"), chips: "suture" }) +
      field("Мягкое нёбо", "soft", { value: ans(map, "soft"), chips: "soft" }) +
      field("Язык", "tongue", { value: ans(map, "tongue"), chips: "tongue", span: true }) +
      field("Подъязычная связка", "frenulum", { value: ans(map, "frenulum"), chips: "frenulum" }) +
      field("Крепление верхнее (к языку)", "frenUp", { value: ans(map, "frenUp") }) +
      field("Крепление нижнее", "frenDown", { value: ans(map, "frenDown") }) +
      field("Голос", "voice", { value: ans(map, "voice"), chips: "voice" }) +
      field("Темп", "tempo", { value: ans(map, "tempo"), chips: "tempo" }) +
      field("Ритм", "rhythm", { value: ans(map, "rhythm"), chips: "rhythm" }) +
      field("Паузация", "pause", { value: ans(map, "pause"), chips: "pause" }) +
      field("Интонация", "intonation", { value: ans(map, "intonation"), chips: "intonation" }) +
      "</div>"
    );
  }

  function sectionMotor(map) {
    let html =
      "<h2 class='section-title'>Мимическая и артикуляционная мускулатура</h2>" +
      "<p class='hint'>Отмечается: есть ли движение; замена, объём, точность, тонус, синкинезии, тремор, девиация, саливация, переключаемость, истощаемость.</p>" +
      "<div class='toolbar'><span class='muted'>В пустые ячейки:</span>";
    CHIPS.motor.forEach(function (item) {
      html +=
        '<button type="button" class="chip" data-action="fill-motor" data-value="' +
        esc(item) +
        '">' +
        esc(item) +
        "</button>";
    });
    html +=
      "</div><div class='table-wrap'><table class='data'><thead><tr><th>Движение</th><th>Результат</th><th>Движение</th><th>Результат</th></tr></thead><tbody>";
    for (let i = 0; i < MOTOR_LEFT.length; i += 1) {
      html +=
        "<tr><td>" +
        esc(MOTOR_LEFT[i]) +
        "</td><td><input name='mot:" +
        esc(MOTOR_LEFT[i]) +
        "' data-scope='map' value='" +
        esc(ans(map, "mot:" + MOTOR_LEFT[i])) +
        "'></td><td>" +
        esc(MOTOR_RIGHT[i]) +
        "</td><td><input name='mot:" +
        esc(MOTOR_RIGHT[i]) +
        "' data-scope='map' value='" +
        esc(ans(map, "mot:" + MOTOR_RIGHT[i])) +
        "'></td></tr>";
    }
    return html + "</tbody></table></div>";
  }

  function soundCell(map, sound, pos, disabled) {
    if (disabled) return "<td>—</td>";
    const name = "snd:" + sound + ":" + pos;
    return "<td><input name='" + esc(name) + "' data-scope='map' value='" + esc(ans(map, name)) + "'></td>";
  }

  function sectionSounds(map) {
    const left = CONSONANTS.slice(0, 18);
    const right = CONSONANTS.slice(18);
    let html =
      "<h2 class='section-title'>Звукопроизношение</h2>" +
      "<p class='hint'>N — норма. Если артикуляция нечёткая — слог с А (твёрдые) или Я (мягкие). Нажмите на букву звука, чтобы поставить N во всю строку.</p>" +
      "<div class='toolbar'><button class='btn' data-action='fill-vowels'>N все гласные</button>" +
      "<button class='btn' data-action='fill-cons'>N все пустые согласные</button></div>" +
      "<h3>Гласные</h3><div class='table-wrap'><table class='data'><thead><tr><th>Звук</th>";
    VOWELS.forEach(function (v) {
      html += "<th>" + v + "</th>";
    });
    html += "</tr></thead><tbody><tr><td>Произношение</td>";
    VOWELS.forEach(function (v) {
      html +=
        "<td><input name='vow:" +
        v +
        "' data-scope='map' value='" +
        esc(ans(map, "vow:" + v)) +
        "'></td>";
    });
    html +=
      "</tr></tbody></table></div><h3>Согласные</h3><div class='table-wrap'><table class='data'><thead><tr><th>Звук</th><th>нач.</th><th>сер.</th><th>кон.</th><th>слог</th><th>Звук</th><th>нач.</th><th>сер.</th><th>кон.</th><th>слог</th></tr></thead><tbody>";
    for (let i = 0; i < left.length; i += 1) {
      const a = left[i];
      const b = right[i];
      html +=
        "<tr><td><button type='button' class='sound-letter' data-action='fill-sound' data-sound='" +
        esc(a.sound) +
        "'>" +
        esc(a.sound) +
        "</button></td>" +
        soundCell(map, a.sound, "start") +
        soundCell(map, a.sound, "mid") +
        soundCell(map, a.sound, "end", !a.end) +
        soundCell(map, a.sound, "syl") +
        "<td><button type='button' class='sound-letter' data-action='fill-sound' data-sound='" +
        esc(b.sound) +
        "'>" +
        esc(b.sound) +
        "</button></td>" +
        soundCell(map, b.sound, "start") +
        soundCell(map, b.sound, "mid") +
        soundCell(map, b.sound, "end", !b.end) +
        soundCell(map, b.sound, "syl") +
        "</tr>";
    }
    return html + "</tbody></table></div>";
  }

  function pairTable(items, prefix, map, colTitle, chipsName) {
    let html =
      "<div class='table-wrap'><table class='data'><thead><tr><th>" +
      colTitle +
      "</th><th>Результат</th><th>" +
      colTitle +
      "</th><th>Результат</th></tr></thead><tbody>";
    for (let i = 0; i < items.length; i += 2) {
      const a = items[i];
      const b = items[i + 1];
      html +=
        "<tr><td>" +
        esc(a) +
        "</td><td><input name='" +
        prefix +
        ":" +
        esc(a) +
        "' data-scope='map' value='" +
        esc(ans(map, prefix + ":" + a)) +
        "'></td>";
      if (b) {
        html +=
          "<td>" +
          esc(b) +
          "</td><td><input name='" +
          prefix +
          ":" +
          esc(b) +
          "' data-scope='map' value='" +
          esc(ans(map, prefix + ":" + b)) +
          "'></td>";
      } else html += "<td></td><td></td>";
      html += "</tr>";
    }
    return html + "</tbody></table></div>" + (chipsName ? "<p class='hint'>Можно ставить N или записывать речь ребёнка.</p>" : "");
  }

  function sectionSyllables(map, tpl) {
    let html =
      "<h2 class='section-title'>Слоговая структура</h2><p class='hint'>N — норма; иначе записывается речь ребёнка.</p>" +
      pairTable(tpl.syllableWords, "syl", map, "Слово") +
      "<h3>Фразы</h3><div class='fields'>";
    tpl.phrases.forEach(function (phrase, i) {
      html += field(phrase, "phr:" + i, { value: ans(map, "phr:" + i), chips: "N" });
    });
    return html + "</div>";
  }

  function sectionPhonem(map, tpl) {
    let html = "<h2 class='section-title'>Фонематические процессы</h2>";
    tpl.phonemTasks.forEach(function (task, ti) {
      html += "<h3>" + esc(task.age) + ". " + esc(task.text) + "</h3><div class='fields two'>";
      task.items.forEach(function (item, ii) {
        html += field(item, "ph:" + ti + ":" + ii, { value: ans(map, "ph:" + ti + ":" + ii), chips: "ok" });
      });
      html += "</div>";
    });
    html +=
      "<h3>Различение слов, близких по звучанию</h3>" +
      pairTable(WORD_PAIRS, "pair", map, "Пара слов") +
      "<h3>Звуковые дорожки</h3>" +
      pairTable(SOUND_TRACKS, "track", map, "Ряд");
    if (tpl.phonemIdea) {
      html += "<div class='fields'>" + field(tpl.phonemIdea, "idea", { value: ans(map, "idea") }) + "</div>";
    }
    return html;
  }

  function sectionGrammar(map, tpl) {
    let html =
      "<h2 class='section-title'>Грамматический строй</h2><h3>А. Единственное число → множественное</h3>" +
      "<p class='hint'>Образец: " +
      esc(tpl.plural.sample[0]) +
      " → " +
      esc(tpl.plural.sample[1]) +
      "</p><div class='fields two'>";
    tpl.plural.words.forEach(function (word) {
      html += field(word, "plur:" + word, { value: ans(map, "plur:" + word) });
    });
    html += "</div><h3>Б. Согласование с числительными</h3><div class='table-wrap'><table class='data'><thead><tr><th>1</th><th>2</th><th>5</th></tr></thead><tbody>";
    tpl.numerals.forEach(function (word) {
      html +=
        "<tr><td>" +
        esc(word) +
        "</td><td><input name='num:" +
        esc(word) +
        ":2' data-scope='map' value='" +
        esc(ans(map, "num:" + word + ":2")) +
        "'></td><td><input name='num:" +
        esc(word) +
        ":5' data-scope='map' value='" +
        esc(ans(map, "num:" + word + ":5")) +
        "'></td></tr>";
    });
    html +=
      "</tbody></table></div><h3>В. Согласование падежных окончаний</h3><div class='table-wrap'><table class='data'><thead><tr><th>Падеж</th>";
    CASE_WORDS.forEach(function (w) {
      html += "<th>" + esc(w) + "</th>";
    });
    html += "</tr></thead><tbody>";
    CASES.forEach(function (c) {
      html += "<tr><td>" + esc(c.label) + "</td>";
      CASE_WORDS.forEach(function (w) {
        const name = "case:" + w + ":" + c.id;
        html += "<td><input name='" + name + "' data-scope='map' value='" + esc(ans(map, name)) + "'></td>";
      });
      html += "</tr>";
    });
    html +=
      "</tbody></table></div><h3>Словообразование. А. Уменьшительно-ласкательные формы</h3>" +
      "<p class='hint'>Образец: " +
      esc(tpl.diminutive.sample[0]) +
      " → " +
      esc(tpl.diminutive.sample[1]) +
      "</p><div class='fields two'>";
    tpl.diminutive.words.forEach(function (word) {
      html += field(word, "dim:" + word, { value: ans(map, "dim:" + word) });
    });
    html +=
      "</div><h3>Б. Согласование с предлогами (" +
      esc(tpl.prepositions) +
      ")</h3><div class='fields'>" +
      field("По сюжетной картинке", "prep", { value: ans(map, "prep"), type: "textarea" }) +
      "</div>";
    tpl.extraGrammar.forEach(function (block) {
      html += "<h3>" + esc(block.title) + "</h3>";
      if (block.sample) {
        html +=
          "<p class='hint'>Образец: " +
          esc(block.sample[0]) +
          " → " +
          esc(block.sample[1]) +
          "</p><div class='fields two'>";
        block.words.forEach(function (word) {
          const prefix = block.type === "relative" ? "rel:" : "pos:";
          html += field(word, prefix + word, { value: ans(map, prefix + word) });
        });
        html += "</div>";
      }
      if (block.prefixes) {
        html += "<p class='hint'>" + esc(block.hint) + "</p><div class='fields two'>";
        block.prefixes.forEach(function (p) {
          html += field(p + "-шёл", "pref:" + p, { value: ans(map, "pref:" + p) });
        });
        html += "</div>";
      }
    });
    return html;
  }

  function sectionLexicon(map, tpl) {
    let html = "<h2 class='section-title'>Лексический запас</h2><h3>А. Назови одним словом</h3><div class='fields'>";
    tpl.classify.forEach(function (item) {
      html += field(item.prompt, "cls:" + item.id, { value: ans(map, "cls:" + item.id) });
    });
    html += "</div><h3>Б. Назови детёнышей</h3><div class='fields two'>";
    tpl.babies.forEach(function (item) {
      html += field("У " + item, "baby:" + item, { value: ans(map, "baby:" + item) });
    });
    html += "</div><h3>В. Антонимы — скажи наоборот</h3><div class='fields two'>";
    tpl.antonyms.forEach(function (item) {
      html += field(item, "ant:" + item, { value: ans(map, "ant:" + item) });
    });
    html += "</div><h3>Г. Глагольный словарь — кто что делает?</h3><div class='fields two'>";
    tpl.verbs.forEach(function (item) {
      html += field(item, "verb:" + item, { value: ans(map, "verb:" + item) });
    });
    return html + "</div>";
  }

  function sectionComprehension(map) {
    let html = "<h2 class='section-title'>Обследование понимания речи</h2><div class='fields'>";
    COMPREHENSION.forEach(function (item, i) {
      html += field(item, "comp:" + i, { value: ans(map, "comp:" + i), chips: "ok", type: "textarea" });
    });
    return html + "</div>";
  }

  function sectionConnected(map, tpl) {
    return (
      "<h2 class='section-title'>Связная речь</h2><div class='fields'>" +
      field(tpl.connected, "story", { value: ans(map, "story"), type: "textarea" }) +
      field("Что неправильно нарисовал художник?", "wrong", { value: ans(map, "wrong"), type: "textarea" }) +
      "</div>"
    );
  }

  function scoreSum(block) {
    let total = 0;
    let filled = 0;
    for (let i = 1; i <= 7; i += 1) {
      if (block[i] !== "" && block[i] != null) {
        total += Number(block[i]) || 0;
        filled += 1;
      }
    }
    return { total: total, filled: filled };
  }

  function diagnosisHint(block) {
    const sum = scoreSum(block).total;
    if (sum >= 25) return "ОНР 1";
    if (sum >= 19) return "ОНР 2";
    if (sum >= 13) return "ОНР 3";
    if (sum >= 7) return "ОНР 4";
    if (sum >= 4) return "ФФНР";
    if (sum >= 1) return "НПОЗ";
    return "";
  }

  function sectionScores(map) {
    const block = map.scores[scorePeriod];
    let html = "<h2 class='section-title'>Итоги в баллах</h2><div class='tabs'>";
    PERIODS.forEach(function (p) {
      html +=
        '<button class="btn' +
        (scorePeriod === p.id ? " btn-primary" : "") +
        '" data-action="score-period" data-id="' +
        p.id +
        '">' +
        p.title +
        "</button>";
    });
    html += "</div><div class='score-grid'>";
    SCORE_SECTIONS.forEach(function (sec) {
      html += "<div class='score-card'><h3>" + sec.id + ". " + esc(sec.title) + "</h3><div class='score-opts'>";
      for (let i = 0; i <= 4; i += 1) {
        const checked = String(block[sec.id]) === String(i) ? " checked" : "";
        html +=
          "<label><input type='radio' name='score:" +
          sec.id +
          "' value='" +
          i +
          "'" +
          checked +
          "> " +
          i +
          "</label>";
      }
      html += "</div><p class='hint'>";
      if (block[sec.id] !== "" && block[sec.id] != null) html += esc(sec.criteria[Number(block[sec.id])]);
      else html += "Выберите балл — появится формулировка.";
      html += "</p></div>";
    });
    const sum = scoreSum(block);
    const hint = diagnosisHint(block);
    html +=
      "</div><div class='notice'><b>Итого: " +
      sum.total +
      "</b> из 28. Ориентир по таблице Крупенчук: " +
      (hint || "заполните баллы") +
      ". Заключение ставит логопед.</div>" +
      "<div class='fields'>" +
      field("Заключение за этот период", "periodConclusion", {
        scope: "scoreField",
        value: block.conclusion,
        type: "textarea",
      }) +
      "</div><h3>Ориентиры</h3><div class='table-wrap'><table class='data'><tbody>";
    DIAGNOSIS_TABLE.forEach(function (row) {
      html += "<tr><td>" + esc(row[0]) + "</td><td><b>" + esc(row[1]) + "</b></td></tr>";
    });
    html +=
      "</tbody></table></div><h3>Сводная таблица</h3><div class='table-wrap'><table class='data'><thead><tr><th>Период</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>Итого</th><th>Заключение</th></tr></thead><tbody>";
    PERIODS.forEach(function (p) {
      const b = map.scores[p.id];
      html += "<tr><td>" + p.title + "</td>";
      for (let i = 1; i <= 7; i += 1) html += "<td>" + esc(b[i]) + "</td>";
      html += "<td>" + scoreSum(b).total + "</td><td>" + esc(b.conclusion) + "</td></tr>";
    });
    html +=
      "</tbody></table></div><h3>Логопедическое заключение</h3><p class='hint'>Звукопроизношение (полиморфный/мономорфный дефект; сигматизм, ламбдацизм, ротацизм; смешение или замена). Слоговая структура. Фонематические представления. Лексика. Грамматика. Связная речь.</p><div class='fields'>" +
      field("Первый год", "year1", { scope: "conclusion", value: map.conclusions.year1, type: "textarea" }) +
      field("Второй год", "year2", { scope: "conclusion", value: map.conclusions.year2, type: "textarea" }) +
      field("Третий год", "year3", { scope: "conclusion", value: map.conclusions.year3, type: "textarea" }) +
      field("Дата", "signDate", { scope: "mapField", type: "date", value: map.signDate }) +
      field("Заведующая", "head", { scope: "mapField", value: map.head }) +
      field("Логопед", "logoped", { scope: "mapField", value: map.logoped }) +
      "</div>";
    return html;
  }

  function sectionDiary(map) {
    return (
      "<h2 class='section-title'>Дневник логопеда</h2>" +
      "<p class='hint'>1. Звукопроизношение: постановка, автоматизация, дифференциация, трудности, ЧБР. 2. Слоговая структура. 3. Фонематические процессы. 4. Лексика. 5. Грамматика. 6. Связная речь.</p>" +
      "<div class='fields'>" +
      field("Записи", "diary", { scope: "mapField", value: map.diary, type: "textarea" }) +
      field("Пропущено дней", "missedDays", { scope: "mapField", value: map.missedDays }) +
      "</div><label class='field'><span class='field-label'><input type='checkbox' name='incomplete' data-scope='mapField'" +
      (map.incomplete ? " checked" : "") +
      "> Не прошёл полный курс обучения</span></label>"
    );
  }

  function renderEditor(child, map) {
    const tpl = AGES[map.age];
    const nav = SECTIONS.map(function (item) {
      return (
        '<button class="nav-item' +
        (section === item.id ? " active" : "") +
        '" data-action="section" data-id="' +
        item.id +
        '">' +
        item.title +
        "</button>"
      );
    }).join("");

    app.innerHTML =
      topbar(
        '<button class="btn" data-action="open-child" data-id="' +
          child.id +
          '">К ребёнку</button>' +
          '<button class="btn btn-clay" data-action="print">Печать</button>'
      ) +
      '<div class="editor"><aside class="side">' +
      nav +
      '</aside><section class="editor-main"><div class="editor-head"><div><h2>' +
      esc(child.fio || "Ребёнок") +
      "</h2><p class='muted'>" +
      esc(tpl.title) +
      " · " +
      esc(ageText(child.birthDate, map.date) || "") +
      '</p></div><div class="' + saveStateClass() + '" id="save-state">' + saveLabel() + '</div></div><div class="panel" id="section-panel">' +
      sectionHtml(child, map) +
      "</div></section></div>";
    printRoot.innerHTML = "";
  }

  function u(text) {
    const value = text || "";
    return '<span class="u">' + esc(value) + (value ? "" : "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") + "</span>";
  }

  function line(label, value) {
    return '<p class="print-line">' + esc(label) + " " + u(value) + "</p>";
  }

  function printTable(headers, rows) {
    let html = '<table class="print"><thead><tr>';
    headers.forEach(function (h) {
      html += "<th>" + esc(h) + "</th>";
    });
    html += "</tr></thead><tbody>";
    rows.forEach(function (row) {
      html += "<tr>";
      row.forEach(function (cell) {
        html += "<td>" + (cell || "") + "</td>";
      });
      html += "</tr>";
    });
    return html + "</tbody></table>";
  }

  function printHtml(child, map) {
    const tpl = AGES[map.age];
    const a = child.anamnesis;
    let html =
      '<article class="print-doc"><h1>Речевая карта</h1><p class="sub">' +
      esc(tpl.title) +
      '</p><p class="src">по пособию: Крупенчук О. И. Речевая карта для обследования ребёнка дошкольного возраста. — СПб.: Литера, 2018</p>' +
      line("Фамилия, имя, отчество ребёнка", child.fio) +
      '<div class="pair">' +
      line("Дата рождения", fmtDate(child.birthDate)) +
      line("Возраст", ageText(child.birthDate, map.date)) +
      line("Дата обследования", fmtDate(map.date)) +
      line("Группа", child.group) +
      "</div>" +
      line("Домашний адрес", child.address) +
      '<div class="pair">' +
      line("Домашний телефон", child.phone) +
      line("Мобильный (родителя)", child.mobile) +
      "</div>" +
      line("Заключение РМПК", child.rmpk) +
      '<div class="pair">' +
      line("Протокол №", child.protocolNo) +
      line("от", fmtDate(child.protocolDate)) +
      "</div>" +
      line("Поступил / из д/с", child.admittedFrom) +
      "<h2>Сведения о родителях</h2>" +
      line("Мать", [child.mother.name, child.mother.year, child.mother.nation, child.mother.specialty, child.mother.work].filter(Boolean).join(", ")) +
      line("Отец", [child.father.name, child.father.year, child.father.nation, child.father.specialty, child.father.work].filter(Boolean).join(", ")) +
      line("Речь родителей и родственников", child.parentsSpeech) +
      line("Двуязычие в семье", child.bilingual) +
      "<h2>Общий анамнез</h2>" +
      '<div class="pair">' +
      line("От беременности", a.pregnancyNo) +
      line("Роды", a.birthNo) +
      "</div>" +
      line("Как протекала беременность", a.pregnancy) +
      line("Роды в недель / характер", (a.weeks || "") + (a.birthType ? ", " + a.birthType : "")) +
      line("Стимуляция", a.stim) +
      '<div class="pair">' +
      line("Крик", a.cry) +
      line("Асфиксия", a.asphyxia) +
      line("Rh", a.rh) +
      line("Вес / рост", a.weight) +
      "</div>" +
      line("Родовые травмы", a.trauma) +
      line("Когда принесли кормить / сосал", (a.feedWhen || "") + (a.suck ? ", " + a.suck : "")) +
      line("Грудное вскармливание", (a.breastFrom || "") + (a.breastTo ? " — " + a.breastTo : "")) +
      '<div class="pair">' +
      line("Голову держит", a.head) +
      line("Ползает", a.crawl) +
      line("Сидит сам", a.sit) +
      line("Пошёл сам", a.walk) +
      "</div>" +
      line("Появился 1-й зуб", a.tooth) +
      line("До 1 года", a.ill1) +
      line("После года", a.ill2) +
      line("Инфекционные", a.infect) +
      line("Травмы головы / судороги", (a.headTrauma || "") + (a.seizures ? "; " + a.seizures : "")) +
      line("Диспансерный учёт", a.disp) +
      "<h2>Речевой анамнез</h2>" +
      '<div class="pair">' +
      line("Первые слова к", a.firstWords) +
      line("Фразы к", a.phrasesAge) +
      "</div>" +
      line("Прерывалось ли речевое развитие", a.interrupt) +
      line("Отношение к своей речи", a.attitude) +
      line("Занимались ли с логопедом", a.logopedBefore) +
      "<h2>Состояние речевого аппарата, голосовой функции и просодики</h2>" +
      line("Губы", ans(map, "lips")) +
      line("Зубы", ans(map, "teeth")) +
      line("Клыки", ans(map, "fangs")) +
      line("Прикус", ans(map, "bite")) +
      line("Сагиттальная щель", ans(map, "gap")) +
      line("Твёрдое нёбо", ans(map, "palate")) +
      line("Нёбный шов / мягкое нёбо", (ans(map, "suture") || "") + (ans(map, "soft") ? "; " + ans(map, "soft") : "")) +
      line("Язык", ans(map, "tongue")) +
      line("Подъязычная связка", ans(map, "frenulum")) +
      line("Крепление связки", (ans(map, "frenUp") || "") + (ans(map, "frenDown") ? " / " + ans(map, "frenDown") : "")) +
      line("Голос", ans(map, "voice")) +
      line("Просодика", ["Темп " + ans(map, "tempo"), "Ритм " + ans(map, "rhythm"), "Паузация " + ans(map, "pause"), "Интонация " + ans(map, "intonation")].join("; ")) +
      "<h2>Мимическая и артикуляционная мускулатура</h2>";

    const motorRowsData = [];
    for (let i = 0; i < MOTOR_LEFT.length; i += 1) {
      motorRowsData.push([
        MOTOR_LEFT[i],
        esc(ans(map, "mot:" + MOTOR_LEFT[i])),
        MOTOR_RIGHT[i],
        esc(ans(map, "mot:" + MOTOR_RIGHT[i])),
      ]);
    }
    html += printTable(["Движение", "Результат", "Движение", "Результат"], motorRowsData);

    html += "<h2>Звукопроизношение</h2><p>N — норма; в остальных случаях записывается речь ребёнка.</p>";
    html += printTable(
      ["Звук"].concat(VOWELS),
      [["Произношение"].concat(VOWELS.map(function (v) { return esc(ans(map, "vow:" + v)); }))]
    );

    const left = CONSONANTS.slice(0, 18);
    const right = CONSONANTS.slice(18);
    const soundRows = [];
    for (let i = 0; i < left.length; i += 1) {
      const aC = left[i];
      const bC = right[i];
      soundRows.push([
        aC.sound,
        esc(ans(map, "snd:" + aC.sound + ":start")),
        esc(ans(map, "snd:" + aC.sound + ":mid")),
        aC.end ? esc(ans(map, "snd:" + aC.sound + ":end")) : "—",
        esc(ans(map, "snd:" + aC.sound + ":syl")),
        bC.sound,
        esc(ans(map, "snd:" + bC.sound + ":start")),
        esc(ans(map, "snd:" + bC.sound + ":mid")),
        bC.end ? esc(ans(map, "snd:" + bC.sound + ":end")) : "—",
        esc(ans(map, "snd:" + bC.sound + ":syl")),
      ]);
    }
    html += printTable(["Звук", "нач.", "сер.", "кон.", "слог", "Звук", "нач.", "сер.", "кон.", "слог"], soundRows);

    html += "<h2>Слоговая структура</h2>";
    const sylRows = [];
    for (let i = 0; i < tpl.syllableWords.length; i += 2) {
      const w1 = tpl.syllableWords[i];
      const w2 = tpl.syllableWords[i + 1];
      sylRows.push([
        w1,
        esc(ans(map, "syl:" + w1)),
        w2 || "",
        w2 ? esc(ans(map, "syl:" + w2)) : "",
      ]);
    }
    html += printTable(["Слово", "Воспроизведение", "Слово", "Воспроизведение"], sylRows);
    html += "<h3>Фразы</h3>";
    tpl.phrases.forEach(function (p, i) {
      html += line(p, ans(map, "phr:" + i));
    });

    html += "<h2>Фонематические процессы</h2>";
    tpl.phonemTasks.forEach(function (task, ti) {
      html += "<p><b>" + esc(task.age) + ".</b> " + esc(task.text) + "</p>";
      task.items.forEach(function (item, ii) {
        html += line(item, ans(map, "ph:" + ti + ":" + ii));
      });
    });
    const pairRows = [];
    for (let i = 0; i < WORD_PAIRS.length; i += 2) {
      pairRows.push([
        WORD_PAIRS[i],
        esc(ans(map, "pair:" + WORD_PAIRS[i])),
        WORD_PAIRS[i + 1],
        esc(ans(map, "pair:" + WORD_PAIRS[i + 1])),
      ]);
    }
    html += printTable(["Пара слов", "Результат", "Пара слов", "Результат"], pairRows);
    const trackRows = [];
    for (let i = 0; i < SOUND_TRACKS.length; i += 2) {
      trackRows.push([
        SOUND_TRACKS[i],
        esc(ans(map, "track:" + SOUND_TRACKS[i])),
        SOUND_TRACKS[i + 1],
        esc(ans(map, "track:" + SOUND_TRACKS[i + 1])),
      ]);
    }
    html += printTable(["Ряд", "Результат", "Ряд", "Результат"], trackRows);
    if (tpl.phonemIdea) html += line(tpl.phonemIdea, ans(map, "idea"));

    html += "<h2>Грамматический строй</h2><p>А. Ед. число → мн. число. Образец: " + esc(tpl.plural.sample[0]) + " → " + esc(tpl.plural.sample[1]) + "</p>";
    tpl.plural.words.forEach(function (w) {
      html += line(w, ans(map, "plur:" + w));
    });
    html += "<p>Б. Согласование с числительными</p>";
    html += printTable(
      ["1", "2", "5"],
      tpl.numerals.map(function (w) {
        return [w, esc(ans(map, "num:" + w + ":2")), esc(ans(map, "num:" + w + ":5"))];
      })
    );
    html += "<p>В. Согласование падежных окончаний</p>";
    html += printTable(
      ["Падеж"].concat(CASE_WORDS),
      CASES.map(function (c) {
        return [c.label].concat(
          CASE_WORDS.map(function (w) {
            return esc(ans(map, "case:" + w + ":" + c.id));
          })
        );
      })
    );
    html += "<p>Словообразование. Образец: " + esc(tpl.diminutive.sample[0]) + " → " + esc(tpl.diminutive.sample[1]) + "</p>";
    tpl.diminutive.words.forEach(function (w) {
      html += line(w, ans(map, "dim:" + w));
    });
    html += line("Предлоги (" + tpl.prepositions + ")", ans(map, "prep"));
    tpl.extraGrammar.forEach(function (block) {
      html += "<p>" + esc(block.title) + "</p>";
      if (block.sample) {
        html += "<p>Образец: " + esc(block.sample[0]) + " → " + esc(block.sample[1]) + "</p>";
        block.words.forEach(function (w) {
          html += line(w, ans(map, (block.type === "relative" ? "rel:" : "pos:") + w));
        });
      }
      if (block.prefixes) {
        html += "<p>" + esc(block.hint) + "</p>";
        block.prefixes.forEach(function (p) {
          html += line(p + "-шёл", ans(map, "pref:" + p));
        });
      }
    });

    html += "<h2>Лексический запас</h2>";
    tpl.classify.forEach(function (item) {
      html += line(item.prompt, ans(map, "cls:" + item.id));
    });
    tpl.babies.forEach(function (item) {
      html += line("У " + item, ans(map, "baby:" + item));
    });
    tpl.antonyms.forEach(function (item) {
      html += line(item, ans(map, "ant:" + item));
    });
    tpl.verbs.forEach(function (item) {
      html += line(item, ans(map, "verb:" + item));
    });

    html += "<h2>Обследование понимания речи</h2>";
    COMPREHENSION.forEach(function (item, i) {
      html += line(item, ans(map, "comp:" + i));
    });
    html += "<h2>Связная речь</h2>" + line(tpl.connected, ans(map, "story")) + line("Что неправильно нарисовал художник?", ans(map, "wrong"));

    html += "<h2>Итоги результатов обследования в баллах</h2>";
    html += printTable(
      ["Период", "1", "2", "3", "4", "5", "6", "7", "Итого", "Заключение"],
      PERIODS.map(function (p) {
        const b = map.scores[p.id];
        return [p.title, b[1], b[2], b[3], b[4], b[5], b[6], b[7], String(scoreSum(b).total), esc(b.conclusion)];
      })
    );
    html += "<p>Ориентиры: 1—3 НПОЗ; 4—6 ФФНР; 7—12 ОНР 4; 13—18 ОНР 3; 19—24 ОНР 2; 25—28 ОНР 1.</p>";
    html += "<h2>Логопедическое заключение</h2>";
    html += line("Первый год", map.conclusions.year1);
    html += line("Второй год", map.conclusions.year2);
    html += line("Третий год", map.conclusions.year3);
    html += '<div class="pair">' + line("Дата", fmtDate(map.signDate)) + line("Заведующая", map.head) + "</div>";
    html += line("Логопед", map.logoped);
    html += "<h2>Дневник логопеда</h2>" + line("", map.diary);
    html += line("Не прошёл полный курс обучения", map.incomplete ? "да" : "");
    html += line("Пропущено дней", map.missedDays);
    html += "</article>";
    return html;
  }

  function current() {
    const r = route();
    const child = r.childId ? findChild(r.childId) : null;
    const map = child && r.mapId ? findMap(child, r.mapId) : null;
    return { r: r, child: child, map: map };
  }

  function render() {
    const ctx = current();
    if (ctx.r.view === "map") {
      if (!ctx.child || !ctx.map) {
        location.hash = "#/";
        return;
      }
      renderEditor(ctx.child, ctx.map);
      return;
    }
    if (ctx.r.view === "child") {
      if (!ctx.child) {
        location.hash = "#/";
        return;
      }
      renderChild(ctx.child);
      return;
    }
    renderHome();
  }

  function setValue(el) {
    const name = el.name;
    const value = el.type === "checkbox" ? el.checked : el.value;
    const ctx = current();
    const child = ctx.child;
    const map = ctx.map;
    if (name === "query") {
      query = el.value;
      renderHome();
      const input = app.querySelector('input[name="query"]');
      if (input) {
        input.focus();
        input.setSelectionRange(el.value.length, el.value.length);
      }
      return;
    }
    if (!child) return;
    if (name.indexOf("mother.") === 0 || name.indexOf("father.") === 0) {
      const parts = name.split(".");
      child[parts[0]][parts[1]] = el.value;
      scheduleSave();
      return;
    }
    const scope = el.getAttribute("data-scope");
    if (scope === "readonly") return;
    if (scope === "child") {
      if (name === "birthDate" && el.value) {
        if (el.value < "1990-01-01" || el.value > today()) {
          el.value = child.birthDate || "";
          return;
        }
      }
      child[name] = el.value;
      scheduleSave();
      if (ctx.r.view === "child" && (name === "fio" || name === "birthDate")) {
        const caret = el.selectionStart;
        renderChild(child);
        const next = app.querySelector('[name="' + name + '"]');
        if (next && next.focus) {
          next.focus();
          if (typeof caret === "number" && next.setSelectionRange) next.setSelectionRange(caret, caret);
        }
      }
      return;
    }
    if (scope === "anam") {
      child.anamnesis[name] = el.value;
      scheduleSave();
      return;
    }
    if (!map) return;
    if (scope === "mapField") {
      if (name === "incomplete") map.incomplete = el.checked;
      else map[name] = el.value;
      scheduleSave();
      return;
    }
    if (scope === "conclusion") {
      map.conclusions[name] = el.value;
      scheduleSave();
      return;
    }
    if (scope === "scoreField") {
      map.scores[scorePeriod].conclusion = el.value;
      scheduleSave();
      return;
    }
    if (name.indexOf("score:") === 0) {
      map.scores[scorePeriod][name.split(":")[1]] = el.value;
      scheduleSave();
      const panel = document.getElementById("section-panel");
      if (panel) panel.innerHTML = sectionHtml(child, map);
      return;
    }
    map.answers[name] = el.value;
    scheduleSave();
  }

  function fillSound(map, sound) {
    ["start", "mid", "end", "syl"].forEach(function (pos) {
      const key = "snd:" + sound + ":" + pos;
      const cons = CONSONANTS.find(function (item) {
        return item.sound === sound;
      });
      if (pos === "end" && cons && !cons.end) return;
      if (!map.answers[key]) map.answers[key] = "N";
    });
  }

  app.addEventListener("input", function (e) {
    const el = e.target;
    if (!el.name) return;
    setValue(el);
  });

  app.addEventListener("change", function (e) {
    const el = e.target;
    if (!el.name || el.id === "import-file") return;
    if (el.type === "checkbox" || el.type === "radio" || el.type === "date") {
      setValue(el);
    }
  });

  app.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip");
    if (chip && chip.dataset.chip) {
      const fieldBox = chip.closest(".field");
      const input = fieldBox && fieldBox.querySelector("input, textarea");
      if (input) {
        input.value = chip.dataset.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }

    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const ctx = current();

    if (action === "home") location.hash = "#/";
    if (action === "open-child") location.hash = "#/c/" + btn.dataset.id;
    if (action === "open-map") location.hash = "#/c/" + ctx.child.id + "/m/" + btn.dataset.id;
    if (action === "section") {
      section = btn.dataset.id;
      sessionStorage.setItem("karta-section", section);
      if (ctx.child && ctx.map) renderEditor(ctx.child, ctx.map);
    }
    if (action === "score-period") {
      scorePeriod = btn.dataset.id;
      if (ctx.child && ctx.map) renderEditor(ctx.child, ctx.map);
    }
    if (action === "add-child") {
      const child = emptyChild();
      db.children.push(child);
      persist();
      location.hash = "#/c/" + child.id;
      render();
    }
    if (action === "add-map") {
      const map = emptyMap(btn.dataset.age);
      ctx.child.maps.push(map);
      persist();
      location.hash = "#/c/" + ctx.child.id + "/m/" + map.id;
      render();
    }
    if (action === "delete-child") {
      const id = btn.dataset.id || (ctx.child && ctx.child.id);
      const child = findChild(id);
      const title = child && child.fio ? "«" + child.fio + "»" : "этого ребёнка";
      if (!id || !confirm("Удалить карточку " + title + " и все её речевые карты?")) return;
      db.children = db.children.filter(function (item) {
        return item.id !== id;
      });
      persist();
      location.hash = "#/";
      render();
    }
    if (action === "delete-map" && confirm("Удалить эту речевую карту?")) {
      ctx.child.maps = ctx.child.maps.filter(function (item) {
        return item.id !== btn.dataset.id;
      });
      persist();
      render();
    }
    if (action === "print") {
      if (ctx.child && ctx.map) printRoot.innerHTML = printHtml(ctx.child, ctx.map);
      window.print();
    }
    if (action === "export") {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "rechevye-karty-" + today() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
      markBackup();
      const note = app.querySelector(".backup-note");
      if (note) note.remove();
    }
    if (action === "snooze-backup") {
      writeNum(SNOOZE_KEY, Date.now() + 3 * DAY);
      const note = app.querySelector(".backup-note");
      if (note) note.remove();
    }
    if (action === "import") document.getElementById("import-file").click();
    if (action === "fill-vowels" && ctx.map) {
      VOWELS.forEach(function (v) {
        if (!ctx.map.answers["vow:" + v]) ctx.map.answers["vow:" + v] = "N";
      });
      persist();
      renderEditor(ctx.child, ctx.map);
    }
    if (action === "fill-cons" && ctx.map) {
      CONSONANTS.forEach(function (item) {
        fillSound(ctx.map, item.sound);
      });
      persist();
      renderEditor(ctx.child, ctx.map);
    }
    if (action === "fill-sound" && ctx.map) {
      fillSound(ctx.map, btn.dataset.sound);
      persist();
      renderEditor(ctx.child, ctx.map);
    }
    if (action === "fill-motor" && ctx.map) {
      MOTOR_LEFT.concat(MOTOR_RIGHT).forEach(function (name) {
        if (!ctx.map.answers["mot:" + name]) ctx.map.answers["mot:" + name] = btn.dataset.value;
      });
      persist();
      renderEditor(ctx.child, ctx.map);
    }
  });

  app.addEventListener("change", function (e) {
    if (e.target.id !== "import-file") return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        if (!data.children) throw new Error("no children");
        if (!confirm("Заменить текущую картотеку загруженной копией?")) return;
        db = data;
        persist();
        markBackup();
        location.hash = "#/";
        render();
      } catch (err) {
        alert("Не получилось прочитать файл копии.");
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("beforeprint", function () {
    const ctx = current();
    if (ctx.child && ctx.map) printRoot.innerHTML = printHtml(ctx.child, ctx.map);
  });

  render();
})();
