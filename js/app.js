// ===== Firebase 설정 =====
// TODO: Firebase 콘솔에서 실제 프로젝트를 만든 뒤 아래 값을 교체하세요.
// 참고: 이 값들을 채우지 않아도 로그인/설문/체질 진단은 로컬(localStorage)로 정상 동작합니다.
// AI 맞춤 가이드(Cloud Function 호출)만 실제 Firebase 프로젝트 연결이 필요합니다.
var firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

var _fbReady = false;
var db = null;
var getGuideFn = null;
var _authUid = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  // functions/index.js 배포 리전과 반드시 일치시킬 것
  getGuideFn = firebase.app().functions('asia-northeast3').httpsCallable('getGuide');
  _fbReady = true;
  // 익명 인증: Firestore 보안 규칙에서 request.auth.uid로 사용자별 데이터를 분리하기 위함
  firebase.auth().signInAnonymously().then(function (cred) {
    _authUid = cred.user.uid;
  }).catch(function (e) { console.warn('익명 인증 실패 - Firestore 동기화는 건너뜁니다.', e); });
} catch (e) {
  console.warn('Firebase 초기화 실패 - 로컬 모드로 동작합니다.', e);
}

// ===== 체질 데이터 =====
var CTYPES = {
  taeyang: {
    name: '태양인',
    desc: '진취적이고 사교적이며 창의적인 기운이 강한 편이에요. 다만 간 기능이 약할 수 있어 과로와 과음을 피하고, 담백한 채소와 해산물 위주 식단이 잘 맞아요.'
  },
  taeeum: {
    name: '태음인',
    desc: '묵묵하고 끈기 있으며 큰 그릇을 가진 편이에요. 살이 찌기 쉬운 체질이라 꾸준한 유산소 운동과 과식을 피하는 습관이 중요해요.'
  },
  soyang: {
    name: '소양인',
    desc: '민첩하고 사교적이며 열정적인 편이에요. 몸에 열이 많아 자극적이고 기름진 음식보다 시원하고 담백한 음식이 잘 맞아요.'
  },
  soeum: {
    name: '소음인',
    desc: '차분하고 꼼꼼하며 계획적인 편이에요. 소화 기능이 약하고 손발이 찬 편이라 따뜻한 음식과 규칙적인 소식 습관이 도움이 돼요.'
  }
};
var CTYPE_ORDER = ['taeyang', 'taeeum', 'soyang', 'soeum'];

