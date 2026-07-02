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
      ".slw-exit{position:fixed;top:20px;right:20px;z-index:2147483004;width:36px;height:36px;background:#1a1a1a;color:#fff;border:0;border-radius:50%;padding:0;font-size:20px;line-height:1;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:auto;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;}",
      ".slw-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483005;background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);}",
      ".slw-pick-hl{position:fixed;z-index:2147483001;background:rgba(255,77,109,.2);border:2px solid #ff4d6d;pointer-events:none;transition:all .05s ease;}",
      ".slw-panel{position:fixed;bottom:20px;left:20px;z-index:2147483004;width:360px;max-width:90vw;background:#fff;color:#1a1a1a;border-radius:10px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.3);font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:13px;pointer-events:auto;}",
      ".slw-panel h3{margin:0 0 10px;font-size:14px;font-weight:700;}",
      ".slw-panel label{display:block;font-size:11px;color:#888;margin:8px 0 3px;}",
      ".slw-panel textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;border:1px solid #ddd;border-radius:6px;padding:8px;resize:vertical;min-height:52px;}",
      ".slw-panel .slw-row{display:flex;gap:8px;margin-top:10px;}"
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
    exit.textContent = "×";
    exit.setAttribute("aria-label", "종료");
    [dim, ring, tip, exit].forEach(function (el) {
      document.body.appendChild(el);
      state.els.push(el);
    });

    on(exit, "click", function () {
      clearProgress();
      teardown();
    });

    function showStep(index) {
      if (index >= steps.length) {
        clearProgress();
        ring.style.display = "none";
        dim.style.display = "none";
        tip.innerHTML =
          "<h3>완료했습니다 🎉</h3><p>" +
          escapeHtml(flow.title || "") +
          " 흐름을 끝까지 따라오셨습니다.</p>";
        placeTip(tip, null);
        return;
      }

      saveProgress(flow.id, index);
      var step = steps[index];

      // 정보 전용 단계(selector 없음)는 특정 요소 없이 안내만 보여준다.
      if (!step.selector) {
        ring.style.display = "none";
        dim.style.display = "none";
        renderTip(step, index, steps.length, null, function () {
          showStep(index + 1);
        });
        return;
      }

      renderTip(step, index, steps.length, "waiting", null);
      waitForElement(step.selector, ELEMENT_WAIT_TIMEOUT_MS, function (target) {
        if (!target) {
          renderTip(step, index, steps.length, "notfound", function () {
            showStep(index + 1);
          });
          return;
        }
        highlight(target, dim, ring);
        renderTip(step, index, steps.length, target, function () {
          showStep(index + 1);
        });
        bindAdvance(step, target, function () {
          showStep(index + 1);
        });
      });
    }

    function renderTip(step, index, total, target, onManualNext) {
      var html = "";
      html += '<div class="slw-step">' + (index + 1) + " / " + total + "</div>";
      html += "<h3>" + escapeHtml(step.title || "") + "</h3>";
      html += "<p>" + escapeHtml(step.description || "") + "</p>";

      if (target === "waiting") {
        html += '<div class="slw-hint">화면을 준비하는 중…</div>';
        tip.innerHTML = html;
        placeTip(tip, null);
        return;
      }
      if (target === "notfound") {
        html += '<div class="slw-hint">요소를 찾을 수 없습니다. 화면이 맞는지 확인하거나 건너뛰세요.</div>';
        html += '<div class="slw-row"><button class="slw-btn slw-btn-primary">건너뛰기</button></div>';
        tip.innerHTML = html;
        placeTip(tip, null);
        on(tip.querySelector("button"), "click", onManualNext);
        return;
      }

      if (step.waitFor) {
        html += '<div class="slw-hint">' + waitHint(step.waitFor) + "</div>";
      } else {
        html += '<div class="slw-row"><button class="slw-btn slw-btn-primary">다음</button></div>';
      }
      tip.innerHTML = html;
      placeTip(tip, target);
      if (!step.waitFor) {
        on(tip.querySelector("button"), "click", onManualNext);
      }
    }

    function bindAdvance(step, target, next) {
      var w = step.waitFor;
      if (!w) return;
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

  // ---- 요소 선택기 모드 ----------------------------------------------------
  function startPicker() {
    injectStyle();

    var hl = document.createElement("div");
    hl.className = "slw-pick-hl";
    hl.style.display = "none";
    var panel = document.createElement("div");
    panel.className = "slw-panel";
    panel.innerHTML =
      "<h3>요소 선택기</h3>" +
      "<p style='margin:0 0 4px;color:#666;'>페이지 위 아무 요소에 마우스를 올리고 클릭하면 선택자가 아래에 잡힙니다.</p>" +
      "<label>CSS Selector</label>" +
      '<textarea class="slw-sel" readonly placeholder="요소를 클릭하세요"></textarea>' +
      "<label>태그 / 텍스트</label>" +
      '<textarea class="slw-ctx" readonly placeholder=""></textarea>' +
      '<div class="slw-row">' +
      '<button class="slw-btn slw-btn-primary slw-copy">선택자 복사</button>' +
      '<button class="slw-btn slw-btn-ghost slw-copystep">스텝 JSON 복사</button>' +
      '</div>';
    var exit = document.createElement("button");
    exit.className = "slw-exit";
    exit.textContent = "×";
    exit.setAttribute("aria-label", "종료");

    [hl, panel, exit].forEach(function (el) {
      document.body.appendChild(el);
      state.els.push(el);
    });

    var selField = panel.querySelector(".slw-sel");
    var ctxField = panel.querySelector(".slw-ctx");
    var lastSelector = "";
    var lastText = "";

    function isPluginNode(node) {
      return panel.contains(node) || node === exit || node === hl || node === panel;
    }

    on(document, "mousemove", function (e) {
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
    }, true);

    on(document, "click", function (e) {
      var t = e.target;
      if (isPluginNode(t)) return;
      // 선택 대상의 실제 클릭 동작(페이지 이동 등)을 막아 선택만 되도록 한다.
      e.preventDefault();
      e.stopPropagation();
      lastSelector = buildSelector(t);
      lastText = (t.textContent || "").trim().slice(0, 60);
      selField.value = lastSelector;
      ctxField.value = "<" + t.tagName.toLowerCase() + "> " + lastText;
    }, true);

    on(panel.querySelector(".slw-copy"), "click", function () {
      copyText(lastSelector);
      toast("선택자를 복사했습니다.");
    });
    on(panel.querySelector(".slw-copystep"), "click", function () {
      var step = {
        selector: lastSelector,
        title: "제목을 입력하세요",
        description: "설명을 입력하세요",
        waitFor: { type: "click" }
      };
      copyText(JSON.stringify(step, null, 2));
      toast("스텝 JSON을 복사했습니다.");
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
