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
  }

  let currentPage = 1;
  const limit = 10;
  let hasMore = true;

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

    return `
    <div class="sermon-card">
      <h3>${escapeHtml(sermon.title)}</h3>
      <div class="sermon-meta">
        ${escapeHtml(sermon.speaker)} • ${date} • ${duration}
      </div>
      <p class="sermon-description ${needsTruncation ? "collapsed" : ""}" id="${descriptionId}">
        ${escapeHtml(sermon.description)}
      </p>
      ${needsTruncation ? `<span class="read-more" data-target="${descriptionId}">Read more</span>` : ""}
      <audio controls src="${sermon.audioUrl}"></audio>
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

  const loadMoreBtn = document.getElementById("load-more") as HTMLButtonElement;
  loadMoreBtn.addEventListener("click", () => {
    currentPage++;
    loadSermons(currentPage, true);
  });

  // Initial load
  loadSermons();
})();