// ===== 설문 문항 =====
var SURVEY = [
  { q: '체형은 어떤 편인가요?', opts: [
    { t: 'taeyang', label: '목이 굵고 가슴 윗부분이 발달, 허리 아래는 약한 편' },
    { t: 'taeeum', label: '골격이 크고 튼튼하며 살이 잘 찌는 편' },
    { t: 'soyang', label: '가슴과 어깨가 발달하고 엉덩이 쪽은 빈약한 편' },
    { t: 'soeum', label: '체구가 아담하고 상체보다 하체가 발달한 편' }
  ]},
  { q: '평소 성격에 가장 가까운 것은?', opts: [
    { t: 'taeyang', label: '진취적이고 독창적이며 남 앞에 나서는 걸 좋아함' },
    { t: 'taeeum', label: '느긋하고 참을성이 많으며 신중한 편' },
    { t: 'soyang', label: '활발하고 사교적이며 일 처리가 빠른 편' },
    { t: 'soeum', label: '차분하고 꼼꼼하며 계획적인 편' }
  ]},
  { q: '더위와 추위 중 어느 쪽에 더 예민한가요?', opts: [
    { t: 'taeyang', label: '특별히 예민하진 않지만 목이 쉽게 피로해짐' },
    { t: 'taeeum', label: '더위에 약하고 땀을 많이 흘리는 편' },
    { t: 'soyang', label: '몸에 열이 많아 더위를 잘 타는 편' },
    { t: 'soeum', label: '손발이 차고 추위에 약한 편' }
  ]},
  { q: '소화 기능은 어떤 편인가요?', opts: [
    { t: 'taeyang', label: '대체로 무난하지만 과음·과로하면 탈이 남' },
    { t: 'taeeum', label: '소화력이 좋고 대체로 잘 먹는 편' },
    { t: 'soyang', label: '소화가 빠르고 배가 자주 고픈 편' },
    { t: 'soeum', label: '소화가 더디고 조금만 먹어도 부담스러운 편' }
  ]},
  { q: '땀에 대해 어떻게 느끼나요?', opts: [
    { t: 'taeyang', label: '땀을 많이 흘리면 오히려 몸이 무거워짐' },
    { t: 'taeeum', label: '땀을 흘리고 나면 몸이 개운해짐' },
    { t: 'soyang', label: '땀은 적당히 나는 편, 크게 신경 안 씀' },
    { t: 'soeum', label: '땀이 적은 편이고 땀나면 기운이 빠짐' }
  ]},
  { q: '목소리나 말투는 어떤 편인가요?', opts: [
    { t: 'taeyang', label: '목소리가 크고 울림이 있는 편' },
    { t: 'taeeum', label: '말이 느리고 신중한 편' },
    { t: 'soyang', label: '말이 빠르고 시원시원한 편' },
    { t: 'soeum', label: '목소리가 작고 조곤조곤한 편' }
  ]},
  { q: '화가 날 때 반응에 가까운 것은?', opts: [
    { t: 'taeyang', label: '욱하지만 금방 풀리고 뒤끝은 적은 편' },
    { t: 'taeeum', label: '웬만해서는 화를 잘 안 내는 편' },
    { t: 'soyang', label: '화가 나면 바로 표현하는 편' },
    { t: 'soeum', label: '겉으로 잘 드러내지 않고 속으로 삭이는 편' }
  ]},
  { q: '평소 대변 상태는 어떤가요?', opts: [
    { t: 'taeyang', label: '무난한 편, 특별한 불편은 없음' },
    { t: 'taeeum', label: '변비 경향이 있는 편' },
    { t: 'soyang', label: '대변이 시원하게 잘 나오는 편' },
    { t: 'soeum', label: '무르거나 자주 변하는 편' }
  ]},
  { q: '처음 만난 사람과의 관계는?', opts: [
    { t: 'taeyang', label: '리더십을 발휘하며 주도하는 편' },
    { t: 'taeeum', label: '서두르지 않고 천천히 친해지는 편' },
    { t: 'soyang', label: '금방 친해지고 분위기를 주도하는 편' },
    { t: 'soeum', label: '낯을 가리지만 한번 친해지면 깊게 챙기는 편' }
  ]},
  { q: '평소 체력과 지구력은 어떤가요?', opts: [
    { t: 'taeyang', label: '순발력은 좋으나 지구력은 약한 편' },
    { t: 'taeeum', label: '지구력이 좋고 웬만해선 잘 지치지 않는 편' },
    { t: 'soyang', label: '활동적이지만 쉽게 지치는 편' },
    { t: 'soeum', label: '기초 체력이 약하고 쉽게 피로한 편' }
  ]}
];

// ===== 상태 =====
var USER = null;      // 현재 로그인 사용자 (localStorage 기준)
var _surveyIdx = 0;
var _surveyScores = { taeyang: 0, taeeum: 0, soyang: 0, soeum: 0 };
var _pendingCheckup = null;

// ===== 로컬 저장소 =====
function loadUsers() {
  try { return JSON.parse(localStorage.getItem('nb_users') || '[]'); }
  catch (e) { return []; }
}
function saveUsers(list) { localStorage.setItem('nb_users', JSON.stringify(list)); }
function findUser(name, birthYear) {
  var list = loadUsers();
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === name && String(list[i].birthYear) === String(birthYear)) return list[i];
  }
  return null;
}
function upsertUser(user) {
  var list = loadUsers();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].id === user.id) { idx = i; break; } }
  if (idx >= 0) list[idx] = user; else list.push(user);
  saveUsers(list);
}
function uid() { return 'u_' + Date.now() + '_' + Math.floor(Math.random() * 10000); }

// ===== 화면 전환 =====
function showScreen(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ===== 로그인 =====
document.getElementById('btn-login').addEventListener('click', function () {
  var name = document.getElementById('in-name').value.trim();
  var birth = document.getElementById('in-birth').value.trim();
  if (!name) { alert('이름을 입력해주세요.'); return; }
  if (!birth || isNaN(Number(birth))) { alert('태어난 연도를 숫자로 입력해주세요.'); return; }

  var user = findUser(name, birth);
  if (!user) {
    user = { id: uid(), name: name, birthYear: birth, ctype: null, survey: null, guides: [] };
    upsertUser(user);
  }
  USER = user;
  localStorage.setItem('nb_last_user', USER.id);
  renderHome();
  showScreen('scr-home');
});

function tryAutoLogin() {
  var lastId = localStorage.getItem('nb_last_user');
  if (!lastId) return false;
  var list = loadUsers();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === lastId) {
      USER = list[i];
      renderHome();
      showScreen('scr-home');
      return true;
    }
  }
  return false;
}

