import type { Sermon } from "../shared/types";

(function () {
  // Get limit from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const limit = parseInt(urlParams.get("limit") || "5", 10);

  async function loadSermons() {
    const sermonsContainer = document.getElementById(
      "sermons-container",
    ) as HTMLElement;

    try {
      const response = await fetch(`/api/sermons?limit=${limit}`);
      const data = await response.json();

      if (data.sermons.length === 0) {
        sermonsContainer.innerHTML =
          "<p class='loading'>No sermons available.</p>";
        return;
      }

      sermonsContainer.innerHTML = data.sermons
        .map((sermon: Sermon) => createSermonCard(sermon))
        .join("");
    } catch (error) {
      sermonsContainer.innerHTML =
        "<p class='loading'>Error loading sermons.</p>";
    }
  }

  function createSermonCard(sermon: Sermon): string {
    const date = new Date(sermon.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const duration = formatDuration(sermon.durationSeconds);

    return `
    <div class="sermon-card">
      <h3>${escapeHtml(sermon.title)}</h3>
      <div class="sermon-meta">
        ${escapeHtml(sermon.speaker)} • ${date} • ${duration}
      </div>
      <p class="sermon-description">${escapeHtml(sermon.description)}</p>
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

  // Initial load
  loadSermons();
})();
