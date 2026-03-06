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
  let currentPage = 1;
  const limit = 10;
  let hasMore = true;

  async function init() {
    // Check authentication on page load
    const isAuthed = await checkAuth();
    if (!isAuthed) {
      // Redirect to login page if not authenticated
      window.location.href = "/index.html";
      return;
    }

    isAuthenticated = true;

    // Add logout button handler
    const logoutBtn = document.getElementById(
      "logout-btn",
    ) as HTMLButtonElement;
    if (logoutBtn) {
      logoutBtn.addEventListener("click", logout);
    }

    // Initial load
    loadSermons();

    // Load more button handler
    const loadMoreBtn = document.getElementById(
      "load-more",
    ) as HTMLButtonElement;
    loadMoreBtn.addEventListener("click", () => {
      currentPage++;
      loadSermons(currentPage, true);
    });
  }

  async function checkAuth(): Promise<boolean> {
    try {
      const res = await fetch("/api/session");
      const json = await res.json();
      return Boolean(json?.ok);
    } catch {
      return false;
    }
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }
    window.location.href = "/index.html";
  }

  async function loadSermons(page: number = 1, append: boolean = false) {
    const sermonsContainer = document.getElementById(
      "sermons-container",
    ) as HTMLElement;
    const pagination = document.getElementById("pagination") as HTMLElement;

    try {
      const response = await fetch(`/api/sermons?page=${page}&limit=${limit}`);
      const data = await response.json();

      if (data.sermons.length === 0 && page === 1) {
        sermonsContainer.innerHTML =
          "<p class='loading'>No sermons available.</p>";
        pagination.classList.add("hidden");
        return;
      }

      if (data.sermons.length < limit) {
        hasMore = false;
        pagination.classList.add("hidden");
      } else {
        pagination.classList.remove("hidden");
      }

      const sermonsHtml = data.sermons
        .map((sermon: Sermon) => createSermonCard(sermon))
        .join("");

      if (append) {
        sermonsContainer.insertAdjacentHTML("beforeend", sermonsHtml);
      } else {
        sermonsContainer.innerHTML = sermonsHtml;
      }

      // Add read more handlers
      document.querySelectorAll(".read-more").forEach((btn) => {
        btn.addEventListener("click", toggleDescription);
      });

      // Add delete handlers (only if authenticated)
      if (isAuthenticated) {
        document.querySelectorAll(".sermon-actions .delete").forEach((btn) => {
          btn.addEventListener("click", handleDelete);
        });
      }
    } catch (error) {
      sermonsContainer.innerHTML =
        "<p class='loading'>Error loading sermons.</p>";
    }
  }

  function createSermonCard(sermon: Sermon): string {
    const date = new Date(sermon.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const duration = formatDuration(sermon.durationSeconds);
    const descriptionId = `desc-${sermon.id}`;
    const needsTruncation = sermon.description.length > 150;
    const tagsHtml =
      sermon.keywords && sermon.keywords.length > 0
        ? `<div class="sermon-tags">${sermon.keywords.map((tag: string) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
        : "";

    return `
    <div class="sermon-card">
      <h3>${escapeHtml(sermon.title)}</h3>
      <div class="sermon-meta">
        ${escapeHtml(sermon.speaker)} • ${date} • ${duration}
      </div>
      ${tagsHtml}
      <p class="sermon-description ${needsTruncation ? "collapsed" : ""}" id="${descriptionId}">
        ${escapeHtml(sermon.description)}
      </p>
      ${needsTruncation ? `<span class="read-more" data-target="${descriptionId}">Read more</span>` : ""}
      <audio controls src="${sermon.audioUrl}"></audio>
      ${
        isAuthenticated
          ? `
        <div class="sermon-actions">
          <button class="delete" data-id="${sermon.id}">Delete</button>
        </div>
      `
          : ""
      }
    </div>
  `;
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

  function toggleDescription(e: Event) {
    const btn = e.target as HTMLElement;
    const targetId = btn.dataset.target;
    const desc = document.getElementById(targetId!) as HTMLElement;

    if (desc.classList.contains("collapsed")) {
      desc.classList.remove("collapsed");
      desc.classList.add("expanded");
      btn.textContent = "Read less";
    } else {
      desc.classList.remove("expanded");
      desc.classList.add("collapsed");
      btn.textContent = "Read more";
    }
  }

  async function handleDelete(e: Event) {
    const btn = e.target as HTMLButtonElement;
    const id = btn.dataset.id;

    if (!id || !confirm("Are you sure you want to delete this sermon?")) {
      return;
    }

    try {
      const response = await fetch("/api/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        // Reload the page to refresh the list
        loadSermons();
      } else if (response.status === 401) {
        alert("Authentication failed. Redirecting to login...");
        window.location.href = "/index.html";
      } else {
        alert("Failed to delete sermon");
      }
    } catch (error) {
      alert("Error deleting sermon");
    }
  }

  // Initialize
  init();
})();
