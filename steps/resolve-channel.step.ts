import { EventConfig, EventHandler } from "motia";

// Step 2: Resolve the channel name to get the channel ID from the youtube data API
export const config: EventConfig = {
  name: "ResolveChannel",
  type: "event",
  subscribes: ["yt.submit"],
  emits: ["yt.channel.resolved", "yt.channel.error"],
};

const buildSearchUrl = (channel: string, apiKey: string) => {
  return `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
    channel
  )}&key=${apiKey}`;
};

const fetchChannelData = async (channel: string, apiKey: string) => {
  const searchUrl = buildSearchUrl(channel, apiKey);
  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();
  return searchData;
};

export const handler: EventHandler["ResolveChannel"] = async (eventData: any, { emit, logger, state }: any) => {
  let jobId: string | undefined;
  let email: string | undefined;

  try {
    const data = eventData || {};
    jobId = data.jobId;
    email = data.email;
    const channel = data.channel;

    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      throw new Error("YOUTUBE_API_KEY is not set");
    }

    const jobDetails = await state.get("jobs", jobId);
    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "resolving channel",
    });

    let channelId: string | null = null;
    let channelName: string = "";

    if (channel.startsWith("@")) {
      const handle = channel.slice(1);
      const searchData = await fetchChannelData(handle, YOUTUBE_API_KEY);

      if (searchData.items && searchData.items.length) {
        const item = searchData.items[0];
        channelId = item.id.channelId;
        channelName = item.snippet.title;
      }
    } else {
      const searchData = await fetchChannelData(channel, YOUTUBE_API_KEY);
      if (searchData.items && searchData.items.length) {
        const item = searchData.items[0];
        channelId = item.id.channelId;
        channelName = item.snippet.title;
      }
    }

    if (!channelId || !channelName) {
      logger.error("No channel found", { channelId, channelName });
      throw new Error("No channel found");
    }

    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "channel resolved",
      channelId,
      channelName,
    });

    emit({
      topic: "yt.channel.resolved",
      data: {
        jobId,
        email,
        channelId,
        channelName,
      },
    });
  } catch (error: any) {
    logger.error("Error resolving channel", { error });

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
      topic: "yt.channel.error",
      data: {
        jobId,
        email,
        error: error.message,
      },
    });
  }
};
