import { EventConfig, Handlers } from "motia";

// Step 4: Refactor the title of the videos using AI
export const config: EventConfig = {
  name: "ErrorHandling",
  type: "event",
  subscribes: ["yt.videos.error", "yt.channel.error", "yt.ai.title.error"],
  emits: ["yt.error.notified"],
};

export const handler: Handlers["ErrorHandling"] = async (eventData: any, { emit, logger, state }: any) => {
  const data = eventData || {};
  const jobId = data.jobId;
  const email = data.email;
  const error = data.error;

  logger.error("Error handling", { jobId, email, error });

  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    if (!RESEND_FROM_EMAIL) {
      throw new Error("RESEND_FROM_EMAIL is not set");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_EMAIL} <${RESEND_FROM_EMAIL}>`,
        to: [email],
        subject: `Request failed for Youtube title refactoring`,
        html: `
          <p>Hello,</p>
          <p>The request for Youtube title refactoring failed with the following error:</p>
          <p>${error}</p>
          <p>Please check the request and try again.</p>
          <p>Thank you for using Youtube title refactoring.</p>
          <p>Powered by Motia.dev</p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorBody = await emailResponse.text();
      let errorMessage = `Failed to send email: ${emailResponse.status} ${emailResponse.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage += ` - ${JSON.stringify(errorJson)}`;
      } catch {
        errorMessage += ` - ${errorBody}`;
      }
      throw new Error(errorMessage);
    }

    const emailResult = await emailResponse.json();

    emit({
      topic: "yt.error.notified",
      data: {
        jobId,
        email,
        emailId: emailResult.id,
      },
    });
  } catch (error: any) {
    logger.error("Error sending error notification", { error });
  }
};
