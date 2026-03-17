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

const MAX_MEDIA_PAYLOAD_BYTES = 850 * 1024
const MAX_VIDEO_FILE_BYTES = 500 * 1024
const MAX_IMAGE_EDGE_PX = 1600
const IMAGE_EXPORT_QUALITY = 0.82

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

function fileToDataURLRaw(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target.result)
    reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."))
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataURL(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("이미지를 처리하는 중 오류가 발생했습니다."))
    img.src = dataUrl
  })
}

async function imageFileToOptimizedDataURL(file) {
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return fileToDataURLRaw(file)
  }

  const sourceUrl = await fileToDataURLRaw(file)
  const image = await loadImageFromDataURL(sourceUrl)
  const ratio = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(image.width, image.height))
  const targetWidth = Math.max(1, Math.round(image.width * ratio))
  const targetHeight = Math.max(1, Math.round(image.height * ratio))

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("이미지 처리 컨텍스트를 생성하지 못했습니다.")
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

  const outputType = file.type === "image/png" ? "image/webp" : "image/jpeg"
  return canvas.toDataURL(outputType, IMAGE_EXPORT_QUALITY)
}

async function fileToDataURL(file) {
  if (file.type.startsWith("image/")) {
    return imageFileToOptimizedDataURL(file)
  }

  if (file.type.startsWith("video/")) {
    if (file.size > MAX_VIDEO_FILE_BYTES) {
      const error = new Error("영상 파일이 너무 큽니다.")
      error.code = "video-too-large"
      throw error
    }
    return fileToDataURLRaw(file)
  }

  return fileToDataURLRaw(file)
}

function estimateUtf8Bytes(value) {
  return new TextEncoder().encode(value || "").length
}

function ensurePayloadSize(media, description, question) {
  const mediaBytes = media.reduce((sum, item) => {
    return sum + estimateUtf8Bytes(item.type) + estimateUtf8Bytes(item.url)
  }, 0)
  const textBytes = estimateUtf8Bytes(description) + estimateUtf8Bytes(question)
  const approxBytes = mediaBytes + textBytes

  if (approxBytes > MAX_MEDIA_PAYLOAD_BYTES) {
    const error = new Error("업로드 데이터가 Firestore 문서 한도를 넘었습니다.")
    error.code = "payload-too-large"
    throw error
  }
}

function getFriendlyErrorMessage(code) {
  if (code === "payload-too-large" || code === "invalid-argument") {
    return "업로드 데이터가 너무 커요. 이미지 개수/크기를 줄여 다시 시도해주세요."
  }
  if (code === "video-too-large") {
    return "영상 파일이 너무 커요. 500KB 이하 파일만 업로드할 수 있어요."
  }
  if (code === "permission-denied") {
    return "권한 오류가 발생했어요. 잠시 후 다시 시도하거나 관리자에게 문의해주세요."
  }
  return `업로드 실패 (${code})`
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

    ensurePayloadSize(media, description, question)

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
    setMessage(getFriendlyErrorMessage(meta.code), true)
  }
})
