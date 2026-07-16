import crypto from "node:crypto";

const CONFIG = {
  projectId: getRequiredEnv("FIREBASE_PROJECT_ID"),
  clientEmail: getRequiredEnv("FIREBASE_CLIENT_EMAIL"),
  privateKey: normalizePrivateKey(getRequiredEnv("FIREBASE_PRIVATE_KEY")),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "",
  timeZone: process.env.TIME_ZONE || "Asia/Ho_Chi_Minh",
  newTaskLookbackHours: Number(process.env.NEW_TASK_LOOKBACK_HOURS || 24),
  dueSoonDays: Number(process.env.DUE_SOON_DAYS || 2),
  sendEmailAlso: process.env.SEND_EMAIL_ALSO === "true",
};

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents`;
const TODAY = toDateKey(new Date(), CONFIG.timeZone);

main().catch((error) => {
  console.error("Notification job failed", error);
  process.exit(1);
});

async function main() {
  const accessToken = await getAccessToken();
  const [users, tasks] = await Promise.all([
    listCollection(accessToken, "users"),
    queryIncompleteTasks(accessToken),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const alerts = tasks.flatMap((task) => buildAlerts(task, usersById.get(task.assigneeId)));

  if (!alerts.length) {
    console.log("No task notifications to send.");
    return;
  }

  let sentCount = 0;
  let skippedCount = 0;

  for (const alert of alerts) {
    const alreadySent = await documentExists(accessToken, `notifications/${alert.id}`);
    if (alreadySent) {
      skippedCount += 1;
      continue;
    }

    const sentChannels = await sendAlert(alert);
    if (!sentChannels.length) {
      skippedCount += 1;
      console.log(`Skipped ${alert.id}: missing Telegram chat id or email configuration.`);
      continue;
    }

    await saveNotificationLog(accessToken, alert, sentChannels);
    sentCount += 1;
    console.log(`Sent ${alert.id} via ${sentChannels.join(", ")}.`);
  }

  console.log(`Done. Sent: ${sentCount}. Skipped: ${skippedCount}.`);
}

function buildAlerts(task, assignee) {
  if (!assignee || Number(task.progress || 0) >= 100) {
    return [];
  }

  const alerts = [];
  const daysRemaining = getDaysRemaining(task.dueDate);
  const createdAt = task.createdAt ? new Date(task.createdAt) : null;
  const createdHoursAgo = createdAt ? (Date.now() - createdAt.getTime()) / 36e5 : Infinity;

  if (createdHoursAgo <= CONFIG.newTaskLookbackHours) {
    alerts.push(createAlert("new-task", task, assignee, "Nhiệm vụ mới"));
  }

  if (daysRemaining >= 0 && daysRemaining <= CONFIG.dueSoonDays) {
    alerts.push(createAlert("due-soon", task, assignee, "Nhiệm vụ sắp hết hạn", TODAY));
  }

  if (daysRemaining < 0) {
    alerts.push(createAlert("overdue", task, assignee, "Nhiệm vụ quá hạn", TODAY));
  }

  return alerts;
}

function createAlert(type, task, assignee, title, dateKey = "") {
  const suffix = dateKey ? `_${dateKey}` : "";
  const progress = Number(task.progress || 0);
  const messageLines = [
    `[QLCV] ${title}`,
    `Công việc: ${task.title}`,
    `Người phụ trách: ${assignee.name || assignee.username || assignee.id}`,
    `Hạn hoàn thành: ${formatVietnameseDate(task.dueDate)}`,
    `Tiến độ: ${progress}%`,
  ];

  if (task.description) {
    messageLines.push(`Mô tả: ${task.description}`);
  }

  return {
    id: `${task.id}_${type}${suffix}`,
    type,
    task,
    assignee,
    title,
    message: messageLines.join("\n"),
  };
}

async function sendAlert(alert) {
  const sentChannels = [];
  const hasTelegram = Boolean(CONFIG.telegramBotToken && alert.assignee.telegramChatId);

  if (hasTelegram) {
    await sendTelegram(alert.assignee.telegramChatId, alert.message);
    sentChannels.push("telegram");
  }

  const shouldSendEmail = CONFIG.sendEmailAlso || !hasTelegram;
  if (shouldSendEmail && CONFIG.sendgridApiKey && CONFIG.emailFrom && alert.assignee.email) {
    await sendEmail(alert.assignee.email, alert.title, alert.message);
    sentChannels.push("email");
  }

  return sentChannels;
}

async function sendTelegram(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
  }
}

async function sendEmail(to, subject, text) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: CONFIG.emailFrom },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Email send failed: ${response.status} ${await response.text()}`);
  }
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: CONFIG.clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claim}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), CONFIG.privateKey);
  const assertion = `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google auth failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.access_token;
}

async function queryIncompleteTasks(accessToken) {
  const response = await firestoreFetch(accessToken, `${FIRESTORE_BASE_URL}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "tasks" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "progress" },
            op: "LESS_THAN",
            value: { integerValue: 100 },
          },
        },
      },
    }),
  });
  const rows = await response.json();
  return rows
    .filter((row) => row.document)
    .map((row) => decodeDocument(row.document));
}

async function listCollection(accessToken, collectionId) {
  const response = await firestoreFetch(accessToken, `${FIRESTORE_BASE_URL}/${collectionId}?pageSize=300`);
  const payload = await response.json();
  return (payload.documents || []).map(decodeDocument);
}

async function documentExists(accessToken, path) {
  const response = await fetch(`${FIRESTORE_BASE_URL}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Firestore get failed: ${response.status} ${await response.text()}`);
  }

  return true;
}

async function saveNotificationLog(accessToken, alert, sentChannels) {
  const now = new Date().toISOString();
  await firestoreFetch(accessToken, `${FIRESTORE_BASE_URL}/notifications/${alert.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: encodeObject({
        id: alert.id,
        type: alert.type,
        taskId: alert.task.id,
        taskTitle: alert.task.title,
        assigneeId: alert.assignee.id,
        assigneeName: alert.assignee.name || alert.assignee.username || alert.assignee.id,
        channels: sentChannels.join(","),
        message: alert.message,
        sentAt: now,
        createdAt: now,
      }),
    }),
  });
}

async function firestoreFetch(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Firestore request failed: ${response.status} ${await response.text()}`);
  }

  return response;
}

function decodeDocument(document) {
  const fields = Object.fromEntries(
    Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)]),
  );
  return {
    id: document.name.split("/").pop(),
    ...fields,
  };
}

function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nestedValue]) => [key, decodeValue(nestedValue)]),
    );
  }
  return undefined;
}

function encodeObject(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, encodeValue(value)]),
  );
}

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeObject(value) } };
  return { stringValue: String(value) };
}

function getDaysRemaining(dueDate) {
  const due = Date.parse(`${dueDate}T00:00:00+07:00`);
  const today = Date.parse(`${TODAY}T00:00:00+07:00`);
  return Math.floor((due - today) / 86400000);
}

function formatVietnameseDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: CONFIG.timeZone,
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function toDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return value.replace(/\\n/g, "\n");
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