document.getElementById('btn-logout').addEventListener('click', function () {
  localStorage.removeItem('nb_last_user');
  USER = null;
  showScreen('scr-landing');
});

// ===== 홈 =====
function renderHome() {
  var noSurvey = document.getElementById('home-no-survey');
  var hasSurvey = document.getElementById('home-has-survey');
  if (!USER.ctype) {
    noSurvey.classList.remove('hidden');
    hasSurvey.classList.add('hidden');
  } else {
    noSurvey.classList.add('hidden');
    hasSurvey.classList.remove('hidden');
    var ct = CTYPES[USER.ctype];
    document.getElementById('home-ctype-badge').textContent = ct.name;
    document.getElementById('home-ctype-desc').textContent = ct.desc;
  }
  renderGuideList('home-guide-list');
}

function renderGuideList(containerId) {
  var el = document.getElementById(containerId);
  el.innerHTML = '';
  var guides = (USER.guides || []).slice().reverse();
  if (guides.length === 0) {
    el.innerHTML = '<div class="empty-note">아직 받은 가이드가 없어요.</div>';
    return;
  }
  guides.forEach(function (g) {
    var div = document.createElement('div');
    div.className = 'guide-item';
    var d = new Date(g.createdAt);
    var dateStr = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    div.innerHTML = '<div class="g-date">' + dateStr + '</div><div class="g-preview">' + g.text.slice(0, 60) + '...</div>';
    div.addEventListener('click', function () { showGuideResult(g.text); });
    el.appendChild(div);
  });
}

document.getElementById('btn-go-mypage').addEventListener('click', function () { renderMypage(); showScreen('scr-mypage'); });
document.getElementById('btn-mypage-back').addEventListener('click', function () { renderHome(); showScreen('scr-home'); });
document.getElementById('btn-start-survey').addEventListener('click', startSurvey);
document.getElementById('btn-resurvey').addEventListener('click', startSurvey);
document.getElementById('btn-survey-back').addEventListener('click', function () { showScreen('scr-home'); });
document.getElementById('btn-go-checkup').addEventListener('click', function () { showScreen('scr-checkup'); });
document.getElementById('btn-checkup-back').addEventListener('click', function () { showScreen('scr-home'); });
document.getElementById('btn-result-to-home').addEventListener('click', function () { renderHome(); showScreen('scr-home'); });
document.getElementById('btn-result-to-checkup').addEventListener('click', function () { showScreen('scr-checkup'); });
document.getElementById('btn-guide-to-home').addEventListener('click', function () { renderHome(); showScreen('scr-home'); });
document.getElementById('btn-guide-error-home').addEventListener('click', function () { renderHome(); showScreen('scr-home'); });
document.getElementById('btn-guide-retry').addEventListener('click', function () { requestGuide(_pendingCheckup); });

// ===== 설문 =====
function startSurvey() {
  _surveyIdx = 0;
  _surveyScores = { taeyang: 0, taeeum: 0, soyang: 0, soeum: 0 };
  showScreen('scr-survey');
  renderSurveyQuestion();
}

function renderSurveyQuestion() {
  var item = SURVEY[_surveyIdx];
  document.getElementById('survey-qnum').textContent = (_surveyIdx + 1) + ' / ' + SURVEY.length;
  document.getElementById('survey-question').textContent = item.q;
  document.getElementById('survey-progress').style.width = Math.round((_surveyIdx / SURVEY.length) * 100) + '%';

  var optsEl = document.getElementById('survey-options');
  optsEl.innerHTML = '';
  item.opts.forEach(function (opt) {
    var div = document.createElement('div');
    div.className = 'q-option';
    div.textContent = opt.label;
    div.addEventListener('click', function () { answerSurvey(opt.t); });
    optsEl.appendChild(div);
  });
}

function answerSurvey(type) {
  _surveyScores[type]++;
  _surveyIdx++;
  if (_surveyIdx >= SURVEY.length) {
    finishSurvey();
  } else {
    renderSurveyQuestion();
  }
}

