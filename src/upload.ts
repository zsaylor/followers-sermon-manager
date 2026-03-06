(function () {
  interface Sermon {
    id: string;
    title: string;
    description: string;
    speaker: string;
    date: string;
    audioUrl: string;
    audioFileSize: number;
    durationSeconds: number;
    createdAt: string;
    keywords?: string[];
  }

  let isAuthenticated = false;
  let audioDuration: number | null = null;

  // DOM Elements - will be queried inside init()
  let loginSection: HTMLElement;
  let uploadSection: HTMLElement;
  let loginForm: HTMLFormElement;
  let uploadForm: HTMLFormElement;
  let passwordInput: HTMLInputElement;
  let loginError: HTMLElement;
  let logoutBtn: HTMLButtonElement;
  let audioInput: HTMLInputElement;
  let durationInfo: HTMLElement;
  let progressContainer: HTMLElement;
  let progressFill: HTMLElement;
  let progressText: HTMLElement;
  let submitBtn: HTMLButtonElement;
  let uploadMessage: HTMLElement;
  let sermonsList: HTMLElement;

  function init() {
    loginSection = document.getElementById("login-section") as HTMLElement;
    uploadSection = document.getElementById("upload-section") as HTMLElement;
    passwordInput = document.getElementById("password") as HTMLInputElement;
    loginForm = document.getElementById("login-form") as HTMLFormElement;
    uploadForm = document.getElementById("upload-form") as HTMLFormElement;
    loginError = document.getElementById("login-error") as HTMLElement;
    logoutBtn = document.getElementById("logout-btn") as HTMLButtonElement;
    audioInput = document.getElementById("audio") as HTMLInputElement;
    durationInfo = document.getElementById("duration-info") as HTMLElement;
    progressContainer = document.getElementById(
      "progress-container",
    ) as HTMLElement;
    progressFill = document.getElementById("progress-fill") as HTMLElement;
    progressText = document.getElementById("progress-text") as HTMLElement;
    submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
    uploadMessage = document.getElementById("upload-message") as HTMLElement;
    sermonsList = document.getElementById("sermons-list") as HTMLElement;

    // We rely on an HTTP-only cookie set by /api/login.
    isAuthenticated = false;
    restoreSession();

    // Load last speaker from localStorage
    const lastSpeaker = localStorage.getItem("lastSpeaker");
    if (lastSpeaker) {
      (document.getElementById("speaker") as HTMLInputElement).value =
        lastSpeaker;
    }

    // Set default date to today
    const dateInput = document.getElementById("date") as HTMLInputElement;
    dateInput.value = new Date().toISOString().split("T")[0];

    // Login form handler
    loginForm.addEventListener("submit", (e: Event) => {
      e.preventDefault();
      const password = passwordInput.value;
      login(password);
    });

    // Logout handler
    logoutBtn.addEventListener("click", () => {
      logout();
    });

    // Audio file handler - calculate duration
    audioInput.addEventListener("change", async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      durationInfo.classList.remove("hidden");
      durationInfo.textContent = "Calculating duration...";
      audioDuration = null;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioDuration = Math.round(audioBuffer.duration);

        const minutes = Math.floor(audioDuration / 60);
        const seconds = audioDuration % 60;
        durationInfo.textContent = `Duration: ${minutes}:${seconds.toString().padStart(2, "0")}`;
      } catch (error) {
        durationInfo.textContent =
          "Could not calculate duration. Please try another file.";
        durationInfo.classList.add("error");
      }
    });

    // Upload form handler
    uploadForm.addEventListener("submit", (e: Event) => {
      e.preventDefault();

      if (!isAuthenticated) {
        showMessage("Not authenticated", "error");
        showLoginSection();
        return;
      }

      if (!audioDuration) {
        showMessage("Please wait for audio duration to be calculated", "error");
        return;
      }

      const file = audioInput.files?.[0];
      if (!file) {
        showMessage("No audio file selected", "error");
        return;
      }

      const formData = new FormData(uploadForm);
      const title = String(formData.get("title") || "");
      const speaker = String(formData.get("speaker") || "");
      const date = String(formData.get("date") || "");
      const description = String(formData.get("description") || "");
      const keywordsStr = String(formData.get("keywords") || "");
      const keywords = keywordsStr
        ? keywordsStr
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k)
        : undefined;

      // Save speaker to localStorage
      localStorage.setItem("lastSpeaker", speaker);

      // Show progress
      progressContainer.classList.remove("hidden");
      submitBtn.disabled = true;
      progressFill.style.width = "0%";
      progressText.textContent = "0%";

      (async () => {
        try {
          // Step 1: request a presigned upload URL from our API
          const urlRes = await fetch("/api/upload-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title,
              description,
              speaker,
              date,
              durationSeconds: audioDuration,
              contentType: file.type || "audio/mpeg",
              fileSize: file.size,
            }),
          });

          if (urlRes.status === 401) {
            showMessage("Authentication failed. Please login again.", "error");
            showLoginSection();
            return;
          }

          const urlJson = await urlRes.json();
          if (!urlRes.ok) {
            showMessage(
              urlJson.details || urlJson.error || "Upload init failed",
              "error",
            );
            return;
          }

          const { id, uploadUrl, audioUrl } = urlJson as {
            id: string;
            uploadUrl: string;
            audioUrl: string;
          };

          // Step 2: upload the file directly to R2
          await new Promise<void>((resolve, reject) => {
            const putXhr = new XMLHttpRequest();
            putXhr.upload.addEventListener("progress", (e: ProgressEvent) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = `${percentComplete}%`;
                progressText.textContent = `${percentComplete}%`;
              }
            });

            putXhr.addEventListener("load", () => {
              if (putXhr.status >= 200 && putXhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`R2 upload failed (HTTP ${putXhr.status})`));
              }
            });

            putXhr.addEventListener("error", () => {
              reject(new Error("R2 upload failed"));
            });

            putXhr.open("PUT", uploadUrl);
            putXhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
            putXhr.send(file);
          });

          // Step 3: finalize by saving sermon metadata in sermons.json
          const completeRes = await fetch("/api/upload-complete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id,
              title,
              description,
              speaker,
              date,
              durationSeconds: audioDuration,
              audioUrl,
              audioFileSize: file.size,
              keywords,
            }),
          });

          if (completeRes.status === 401) {
            showMessage("Authentication failed. Please login again.", "error");
            showLoginSection();
            return;
          }

          const completeJson = await completeRes.json();
          if (!completeRes.ok) {
            showMessage(
              completeJson.details ||
                completeJson.error ||
                "Upload finalize failed",
              "error",
            );
            return;
          }

          showMessage("Sermon uploaded successfully!", "success");
          uploadForm.reset();
          progressContainer.classList.add("hidden");
          progressFill.style.width = "0%";
          progressText.textContent = "0%";
          durationInfo.classList.add("hidden");
          audioDuration = null;
          loadSermons();
        } catch (err: any) {
          showMessage(
            err?.message || "Upload failed. Please try again.",
            "error",
          );
        } finally {
          submitBtn.disabled = false;
        }
      })();
    });
  }

  function showUploadSection() {
    loginSection.classList.add("hidden");
    uploadSection.classList.remove("hidden");
  }

  function showLoginSection() {
    loginSection.classList.remove("hidden");
    uploadSection.classList.add("hidden");
    isAuthenticated = false;
  }

  async function login(password: string) {
    loginError.textContent = "Invalid password";
    loginError.classList.add("hidden");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        isAuthenticated = true;
        showUploadSection();
        passwordInput.value = "";
        loadSermons();
        return;
      }

      if (res.status === 429) {
        loginError.textContent =
          "Too many failed attempts. Please wait and try again.";
        loginError.classList.remove("hidden");
        return;
      }

      loginError.classList.remove("hidden");
    } catch {
      loginError.textContent = "Login failed. Please try again.";
      loginError.classList.remove("hidden");
    }
  }

  async function restoreSession() {
    try {
      const res = await fetch("/api/session");
      const json = await res.json();
      isAuthenticated = Boolean(json?.ok);
      if (isAuthenticated) {
        showUploadSection();
      } else {
        showLoginSection();
      }
    } catch {
      showLoginSection();
    } finally {
      loadSermons();
    }
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }
    showLoginSection();
    passwordInput.value = "";
    loadSermons();
  }

  function showMessage(message: string, type: "success" | "error") {
    uploadMessage.textContent = message;
    uploadMessage.className = `message ${type}`;
    uploadMessage.classList.remove("hidden");

    setTimeout(() => {
      uploadMessage.classList.add("hidden");
    }, 5000);
  }

  // Load and display latest sermon
  async function loadSermons() {
    try {
      const response = await fetch("/api/sermons");
      const data = await response.json();

      if (data.sermons.length === 0) {
        sermonsList.innerHTML = "<p>No sermons uploaded yet.</p>";
        return;
      }

      // Show only the first sermon (most recent)
      const sermon = data.sermons[0];
      const date = new Date(sermon.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const duration = formatDuration(sermon.durationSeconds);
      const tagsHtml =
        sermon.keywords && sermon.keywords.length > 0
          ? `<div class="sermon-tags">${sermon.keywords.map((tag: string) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
          : "";

      sermonsList.innerHTML = `
        <div class="sermon-card">
          <h3>${escapeHtml(sermon.title)}</h3>
          <div class="sermon-meta">
            ${escapeHtml(sermon.speaker)} • ${date} • ${duration}
          </div>
          ${tagsHtml}
          <p class="sermon-description">${escapeHtml(sermon.description)}</p>
          <audio controls src="${sermon.audioUrl}"></audio>
        </div>
      `;
    } catch (error) {
      sermonsList.innerHTML = "<p>Error loading sermons.</p>";
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  init();
})();
