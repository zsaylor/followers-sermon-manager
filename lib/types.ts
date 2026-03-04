export interface Sermon {
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

export interface PodcastMeta {
  title: string;
  description: string;
  link: string;
  language: string;
  author: string;
  email: string;
  imageUrl: string;
  category: string;
  subcategory: string;
}

export interface SermonsData {
  sermons: Sermon[];
}
