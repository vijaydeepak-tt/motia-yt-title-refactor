import { ApiRouteConfig, Handlers } from "motia";
import { v4 as uuidv4 } from "uuid";

// Step - 1: Accept the channel name and email to start the workflow
export const config: ApiRouteConfig = {
  name: "SubmitChannelName",
  type: "api",
  path: "/submit",
  method: "POST",
  emits: ["yt.submit"],
};

interface SubmitRequest {
  channel: string;
  email: string;
}

export const handler: Handlers["SubmitChannelName"] = async (req: any, { logger, emit, state }: any) => {
  try {
    const { channel, email } = req.body as SubmitRequest;
    logger.info("Submitting channel name", { channel, email });

    if (!channel || !email) {
      logger.error("Channel name and email are required", { channel, email });
      return {
        status: 400,
        body: {
          error: "Channel name and email are required",
        },
      };
    }

    // email validate
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      logger.error("Invalid email", { email });
      return {
        status: 400,
        body: {
          error: "Invalid email",
        },
      };
    }

    const jobId = uuidv4();
    logger.info("Job ID generated", { jobId });
    logger.info("Job data", { channel, email });
    await state.set("jobs", jobId, {
      jobId,
      channel,
      email: email.toLowerCase(),
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    logger.info("Job queued", { jobId, channel, email });

    emit({
      topic: "yt.submit",
      data: {
        jobId,
        channel,
        email,
      },
    });

    return {
      status: 201,
      body: {
        success: true,
        message: "Your request has been queued. You will receive an email with the results shortly.",
        jobId,
      },
    };
  } catch (error) {
    logger.error("Error submitting channel name", { error });
    return {
      status: 500,
      body: {
        error: "Internal server error",
      },
    };
  }
};
