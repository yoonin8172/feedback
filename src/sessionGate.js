import {
  clearCurrentUser,
  getCurrentUser,
  getDisplayName,
  signInWithNickname
} from "./authStore"

export function initSessionGate({ onReady, onRequireLogin }) {
  const gate = document.getElementById("sessionGate")
  const sessionName = document.getElementById("sessionName")
  const switchSessionBtn = document.getElementById("switchSessionBtn")
  const nicknameStartBtn = document.getElementById("nicknameStartBtn")
  const nicknameInput = document.getElementById("nicknameInput")
  const sessionError = document.getElementById("sessionError")

  if (!gate || !sessionName || !switchSessionBtn) {
    return null
  }

  function setError(message) {
    if (sessionError) {
      sessionError.textContent = message || ""
    }
  }

  function applyUser(user) {
    sessionName.textContent = `현재 사용자: ${getDisplayName(user)}`
    onReady?.(user)
  }

  function openGate() {
    gate.classList.remove("hidden")
    if (nicknameInput) {
      nicknameInput.value = ""
    }
    setError("")
    onRequireLogin?.()
    setTimeout(() => nicknameInput?.focus(), 0)
  }

  function closeGate() {
    gate.classList.add("hidden")
    setError("")
  }

  const user = getCurrentUser()
  if (!user) {
    openGate()
  } else {
    closeGate()
    applyUser(user)
  }

  switchSessionBtn.addEventListener("click", () => {
    clearCurrentUser()
    openGate()
  })

  function handleLogin() {
    try {
      const next = signInWithNickname(nicknameInput?.value)
      closeGate()
      applyUser(next)
    } catch (error) {
      setError(error.message)
    }
  }

  nicknameStartBtn?.addEventListener("click", handleLogin)
  nicknameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleLogin()
    }
  })

  return user
}
