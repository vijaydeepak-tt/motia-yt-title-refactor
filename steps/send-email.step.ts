import { EventConfig, Handlers } from "motia";

// Step 5: Send email to the user with the improved titles
export const config: EventConfig = {
  name: "SendEmail",
  type: "event",
  subscribes: ["yt.ai.title.ready"],
  emits: ["yt.email.sent"],
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

export const handler: Handlers["SendEmail"] = async (eventData: any, { emit, logger, state }: any) => {
  let jobId: string | undefined;

  try {
    const data = eventData || {};
    jobId = data.jobId;
    const email = data.email;
    const channelName = data.channelName;
    const improvedTitles = data.improvedTitles;

    logger.info("Sending email", { jobId, email, channelName, improvedTitlesCount: improvedTitles.length });

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    if (!RESEND_FROM_EMAIL) {
      throw new Error("RESEND_FROM_EMAIL is not set");
    }

    const jobDetails = await state.get("jobs", jobId);
    if (!jobDetails) {
      throw new Error("Job not found");
    }

    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "sending email",
    });

    const emailText = generateEmailText(channelName, improvedTitles);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_EMAIL} <${RESEND_FROM_EMAIL}>`,
        to: [email],
        subject: `Improved Titles for channel ${channelName}`,
        html: emailText,
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
    logger.info(`Email successfully sent to ${email}`);

    await state.set("jobs", jobId, {
      ...jobDetails,
      status: "completed",
      emailId: emailResult.id,
      completedAt: new Date().toISOString(),
    });

    emit({
      topic: "yt.email.sent",
      data: {
        jobId,
        email,
        channelName,
        improvedTitles,
      },
    });
  } catch (error: any) {
    logger.error("Error sending email", { error });

    if (!jobId) {
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
  }
};

function generateEmailText(channelName: string, titles: AIImprovedTitle[]): string {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        .video-section { margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #3498db; }
        .video-title { font-weight: bold; margin-bottom: 10px; }
        .original { color: #7f8c8d; text-decoration: line-through; }
        .improved { color: #27ae60; font-weight: bold; }
        .rationale { color: #555; font-style: italic; margin: 10px 0; }
        .video-link { color: #3498db; text-decoration: none; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #7f8c8d; text-align: center; }
      </style>
    </head>
    <body>
      <h1>YouTube Title Doctor - Improved Titles for ${channelName}</h1>
  `;

  titles.forEach((title, idx) => {
    html += `
      <div class="video-section">
        <div class="video-title">Video ${idx + 1}</div>
        <div class="original">Original Title: ${escapeHtml(title.original)}</div>
        <div class="improved">Improved Title: ${escapeHtml(title.improved)}</div>
        <div class="rationale">Why it's better: ${escapeHtml(title.rational)}</div>
        <div><a href="${escapeHtml(title.url)}" class="video-link">Watch the video →</a></div>
      </div>
    `;
  });

  html += `
      <div class="footer">
        <p>Thank you for using YouTube Title Doctor!</p>
        <p>Powered by Motia.dev</p>
      </div>
    </body>
    </html>
  `;

  return html;
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
