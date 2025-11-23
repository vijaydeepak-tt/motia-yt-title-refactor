import { EventConfig, Handlers } from "motia";
import OpenAI from "openai";

// Step 4: Refactor the title of the videos using AI
export const config: EventConfig = {
  name: "AiTitleRefactor",
  type: "event",
  subscribes: ["yt.videos.retrieved"],
  emits: ["yt.ai.title.ready", "yt.ai.title.error"],
};

interface Video {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
  thumbnailUrl: string;
}

interface AIImprovedTitle {
  original: string;
  improved: string;
  rational: string;
  url: string;
}

export const handler: Handlers["AiTitleRefactor"] = async (eventData: any, { emit, logger, state }: any) => {
  let jobId: string | undefined;
  let email: string | undefined;

  try {
    const data = eventData || {};
    jobId = data.jobId;
    email = data.email;
    const channelName = data.channelName;
    const videos = data.videos;

    logger.info("Refactoring title", { jobId, videosCount: videos.length, channelName });

    const GIMINI_API_KEY = process.env.GIMINI_API_KEY;
    if (!GIMINI_API_KEY) {
      throw new Error("GIMINI_API_KEY is not set");
    }
    // Gemini API requires API key as query parameter, not Authorization header
    const openai = new OpenAI({
      apiKey: GIMINI_API_KEY,
      baseURL: `https://generativelanguage.googleapis.com/v1beta/openai`,
    });

    const jobDetails = await state.get("jobs", jobId);
    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "refactoring titles",
    });

    const videoTitles = videos.map((video: Video, idx: number) => `${idx + 1}. "${video.title}"`).join("\n");
    const prompt = `
    You are a youtube title optimization expert. Below are ${videos.length} video titles from the channel "${channelName}".
    For each video title, provided:
    1. An improved veersion that is more engaging, SEO-friendly, and likely to get more clicks.
    2. A brief rationale (1-2 sentences) explaining why the improved title is better.

    Guidelines:
    - Keep the code topic and authenticity
    - Use action verbs, numbers, and specific value propositions
    - Make it curiosity-including without being clickbait
    - Optimize for searchability and clarity

    Video titles:
    ${videoTitles}

    Respond in JSON format:
    {
     "titles": [
      {
        "original": "string",
        "improved": "string",
        "rational": "string",
      }
     ]
    }
    `;

    const response = await openai.chat.completions
      .create({
        model: "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a youtube SEO and Engagement expert who helps creators write better video titles. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      })
      .catch((error: any) => {
        logger.error("Error calling Gemini API", { error });
        throw new Error("Error calling Gemini API");
      });

    const titlesContent = response.choices[0]?.message?.content;
    if (!titlesContent) {
      throw new Error("No titles returned");
    }

    const parserContent = JSON.parse(titlesContent);
    if (!parserContent.titles || !Array.isArray(parserContent.titles)) {
      throw new Error("Invalid response format: missing titles array");
    }

    const improvedTitles = parserContent.titles.map((title: AIImprovedTitle, idx: number) => ({
      original: title.original,
      improved: title.improved,
      rational: title.rational,
      url: videos[idx].url,
    }));

    logger.info("Improved titles generated successfully", { count: improvedTitles.length });

    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "titles refactored",
      improvedTitles,
    });

    emit({
      topic: "yt.ai.title.ready",
      data: {
        jobId,
        email,
        channelName,
        improvedTitles,
      },
    });
  } catch (error: any) {
    logger.error("Error refactoring title", { error });

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
      topic: "yt.ai.title.error",
      data: {
        jobId,
        email,
        error: error.message,
      },
    });
  }
};
