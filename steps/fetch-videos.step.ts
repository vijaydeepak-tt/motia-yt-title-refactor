import { EventConfig, EventHandler } from "motia";

// Step 3: Retrieve the latest 5 videos from the channelID
export const config: EventConfig = {
  name: "RetrieveVideos",
  type: "event",
  subscribes: ["yt.channel.resolved"],
  emits: ["yt.videos.retrieved", "yt.videos.error"],
};

interface Video {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
  thumbnailUrl: string;
}

const buildVideosUrl = (channelId: string, apiKey: string) => {
  return `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=5&key=${apiKey}`;
};

const fetchVideos = async (channelId: string, apiKey: string) => {
  const videosUrl = buildVideosUrl(channelId, apiKey);
  const videosResponse = await fetch(videosUrl);
  const videosData = await videosResponse.json();
  return videosData;
};

export const handler: EventHandler["RetrieveVideos"] = async (eventData: any, { emit, logger, state }: any) => {
  let jobId: string | undefined;
  let email: string | undefined;

  try {
    const data = eventData || {};
    jobId = data.jobId;
    email = data.email;
    const channelId = data.channelId;
    const channelName = data.channelName;

    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      throw new Error("YOUTUBE_API_KEY is not set");
    }

    const jobDetails = await state.get("jobs", jobId);
    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "retrieving videos",
    });

    const videosData = await fetchVideos(channelId, YOUTUBE_API_KEY);

    if (!videosData.items || videosData.items.length === 0) {
      logger.error("No videos found", { videosData });
      throw new Error("No videos found");
    }

    const videos: Video[] = videosData.items.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails.default.url,
    }));

    logger.info("Videos retrieved", { jobId, videosCount: videos.length });

    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "videos retrieved",
      videos,
    });

    emit({
      topic: "yt.videos.retrieved",
      data: {
        jobId,
        email,
        channelId,
        channelName,
        videos,
      },
    });
  } catch (error: any) {
    logger.error("Error retrieving videos", { error });

    if (!jobId || !email) {
      logger.error("Cannot send error notification without job ID and email");
      return;
    }

    const jobDetails = await state.get("jobs", jobId);
    if (!jobDetails) {
      logger.error("Job not found");
      return;
    }

    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "failed",
      error: error.message,
    });

    emit({
      topic: "yt.videos.error",
      data: {
        jobId,
        email,
        error: error.message,
      },
    });
  }
};
