const USER_KEY = "design-feedback-current-user"

// TODO: 실제 반 닉네임 목록으로 교체하세요.
const ALLOWED_NICKNAMES = [
  "yoonin",
  "1004",
  "sin",
  "222",
  "amy",
  "dang",
  "ellia",
  "nemo",
  "nonew",
  "zero",
  "alice",
  "bo",
  "bulkyboy",
  "dan",
  "gregory",
  "hae",
  "ian",
  "kuchipatchi",
  "kyo",
  "malngko",
  "momlove",
  "noun",
  "oyajitchi",
  "soori",
  "tomo",
  "wal7676",
  "yongari"
]

function readUser() {
  try {
    const value = sessionStorage.getItem(USER_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeUser(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
}

function normalizeNickname(name) {
  return (name || "").trim()
}

export function getCurrentUser() {
  return readUser()
}

export function signInWithNickname(name) {
  const nickname = normalizeNickname(name)
  if (!nickname) {
    throw new Error("닉네임을 입력해주세요.")
  }

  const isAllowed = ALLOWED_NICKNAMES.includes(nickname)
  if (!isAllowed) {
    throw new Error("사전에 안내된 닉네임만 사용할 수 있어요.")
  }

  const user = {
    id: `nick:${nickname}`,
    name: nickname,
    createdAt: new Date().toISOString()
  }

  writeUser(user)
  return user
}

export function clearCurrentUser() {
  sessionStorage.removeItem(USER_KEY)
}

export function getDisplayName(user) {
  return user?.name || ""
}
