import { getCurrentUser, getDisplayName } from "./authStore"
import { addPost } from "./postStore"

const mediaInput = document.getElementById("mediaInput")
const preview = document.getElementById("imagePreview")
const descriptionInput = document.getElementById("descriptionInput")
const customQuestionInput = document.getElementById("customQuestion")
const formMessage = document.getElementById("formMessage")
const submitBtn = document.getElementById("submitBtn")
const chips = [...document.querySelectorAll(".chip")]
const visibilityInputs = [...document.querySelectorAll("input[name='postVisibility']")]

let selectedQuestion = ""
const currentUser = getCurrentUser()

if (!currentUser) {
  location.href = "index.html"
}

function setMessage(text, isError = false) {
  formMessage.textContent = text
  formMessage.className = `form-message ${isError ? "error" : ""}`.trim()
}

function getErrorMeta(error) {
  const code = error?.code || "unknown"
  const message = error?.message || "알 수 없는 오류"
  return { code, message }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target.result)
    reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."))
    reader.readAsDataURL(file)
  })
}

function getSelectedFiles() {
  return Array.from(mediaInput.files || []).slice(0, 4)
}

function renderPreview() {
  preview.innerHTML = ""

  const files = getSelectedFiles()
  files.forEach((file) => {
    const objectUrl = URL.createObjectURL(file)
    const item = document.createElement("div")
    item.className = "preview-item"

    if (file.type.startsWith("video/")) {
      const video = document.createElement("video")
      video.src = objectUrl
      video.controls = true
      video.className = "preview-image"
      item.appendChild(video)
    } else {
      const img = document.createElement("img")
      img.src = objectUrl
      img.className = "preview-image"
      img.alt = "업로드 미리보기"
      item.appendChild(img)
    }

    preview.appendChild(item)
  })
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("selected"))
    chip.classList.add("selected")

    selectedQuestion = chip.dataset.question
    if (selectedQuestion === "기타") {
      customQuestionInput.style.display = "block"
      customQuestionInput.focus()
    } else {
      customQuestionInput.style.display = "none"
      customQuestionInput.value = ""
    }
  })
})

mediaInput.addEventListener("change", () => {
  if (mediaInput.files.length > 4) {
    setMessage("파일은 최대 4개까지 업로드할 수 있어요.", true)
  } else {
    setMessage("")
  }

  renderPreview()
})

submitBtn.addEventListener("click", async () => {
  const files = getSelectedFiles()
  const description = descriptionInput.value.trim()

  const question = selectedQuestion === "기타"
    ? customQuestionInput.value.trim()
    : selectedQuestion

  if (!question) {
    setMessage("피드백 질문 1개를 선택하거나 입력해주세요.", true)
    return
  }

  if (files.length === 0 && !description) {
    setMessage("이미지가 없다면 설명을 입력해주세요.", true)
    return
  }

  submitBtn.disabled = true
  setMessage("업로드 중입니다...")

  try {
    const media = await Promise.all(
      files.map(async (file) => ({
        type: file.type.startsWith("video/") ? "video" : "image",
        url: await fileToDataURL(file)
      }))
    )

    await addPost(
      {
        media,
        description,
        question
      },
      {
        id: currentUser.id,
        name: getDisplayName(currentUser),
        visibility: visibilityInputs.find((input) => input.checked)?.value || "anonymous"
      }
    )

    location.href = "index.html"
  } catch (error) {
    const meta = getErrorMeta(error)
    console.error("[Upload Error]", meta.code, meta.message, error)
    submitBtn.disabled = false
    setMessage(`업로드 실패 (${meta.code})`, true)
  }
})