function finishSurvey() {
  document.getElementById('survey-progress').style.width = '100%';
  var best = CTYPE_ORDER[0];
  CTYPE_ORDER.forEach(function (t) { if (_surveyScores[t] > _surveyScores[best]) best = t; });

  USER.ctype = best;
  USER.survey = { scores: _surveyScores, answeredAt: Date.now() };
  upsertUser(USER);
  syncUserToFirestore();

  var ct = CTYPES[best];
  document.getElementById('result-ctype-badge').textContent = ct.name;
  document.getElementById('result-ctype-name').textContent = ct.name;
  document.getElementById('result-ctype-desc').textContent = ct.desc;
  showScreen('scr-result');
}

// ===== 검진 결과 입력 =====
document.getElementById('btn-checkup-submit').addEventListener('click', function () {
  var checkup = {
    glucose: document.getElementById('ck-glucose').value.trim(),
    bpSys: document.getElementById('ck-bp-sys').value.trim(),
    bpDia: document.getElementById('ck-bp-dia').value.trim(),
    chol: document.getElementById('ck-chol').value.trim(),
    weight: document.getElementById('ck-weight').value.trim(),
    memo: document.getElementById('ck-memo').value.trim()
  };
  requestGuide(checkup);
});

function requestGuide(checkup) {
  _pendingCheckup = checkup;
  showScreen('scr-guide');
  document.getElementById('guide-result').classList.add('hidden');
  document.getElementById('guide-error').classList.add('hidden');
  document.getElementById('guide-loading').classList.remove('hidden');

  if (!getGuideFn) {
    onGuideError();
    return;
  }

  getGuideFn({
    ctype: USER.ctype,
    ctypeName: CTYPES[USER.ctype].name,
    checkup: checkup
  }).then(function (res) {
    var text = (res.data && res.data.text) ? res.data.text : '';
    if (!text) { onGuideError(); return; }
    var guide = { id: uid(), createdAt: Date.now(), checkup: checkup, text: text };
    USER.guides = USER.guides || [];
    USER.guides.push(guide);
    upsertUser(USER);
    syncGuideToFirestore(guide);
    showGuideResult(text);
  }).catch(function (err) {
    console.warn('가이드 요청 실패', err);
    onGuideError();
  });
}

function showGuideResult(text) {
  document.getElementById('guide-loading').classList.add('hidden');
  document.getElementById('guide-error').classList.add('hidden');
  document.getElementById('guide-result').classList.remove('hidden');
  document.getElementById('guide-ctype-badge').textContent = CTYPES[USER.ctype].name;
  document.getElementById('guide-text').textContent = text;
  showScreen('scr-guide');
}

function onGuideError() {
  document.getElementById('guide-loading').classList.add('hidden');
  document.getElementById('guide-result').classList.add('hidden');
  document.getElementById('guide-error').classList.remove('hidden');
}

// ===== 마이페이지 =====
function renderMypage() {
  document.getElementById('my-name').textContent = USER.name;
  document.getElementById('my-birth').textContent = USER.birthYear;
  document.getElementById('my-ctype').textContent = USER.ctype ? CTYPES[USER.ctype].name : '진단 전';
  renderGuideList('mypage-guide-list');
}

// ===== Firestore 동기화 (best-effort, 실패해도 앱 동작에 지장 없음) =====
// 문서 ID는 항상 Firebase 익명 인증 uid를 사용 (firestore.rules가 request.auth.uid로 접근을 제한함)
function syncUserToFirestore() {
  if (!_fbReady || !db || !_authUid) return;
  try {
    db.collection('users').doc(_authUid).set({
      name: USER.name,
      birthYear: USER.birthYear,
      ctype: USER.ctype,
      survey: USER.survey,
      updatedAt: Date.now()
    }, { merge: true }).catch(function (e) { console.warn('Firestore 사용자 동기화 실패', e); });
  } catch (e) { console.warn('Firestore 사용자 동기화 실패', e); }
}

function syncGuideToFirestore(guide) {
  if (!_fbReady || !db || !_authUid) return;
  try {
    db.collection('users').doc(_authUid).collection('guides').doc(guide.id).set(guide)
      .catch(function (e) { console.warn('Firestore 가이드 동기화 실패', e); });
  } catch (e) { console.warn('Firestore 가이드 동기화 실패', e); }
}

// ===== 서비스워커 =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW 등록 실패', e); });
  });
}

// ===== 시작 =====
(function init() {
  if (!tryAutoLogin()) showScreen('scr-landing');
})();
