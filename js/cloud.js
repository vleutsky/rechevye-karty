// Облачная синхронизация картотеки: личный кабинет (почта + пароль),
// автосохранение на сервер и загрузка при открытии сайта.
var Cloud = (function () {
  var API = "https://logoklassiki.ru/api/";
  var KEY = "logoped-karty-cloud";
  var LAST_KEY = "logoped-karty-last-email";
  var state = { email: "", token: "", status: "off", lastSync: 0, error: "", panel: false, busy: false };
  var pushTimer = null;
  var dirty = false;
  var hooks = null; // { getDb, setDb, render }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && saved.email && saved.token) {
        state.email = saved.email;
        state.token = saved.token;
      }
    } catch (err) {}
  }

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ email: state.email, token: state.token }));
    } catch (err) {}
  }

  function api(body, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeoutMs || 20000);
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .catch(function (err) {
        clearTimeout(t);
        throw err;
      });
  }

  function fmtTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    function p(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function rerender() {
    if (hooks && hooks.render) hooks.render();
  }

  // Обновить только кнопку «Облако» и открытую панель — не трогая поля ввода
  // (полная перерисовка страницы сбрасывала ввод, пока идёт синхронизация).
  function paintChrome() {
    var b = document.querySelector("[data-action='cloud']");
    if (b) {
      var t1 = document.createElement("div");
      t1.innerHTML = button();
      if (t1.firstElementChild) b.replaceWith(t1.firstElementChild);
    }
    var p = document.querySelector(".cloud-panel");
    if (p) {
      var t2 = document.createElement("div");
      t2.innerHTML = notice();
      if (t2.firstElementChild) p.replaceWith(t2.firstElementChild);
    }
  }

  // Сообщение на экране входа без перерисовки формы
  function setGateStatus(text, isError) {
    var el = document.querySelector(".gate-status");
    if (!el) return;
    el.className = "gate-status " + (isError ? "cloud-error" : "muted");
    el.textContent = text || "";
  }

  // ---- Кнопка в шапке ----
  function button() {
    if (!state.email) {
      return '<button class="btn" data-action="cloud">Облако</button>';
    }
    var cls = state.status === "err" ? " btn-file is-warn" : " btn-file is-on";
    var mark = state.status === "sync" ? "…" : state.status === "err" ? "!" : "";
    return (
      '<button class="btn' +
      cls +
      '" data-action="cloud" title="Кабинет: ' +
      esc(state.email) +
      ". Синхронизировано: " +
      (state.lastSync ? fmtTime(state.lastSync) : "ещё нет") +
      '">Облако' +
      (mark ? ": " + mark : "") +
      "</button>"
    );
  }

  function field(label, name, type, value) {
    return (
      '<label class="field"><span class="field-label">' +
      esc(label) +
      '</span><input class="control" type="' +
      type +
      '" name="' +
      name +
      '" data-scope="cloud" value="' +
      esc(value || "") +
      '"></label>'
    );
  }

  // ---- Панель под шапкой ----
  function notice() {
    if (!state.panel) return "";
    if (!state.email) {
      return (
        '<div class="backup-note file-note cloud-panel" role="status"><div class="cloud-form"><b>Кабинет</b>' +
        "<span class='muted'>Почта и пароль — одна картотека на всех устройствах.</span>" +
        '<div class="fields two">' +
        field("Почта", "cloud-email", "email") +
        field("Пароль (не короче 6 знаков)", "cloud-pass", "password") +
        "</div>" +
        '<div class="row">' +
        '<button class="btn btn-primary" data-action="cloud-login">Войти</button>' +
        '<button class="btn" data-action="cloud-register">Создать кабинет</button>' +
        '<button class="btn btn-ghost" data-action="cloud-close">Отмена</button>' +
        "</div>" +
        (state.error ? "<div class='cloud-error'>" + esc(state.error) + "</div>" : "") +
        "</div></div>"
      );
    }
    return (
      '<div class="backup-note file-note cloud-panel" role="status"><div class="cloud-form"><b>Кабинет: ' +
      esc(state.email) +
      "</b>" +
      "<span class='muted'>Синхронизировано: " +
      (state.lastSync ? fmtTime(state.lastSync) : "ещё нет") +
      (state.error ? " · ошибка: " + esc(state.error) : "") +
      "</span>" +
      '<div class="row">' +
      '<button class="btn btn-primary" data-action="cloud-sync">Синхронизировать сейчас</button>' +
      '<button class="btn btn-ghost" data-action="cloud-logout">Выйти</button>' +
      "</div></div></div>"
    );
  }

  // ---- Экран авторизации (весь сайт закрыт до входа) ----
  function gate() {
    return (
      '<div class="gate-wrap"><div class="gate">' +
      '<div class="brand-mark">РК</div>' +
      "<div><h1>Речевые карты</h1>" +
      "<p class='muted'>Крупенчук · ВПФ · мониторинг речи</p></div>" +
      '<div class="gate-fields">' +
      field("Почта", "cloud-email", "email") +
      field("Пароль (не короче 6 знаков)", "cloud-pass", "password") +
      "</div>" +
      '<div class="row">' +
      '<button class="btn btn-primary" data-action="cloud-login">Войти</button>' +
      '<button class="btn" data-action="cloud-register">Создать кабинет</button>' +
      "</div>" +
      "<div class='gate-status " +
      (state.error ? "cloud-error" : "muted") +
      "' aria-live='polite'>" +
      esc(state.error || "") +
      "</div>" +
      "<p class='hint'>Работа с картотекой — после входа. Данные синхронизируются между вашими устройствами.</p>" +
      "</div></div>"
    );
  }

  // ---- Синхронизация ----
  function applyCloudDb(cloudDb) {
    if (!hooks || !hooks.setDb) return;
    hooks.setDb(cloudDb);
  }

  function pull() {
    state.status = "sync";
    paintChrome();
    return api({ action: "get", email: state.email, token: state.token })
      .then(function (res) {
        if (!res.ok) {
          if (res.error === "badtoken") return logoutLocal("Сессия закончилась — войдите снова.");
          throw new Error(res.error || "ошибка");
        }
        var cloudDb = res.db;
        var local = hooks.getDb();
        var cloudAt = cloudDb && cloudDb.savedAt ? Number(cloudDb.savedAt) || 0 : 0;
        var localAt = local && local.savedAt ? Number(local.savedAt) || 0 : 0;
        if (cloudAt > localAt) {
          applyCloudDb(cloudDb);
        } else if (localAt > 0) {
          return push();
        }
        state.status = "ok";
        state.lastSync = Date.now();
        state.error = "";
        paintChrome();
      })
      .catch(function (err) {
        state.status = "err";
        state.error = "нет связи с сервером";
        paintChrome();
      });
  }

  function push() {
    if (!state.token || !hooks) return Promise.resolve();
    var db = hooks.getDb();
    if (!db || !db.savedAt) return Promise.resolve();
    state.status = "sync";
    return api({ action: "save", email: state.email, token: state.token, db: db })
      .then(function (res) {
        if (!res.ok) {
          if (res.error === "badtoken") return logoutLocal("Сессия закончилась — войдите снова.");
          throw new Error(res.error || "ошибка");
        }
        dirty = false;
        state.status = "ok";
        state.lastSync = Date.now();
        state.error = "";
        paintChrome();
      })
      .catch(function (err) {
        state.status = "err";
        state.error = "не сохранилось в облако";
        dirty = true;
        paintChrome();
      });
  }

  function schedulePush() {
    if (!state.token) return;
    dirty = true;
    state.status = "sync";
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }

  function flushOnExit() {
    if (!state.token || !dirty) return;
    try {
      var body = JSON.stringify({ action: "save", email: state.email, token: state.token, db: hooks.getDb() });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API, new Blob([body], { type: "application/json" }));
      }
    } catch (err) {}
  }

  function sync() {
    return pull();
  }

  // ---- Действия панели ----
  function readForm() {
    var email = "";
    var pass = "";
    var e = document.querySelector("input[name='cloud-email']");
    var p = document.querySelector("input[name='cloud-pass']");
    if (e) email = e.value.trim();
    if (p) pass = p.value;
    return { email: email, pass: pass };
  }

  function logoutLocal(msg) {
    state.token = "";
    state.email = "";
    state.status = "off";
    state.lastSync = 0;
    state.error = msg || "";
    saveState();
    rerender();
  }

  function handle(action, btn) {
    if (action === "cloud") {
      state.panel = !state.panel;
      state.error = "";
      rerender();
      return;
    }
    if (action === "cloud-close") {
      state.panel = false;
      rerender();
      return;
    }
    if (action === "cloud-login" || action === "cloud-register") {
      var f = readForm();
      if (!f.email || !f.pass) {
        state.error = "Введите почту и пароль.";
        setGateStatus(state.error, true);
        paintChrome();
        return;
      }
      state.busy = true;
      state.error = "";
      setGateStatus("Проверяем…");
      api({
        action: action === "cloud-login" ? "login" : "register",
        email: f.email,
        password: f.pass,
      })
        .then(function (res) {
          state.busy = false;
          if (!res.ok) {
            state.error =
              res.error === "bademail"
                ? "Похоже, в адресе почты опечатка."
                : res.error === "shortpass"
                  ? "Пароль короче 6 знаков."
                  : res.error === "exists"
                    ? "Кабинет с такой почтой уже есть — нажмите «Войти»."
                    : res.error === "badlogin"
                      ? "Неверная почта или пароль."
                      : "Не получилось, попробуйте ещё раз.";
            setGateStatus(state.error, true);
            return;
          }
          state.email = res.email;
          state.token = res.token;
          state.panel = false;
          state.error = "";
          saveState();
          // другой кабинет на этом устройстве: локальная база не подмешивается
          var prevEmail = "";
          try {
            prevEmail = localStorage.getItem(LAST_KEY) || "";
          } catch (err) {}
          try {
            localStorage.setItem(LAST_KEY, res.email);
          } catch (err) {}
          if (prevEmail && prevEmail !== res.email && hooks && hooks.setDb) {
            hooks.setDb({ children: [], savedAt: 0 });
          }
          return sync();
        })
        .catch(function () {
          state.busy = false;
          state.error = "Нет связи с сервером.";
          setGateStatus(state.error, true);
        });
      return;
    }
    if (action === "cloud-logout") {
      var token = state.token;
      var email = state.email;
      api({ action: "logout", email: email, token: token });
      logoutLocal("");
      return;
    }
    if (action === "cloud-sync") {
      sync();
      return;
    }
  }

  function init(opts) {
    hooks = opts;
    loadState();
    window.addEventListener("beforeunload", flushOnExit);
    if (state.token) {
      // токен сохранён: показать приложение сразу, не дожидаясь ответа сервера
      if (document.querySelector(".gate")) rerender();
      pull();
    }
  }

  return {
    init: init,
    button: button,
    notice: notice,
    gate: gate,
    schedulePush: schedulePush,
    handle: handle,
    authorized: function () {
      return !!state.token;
    },
    loggedIn: function () {
      return !!state.token;
    },
  };
})();
