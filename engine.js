(function () {
  "use strict";

  // 같은 페이지에 두 번 주입되면(북마클릿 재클릭) 이전 인스턴스를 정리하고 새로 시작한다.
  if (window.__SLW__ && typeof window.__SLW__.teardown === "function") {
    window.__SLW__.teardown();
  }

  // 진행 상태는 localStorage에 저장한다. 북마클릿은 확장프로그램이 아니라 페이지 컨텍스트에서
  // 돌아가므로 chrome.storage 같은 확장 전용 API를 쓸 수 없다. 새로고침/페이지 이동 후에도
  // 같은 오리진이면 localStorage가 유지되므로 흐름 중단 없이 이어서 진행할 수 있다.
  var STORAGE_KEY = "shoplive_walkthrough_progress";

  // 실제 어드민은 React/Vue 기반이라 대상 요소가 즉시 존재하지 않을 수 있다. querySelector가
  // 처음에 실패해도 곧 렌더링될 수 있으므로 MutationObserver로 기다린다. 무한 대기를 막기 위해
  // 타임아웃을 두고, 초과하면 "요소를 찾을 수 없습니다" 안내로 흐름을 막지 않는다.
  var ELEMENT_WAIT_TIMEOUT_MS = 10000;

  // jsDelivr URL을 조립할 때 사용할 기본값. index.html/북마클릿이 넘겨주는 값이 우선한다.
  var DEFAULT_FLOW_BASE =
    "https://cdn.jsdelivr.net/gh/jameslee-lang/admin-test@main/flows/";

  var cfg = window.__SLW_CONFIG__ || {};
  var MODE = cfg.mode === "picker" ? "picker" : "walkthrough";
  var FLOW_ID = cfg.flow || "broadcast-register";
  var FLOW_BASE = cfg.flowBase || DEFAULT_FLOW_BASE;

  var state = {
    els: [],
    observers: [],
    listeners: [],
    timers: []
  };

  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    state.listeners.push([target, type, handler, opts]);
  }

  function teardown() {
    state.listeners.forEach(function (l) {
      l[0].removeEventListener(l[1], l[2], l[3]);
    });
    state.observers.forEach(function (o) {
      o.disconnect();
    });
    state.timers.forEach(function (t) {
      clearTimeout(t);
    });
    state.els.forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    state = { els: [], observers: [], listeners: [], timers: [] };
    window.__SLW__ = null;
  }

  window.__SLW__ = { teardown: teardown, mode: MODE };

  // ---- 공용 스타일 주입 ----------------------------------------------------
  function injectStyle() {
    var style = document.createElement("style");
    style.textContent = [
      ".slw-overlay{position:fixed;inset:0;z-index:2147483000;pointer-events:none;}",
      ".slw-dim{position:fixed;background:rgba(0,0,0,0.55);z-index:2147483000;pointer-events:none;transition:all .15s ease;}",
      ".slw-ring{position:fixed;z-index:2147483001;border:3px solid #ff4d6d;border-radius:6px;box-shadow:0 0 0 4px rgba(255,77,109,.35);pointer-events:none;transition:all .15s ease;}",
      ".slw-tip{position:fixed;z-index:2147483002;max-width:320px;background:#fff;color:#1a1a1a;border-radius:10px;padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.3);font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:1.5;}",
      ".slw-tip h3{margin:0 0 6px;font-size:15px;font-weight:700;}",
      ".slw-tip p{margin:0 0 12px;color:#444;}",
      ".slw-tip .slw-step{font-size:12px;color:#888;margin-bottom:8px;}",
      ".slw-tip .slw-hint{font-size:12px;color:#ff4d6d;margin-top:4px;}",
      ".slw-btn{border:0;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;}",
      ".slw-btn-primary{background:#ff4d6d;color:#fff;}",
      ".slw-btn-ghost{background:#f0f0f0;color:#555;}",
      ".slw-exit{position:fixed;top:20px;right:20px;z-index:2147483004;background:#1a1a1a;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:auto;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;}",
      ".slw-nav{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;}",
      ".slw-btn:disabled{opacity:.35;cursor:not-allowed;}",
      ".slw-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483005;background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);}",
      ".slw-pick-hl{position:fixed;z-index:2147483001;background:rgba(255,77,109,.2);border:2px solid #ff4d6d;pointer-events:none;transition:all .05s ease;}",
      ".slw-panel{position:fixed;bottom:20px;left:20px;z-index:2147483004;width:360px;max-width:90vw;max-height:82vh;overflow-y:auto;background:#fff;color:#1a1a1a;border-radius:10px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.3);font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:13px;pointer-events:auto;}",
      ".slw-panel h3{margin:0 0 10px;font-size:14px;font-weight:700;}",
      ".slw-panel label{display:block;font-size:11px;color:#888;margin:8px 0 3px;}",
      ".slw-panel textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;border:1px solid #ddd;border-radius:6px;padding:8px;resize:vertical;min-height:52px;}",
      ".slw-panel input[type=text]{width:100%;box-sizing:border-box;font-size:12px;border:1px solid #ddd;border-radius:6px;padding:7px 8px;}",
      ".slw-panel select{width:100%;box-sizing:border-box;font-size:12px;border:1px solid #ddd;border-radius:6px;padding:7px 8px;background:#fff;}",
      ".slw-panel .slw-row{display:flex;gap:8px;margin-top:10px;}",
      ".slw-steps-list{margin-top:10px;}",
      ".slw-step-item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;background:#f7f7f8;border-radius:6px;margin-bottom:6px;font-size:12px;}",
      ".slw-step-item button{border:0;background:none;color:#ff4d6d;cursor:pointer;font-size:12px;flex-shrink:0;}",
      ".slw-picked-ctx{white-space:pre-wrap;word-break:break-all;background:#f7f7f8;border-radius:6px;padding:6px 8px;font-size:11px;color:#555;font-family:monospace;}"
    ].join("\n");
    document.head.appendChild(style);
    state.els.push(style);
  }

  // ---- 요소 대기 (SPA 대응) -----------------------------------------------
  function waitForElement(selector, timeoutMs, cb) {
    var existing = document.querySelector(selector);
    if (existing) {
      cb(existing);
      return;
    }
    var done = false;
    var observer = new MutationObserver(function () {
      var found = document.querySelector(selector);
      if (found && !done) {
        done = true;
        observer.disconnect();
        cb(found);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    state.observers.push(observer);
    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        observer.disconnect();
        cb(null);
      }
    }, timeoutMs);
    state.timers.push(timer);
  }

  // ---- 진행 상태 저장/복원 -------------------------------------------------
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveProgress(flowId, stepIndex) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ flowId: flowId, stepIndex: stepIndex }));
    } catch (e) {}
  }

  function clearProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  // ---- 워크스루 모드 -------------------------------------------------------
  function startWalkthrough() {
    injectStyle();

    var url = FLOW_BASE + FLOW_ID + ".json";
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (flow) {
        runFlow(flow);
      })
      .catch(function () {
        toast("플로우를 불러오지 못했습니다: " + url);
      });
  }

  function runFlow(flow) {
    var steps = flow.steps || [];
    var startIndex = 0;

    // 같은 흐름이 이미 진행 중이었다면(새로고침/이동 후 재실행) 그 단계부터 이어간다.
    var progress = loadProgress();
    if (progress && progress.flowId === flow.id && progress.stepIndex < steps.length) {
      startIndex = progress.stepIndex;
    }

    var dim = document.createElement("div");
    dim.className = "slw-dim";
    var ring = document.createElement("div");
    ring.className = "slw-ring";
    var tip = document.createElement("div");
    tip.className = "slw-tip";
    var exit = document.createElement("button");
    exit.className = "slw-exit";
    exit.textContent = "× 종료";
    [dim, ring, tip, exit].forEach(function (el) {
      document.body.appendChild(el);
      state.els.push(el);
    });

    on(exit, "click", function () {
      clearProgress();
      teardown();
    });

    // 고객사마다 실제로 쓰고 싶은 기능이 달라서, 가이드가 요구하는 동작(waitFor)을 안 해도
    // ‹/› 버튼으로 자유롭게 스텝을 오갈 수 있어야 한다. 그러려면 이전 스텝 시도에서 걸어둔
    // waitForElement/bindAdvance 의 리스너·옵저버·타이머를 다음 스텝으로 넘어가기 전에 반드시
    // 걷어내야 한다 (안 그러면 옛 스텝의 클릭 리스너가 남아 엉뚱하게 다시 발동할 수 있다).
    var stepBaseline = {
      listeners: state.listeners.length,
      observers: state.observers.length,
      timers: state.timers.length
    };

    function clearStepListeners() {
      while (state.listeners.length > stepBaseline.listeners) {
        var l = state.listeners.pop();
        l[0].removeEventListener(l[1], l[2], l[3]);
      }
      while (state.observers.length > stepBaseline.observers) {
        state.observers.pop().disconnect();
      }
      while (state.timers.length > stepBaseline.timers) {
        var t = state.timers.pop();
        clearTimeout(t);
        clearInterval(t);
      }
    }

    function showStep(index) {
      clearStepListeners();

      if (index >= steps.length) {
        clearProgress();
        ring.style.display = "none";
        dim.style.display = "none";
        tip.innerHTML =
          "<h3>완료했습니다 🎉</h3><p>" +
          escapeHtml(flow.title || "") +
          ' 흐름을 끝까지 따라오셨습니다.</p><div class="slw-nav"><button class="slw-btn slw-btn-ghost slw-nav-prev">‹ 이전</button><span></span></div>';
        placeTip(tip, null);
        on(tip.querySelector(".slw-nav-prev"), "click", function () {
          showStep(index - 1);
        });
        return;
      }

      saveProgress(flow.id, index);
      var step = steps[index];

      // 정보 전용 단계(selector 없음)는 특정 요소 없이 안내만 보여준다.
      if (!step.selector) {
        ring.style.display = "none";
        dim.style.display = "none";
        renderNav(step, index, steps.length, null);
        // urlChange 는 특정 요소가 아니라 location.href 를 보는 조건이라 selector 없이도 걸 수 있다.
        if (step.waitFor && step.waitFor.type === "urlChange") {
          bindAdvance(step, null, function () {
            showStep(index + 1);
          });
        }
        return;
      }

      renderNav(step, index, steps.length, "waiting");
      waitForElement(step.selector, ELEMENT_WAIT_TIMEOUT_MS, function (target) {
        if (!target) {
          renderNav(step, index, steps.length, "notfound");
          return;
        }
        highlight(target, dim, ring);
        renderNav(step, index, steps.length, target);
        bindAdvance(step, target, function () {
          showStep(index + 1);
        });
      });
    }

    // 가이드 동작(waitFor) 완료 여부와 무관하게 항상 ‹ 이전 / 다음 › 을 눌러 이동할 수 있게 한다 —
    // 고객사마다 원하는 기능이 달라서, 강제로 순서를 따라가게 하면 안 되기 때문.
    function renderNav(step, index, total, statusOrTarget) {
      var html = "";
      html += '<div class="slw-step">' + (index + 1) + " / " + total + "</div>";
      html += "<h3>" + escapeHtml(step.title || "") + "</h3>";
      html += "<p>" + escapeHtml(step.description || "") + "</p>";

      if (statusOrTarget === "waiting") {
        html += '<div class="slw-hint">화면을 준비하는 중…</div>';
      } else if (statusOrTarget === "notfound") {
        html += '<div class="slw-hint">요소를 찾을 수 없습니다. 화면이 맞는지 확인해보세요.</div>';
      } else if (step.waitFor) {
        html += '<div class="slw-hint">' + waitHint(step.waitFor) + "</div>";
      }

      html +=
        '<div class="slw-nav"><button class="slw-btn slw-btn-ghost slw-nav-prev"' +
        (index === 0 ? " disabled" : "") +
        ">‹ 이전</button><button class=\"slw-btn slw-btn-primary slw-nav-next\">다음 ›</button></div>";

      tip.innerHTML = html;
      placeTip(tip, statusOrTarget === "waiting" || statusOrTarget === "notfound" ? null : statusOrTarget);

      var prevBtn = tip.querySelector(".slw-nav-prev");
      if (!prevBtn.disabled) {
        on(prevBtn, "click", function () {
          showStep(index - 1);
        });
      }
      on(tip.querySelector(".slw-nav-next"), "click", function () {
        showStep(index + 1);
      });
    }

    function bindAdvance(step, target, next) {
      var w = step.waitFor;
      if (!w) return;
      // click/input 은 실제 요소가 있어야 리스너를 걸 수 있다 (selector 없는 정보성 단계에서 잘못 설정된 경우 방지).
      if (!target && (w.type === "click" || w.type === "input")) return;
      if (w.type === "click") {
        on(target, "click", function () {
          setTimeout(next, 200);
        });
      } else if (w.type === "input") {
        on(target, "input", function () {
          var ok = w.value == null || target.value === w.value || (target.value || "").length > 0;
          if (ok) next();
        });
      } else if (w.type === "urlChange") {
        var startUrl = location.href;
        var poll = setInterval(function () {
          var changed = w.value ? location.href.indexOf(w.value) !== -1 : location.href !== startUrl;
          if (changed) {
            clearInterval(poll);
            next();
          }
        }, 300);
        state.timers.push(poll);
      }
    }

    showStep(startIndex);
  }

  function waitHint(waitFor) {
    if (waitFor.type === "click") return "위에서 강조된 요소를 직접 클릭하세요.";
    if (waitFor.type === "input") return "강조된 입력란에 값을 입력하세요.";
    if (waitFor.type === "urlChange") return "안내대로 이동하면 자동으로 다음 단계로 넘어갑니다.";
    return "";
  }

  function highlight(target, dim, ring) {
    var r = target.getBoundingClientRect();
    ring.style.display = "block";
    ring.style.top = r.top - 4 + "px";
    ring.style.left = r.left - 4 + "px";
    ring.style.width = r.width + 8 + "px";
    ring.style.height = r.height + 8 + "px";
    dim.style.display = "block";
    dim.style.inset = "0";
  }

  function placeTip(tip, target) {
    if (!target || target === "waiting" || target === "notfound") {
      tip.style.top = "50%";
      tip.style.left = "50%";
      tip.style.transform = "translate(-50%, -50%)";
      return;
    }
    tip.style.transform = "none";
    var r = target.getBoundingClientRect();
    var below = r.bottom + 12;
    var tipH = tip.offsetHeight || 160;
    if (below + tipH > window.innerHeight) {
      tip.style.top = Math.max(12, r.top - tipH - 12) + "px";
    } else {
      tip.style.top = below + "px";
    }
    tip.style.left = Math.min(r.left, window.innerWidth - 340) + "px";
  }

  // ---- 플로우 빌더 모드 ------------------------------------------------------
  // 셀렉터를 직접 다루지 않아도 되도록, 요소를 순서대로 클릭 → 그 자리에서 제목/설명 입력 →
  // 마지막에 완성된 flows/<id>.json 전체를 한 번에 받는 방식으로 만든다.
  function startPicker() {
    injectStyle();

    var hl = document.createElement("div");
    hl.className = "slw-pick-hl";
    hl.style.display = "none";
    var panel = document.createElement("div");
    panel.className = "slw-panel";
    panel.innerHTML =
      "<h3>플로우 빌더</h3>" +
      "<p style='margin:0 0 8px;color:#666;'>실제 화면 요소를 순서대로 클릭해서 스텝을 하나씩 쌓으세요. 다 만들면 아래에서 완성된 JSON을 통째로 받을 수 있습니다.</p>" +
      "<label>플로우 ID (파일명, 영문/숫자/하이픈)</label>" +
      '<input type="text" class="slw-flow-id" placeholder="예: broadcast-register" value="' +
      escapeHtml(FLOW_ID || "") +
      '">' +
      "<label>플로우 제목</label>" +
      '<input type="text" class="slw-flow-title" placeholder="예: 가장 기본적인 방송 등록 흐름">' +
      '<div class="slw-steps-list"></div>' +
      '<div class="slw-row"><button class="slw-btn slw-btn-ghost slw-add-info">+ 정보 전용 스텝 추가</button></div>' +
      '<div class="slw-capture" style="display:none;margin-top:10px;border-top:1px solid #eee;padding-top:10px;">' +
      "<label>선택한 요소</label>" +
      '<div class="slw-picked-ctx"></div>' +
      "<label>제목</label>" +
      '<input type="text" class="slw-step-title" placeholder="예: 방송 제목 입력">' +
      "<label>설명</label>" +
      '<textarea class="slw-step-desc" placeholder="사용자에게 보여줄 안내문"></textarea>' +
      "<label>다음 단계로 언제 자동으로 넘어가나요?</label>" +
      '<select class="slw-step-waitfor"></select>' +
      '<div class="slw-row"><button class="slw-btn slw-btn-primary slw-confirm-step">이 스텝 추가</button><button class="slw-btn slw-btn-ghost slw-cancel-step">취소</button></div>' +
      "</div>" +
      '<div class="slw-row" style="margin-top:14px;"><button class="slw-btn slw-btn-primary slw-finish">완성된 JSON 만들기</button></div>' +
      '<div class="slw-output" style="display:none;margin-top:10px;">' +
      "<label>flows/&lt;id&gt;.json 에 이 내용 전체를 붙여넣으세요</label>" +
      '<textarea class="slw-output-json" readonly style="min-height:140px;"></textarea>' +
      '<div class="slw-row"><button class="slw-btn slw-btn-primary slw-copy-json">전체 복사</button><button class="slw-btn slw-btn-ghost slw-download-json">파일로 다운로드</button></div>' +
      "</div>";
    var exit = document.createElement("button");
    exit.className = "slw-exit";
    exit.textContent = "× 종료";

    [hl, panel, exit].forEach(function (el) {
      document.body.appendChild(el);
      state.els.push(el);
    });

    var steps = [];
    var pendingSelector = null;
    var capturing = true; // 캡처 폼이 열려있는 동안은 새로 요소를 잡지 않는다 (편집 중 오클릭 방지)

    var stepsListEl = panel.querySelector(".slw-steps-list");
    var captureEl = panel.querySelector(".slw-capture");
    var pickedCtxEl = panel.querySelector(".slw-picked-ctx");
    var titleField = panel.querySelector(".slw-step-title");
    var descField = panel.querySelector(".slw-step-desc");
    var waitForField = panel.querySelector(".slw-step-waitfor");
    var outputEl = panel.querySelector(".slw-output");
    var outputJsonEl = panel.querySelector(".slw-output-json");

    var WAITFOR_WITH_SELECTOR = [
      { value: "click", label: "클릭하면 자동으로" },
      { value: "input", label: "입력하면 자동으로" },
      { value: "urlChange", label: "페이지가 이동하면 자동으로" },
      { value: "", label: "자동 진행 없음 (수동 이동만)" }
    ];
    var WAITFOR_INFO_ONLY = [
      { value: "urlChange", label: "페이지가 이동하면 자동으로" },
      { value: "", label: "자동 진행 없음 (수동 이동만)" }
    ];

    function fillWaitForOptions(hasSelector) {
      var opts = hasSelector ? WAITFOR_WITH_SELECTOR : WAITFOR_INFO_ONLY;
      waitForField.innerHTML = opts
        .map(function (o) {
          return '<option value="' + o.value + '">' + o.label + "</option>";
        })
        .join("");
    }

    function renderStepsList() {
      if (!steps.length) {
        stepsListEl.innerHTML = '<p style="color:#aaa;margin:4px 0;">아직 추가된 스텝이 없습니다.</p>';
        return;
      }
      stepsListEl.innerHTML = steps
        .map(function (s, i) {
          return (
            '<div class="slw-step-item"><span>' +
            (i + 1) +
            ". " +
            escapeHtml(s.title || "(제목 없음)") +
            (s.selector ? "" : " · 정보전용") +
            '</span><button data-i="' +
            i +
            '">삭제</button></div>'
          );
        })
        .join("");
      Array.prototype.forEach.call(stepsListEl.querySelectorAll("button"), function (btn) {
        on(btn, "click", function () {
          steps.splice(Number(btn.getAttribute("data-i")), 1);
          renderStepsList();
        });
      });
    }
    renderStepsList();

    function openCapture(selector, ctx) {
      pendingSelector = selector;
      capturing = false;
      hl.style.display = "none";
      pickedCtxEl.textContent = selector ? ctx : "(요소 없음 — 정보 전용 안내 스텝)";
      titleField.value = "";
      descField.value = "";
      fillWaitForOptions(!!selector);
      captureEl.style.display = "block";
      titleField.focus();
    }

    function closeCapture() {
      captureEl.style.display = "none";
      capturing = true;
    }

    function isPluginNode(node) {
      return panel.contains(node) || node === exit || node === hl || node === panel;
    }

    on(
      document,
      "mousemove",
      function (e) {
        if (!capturing) return;
        var t = e.target;
        if (isPluginNode(t)) {
          hl.style.display = "none";
          return;
        }
        var r = t.getBoundingClientRect();
        hl.style.display = "block";
        hl.style.top = r.top + "px";
        hl.style.left = r.left + "px";
        hl.style.width = r.width + "px";
        hl.style.height = r.height + "px";
      },
      true
    );

    on(
      document,
      "click",
      function (e) {
        var t = e.target;
        if (isPluginNode(t)) return;
        // 도구가 켜져 있는 동안은 실제 어드민 클릭(제출/이동 등)이 절대 일어나지 않도록 항상 막는다.
        e.preventDefault();
        e.stopPropagation();
        if (!capturing) return; // 폼 작성 중에는 막기만 하고 새로 선택하지는 않는다
        var selector = buildSelector(t);
        var text = (t.textContent || "").trim().slice(0, 60);
        openCapture(selector, "<" + t.tagName.toLowerCase() + "> " + text + "\n" + selector);
      },
      true
    );

    on(panel.querySelector(".slw-add-info"), "click", function () {
      openCapture(null, "");
    });

    on(panel.querySelector(".slw-cancel-step"), "click", closeCapture);

    on(panel.querySelector(".slw-confirm-step"), "click", function () {
      var w = waitForField.value;
      var step = {
        selector: pendingSelector,
        title: titleField.value.trim() || "(제목 없음)",
        description: descField.value.trim()
      };
      if (w) step.waitFor = { type: w };
      steps.push(step);
      renderStepsList();
      closeCapture();
      toast("스텝을 추가했습니다 (" + steps.length + "개).");
    });

    on(panel.querySelector(".slw-finish"), "click", function () {
      var id = panel.querySelector(".slw-flow-id").value.trim() || "new-flow";
      var title = panel.querySelector(".slw-flow-title").value.trim();
      var flow = { id: id, title: title, steps: steps };
      outputJsonEl.value = JSON.stringify(flow, null, 2);
      outputEl.style.display = "block";
    });

    on(panel.querySelector(".slw-copy-json"), "click", function () {
      copyText(outputJsonEl.value);
      toast("JSON을 복사했습니다.");
    });

    on(panel.querySelector(".slw-download-json"), "click", function () {
      var id = panel.querySelector(".slw-flow-id").value.trim() || "new-flow";
      var blob = new Blob([outputJsonEl.value], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = id + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    });

    on(exit, "click", teardown);
  }

  // 견고한 CSS 선택자 생성: id가 있으면 최우선, 그다음 안정적 data-* 속성, 마지막으로
  // tag + :nth-of-type 경로. class는 SPA에서 해시 형태로 자주 바뀌므로 뼈대로 쓰지 않는다.
  function buildSelector(el) {
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
      return "#" + el.id;
    }
    var stableAttrs = ["data-testid", "data-test", "data-qa", "name", "aria-label"];
    for (var i = 0; i < stableAttrs.length; i++) {
      var a = stableAttrs[i];
      var v = el.getAttribute && el.getAttribute(a);
      if (v) {
        return el.tagName.toLowerCase() + "[" + a + '="' + cssEscape(v) + '"]';
      }
    }
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var tag = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        parts.unshift("#" + node.id);
        break;
      }
      var parent = node.parentNode;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (same.length > 1) {
          tag += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
        }
      }
      parts.unshift(tag);
      node = node.parentNode;
    }
    return parts.join(" > ");
  }

  function cssEscape(v) {
    return String(v).replace(/["\\]/g, "\\$&");
  }

  // ---- 유틸 ----------------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "slw-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    state.els.push(t);
    var timer = setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2600);
    state.timers.push(timer);
  }

  // ---- 진입점 --------------------------------------------------------------
  if (MODE === "picker") {
    startPicker();
  } else {
    startWalkthrough();
  }
})();
