// OJT Activity Tracker - Backend Server
// This is my main server file where all the routes are

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");
const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");
const stream = require("stream");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// middleware setup
app.use(cors());
app.use(express.json());

// database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.connect()
  .then(() => console.log("connected to database"))
  .catch(err => console.log("db error:", err));

// google api setup for drive and calendar
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: "v3", auth: oauth2Client });
const calendar = google.calendar({ version: "v3", auth: oauth2Client });
const googleSignInClient = new OAuth2Client(process.env.GOOGLE_AUTH_CLIENT_ID);

// file upload setup
const upload = multer({ storage: multer.memoryStorage() });

// email setup for reminders
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

function getNotificationEmail(username) {
  if (!username) return null;
  const email = String(username).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function parseDriveLinks(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (err) {
      console.log("could not parse drive links json:", err.message);
    }
  }

  return [trimmed];
}

function formatDriveLinksForStorage(links) {
  const cleanLinks = (links || []).filter(Boolean);
  if (cleanLinks.length === 0) return null;
  return cleanLinks.length === 1 ? cleanLinks[0] : JSON.stringify(cleanLinks);
}

function getUploadedFiles(req) {
  if (req.files?.files?.length) return req.files.files;
  if (req.files?.file?.length) return req.files.file;
  if (req.file) return [req.file];
  return [];
}

// helper function to check if user is logged in
function checkAuth(req, res, next) {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log(err);
    res.status(401).json({ error: "Invalid token" });
  }
}

// helper function to upload file to google drive
async function uploadToDrive(file) {
  try {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    const result = await drive.files.create({
      requestBody: {
        name: Date.now() + "_" + file.originalname,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: { mimeType: file.mimetype, body: bufferStream },
      fields: "id, webViewLink",
    });

    // make file public
    await drive.permissions.create({
      fileId: result.data.id,
      requestBody: { role: "reader", type: "anyone" },
    });

    console.log("file uploaded to drive");
    return result.data.webViewLink;
  } catch (err) {
    console.log("drive upload error:", err);
    return null;
  }
}

// helper function to sync task to google calendar
async function syncToCalendar(task, existingEventId, attendeeEmail) {
  try {
    const event = {
      summary: "OJT Task: " + task.title,
      description: task.description,
      start: { dateTime: new Date(task.deadline).toISOString() },
      end: { dateTime: new Date(new Date(task.deadline).getTime() + 3600000).toISOString() },
    };
    if (attendeeEmail) {
      event.attendees = [{ email: attendeeEmail }];
    }

    if (existingEventId) {
      const res = await calendar.events.update({
        calendarId: "primary",
        eventId: existingEventId,
        requestBody: event,
        sendUpdates: "all",
      });
      return res.data.id;
    }

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      sendUpdates: "all",
    });
    console.log("event added to calendar");
    return res.data.id;
  } catch (err) {
    console.log("calendar error:", err);
    return existingEventId || null;
  }
}

// helper function to send email notification immediately
async function sendEmailNotification(task, subject, recipientEmail) {
  if (!recipientEmail) {
    console.log("skipping email, user has no valid email:", task.user_id || "unknown");
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: subject,
      html: `<p>Task "<b>${task.title}</b>" has been created!</p>
             <p>Description: ${task.description}</p>
             <p>Deadline: ${new Date(task.deadline).toLocaleString()}</p>`,
    });
    console.log("email sent for task:", task.title);
  } catch (err) {
    console.log("email error:", err);
  }
}

// ==================== AUTH ROUTES ====================

// signup route
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
      [username, hashedPassword]
    );

    console.log("new user created");
    res.status(201).json({ message: "User created!", user: result.rows[0] });
  } catch (err) {
    console.log(err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// login route
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // find user in db
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // create token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    console.log("user logged in:", username);
    res.json({ token, username: user.username });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// google login route
app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: "Missing Google token" });
    }

    const ticket = await googleSignInClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_AUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || payload.email_verified !== true) {
      return res.status(400).json({ error: "Google account is not verified" });
    }

    const username = payload.email;
    let result = await pool.query("SELECT id, username FROM users WHERE username = $1", [username]);

    if (result.rows.length === 0) {
      const randomPassword = await bcrypt.hash("google_" + payload.sub + "_" + Date.now(), 10);
      result = await pool.query(
        "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
        [username, randomPassword]
      );
    }

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, username: user.username });
  } catch (err) {
    console.log("google login error:", err);
    res.status(401).json({ error: "Google login failed" });
  }
});

// ==================== ACTIVITY ROUTES ====================

// get all tasks for user
app.get("/api/activities", checkAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // get tasks from db
    const result = await pool.query(
      "SELECT * FROM activities WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [req.user.id, limit, offset]
    );

    // get total count for pagination
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM activities WHERE user_id = $1",
      [req.user.id]
    );

    const total = parseInt(countResult.rows[0].count);

    res.json({
      activities: result.rows,
      page: page,
      totalPages: Math.ceil(total / limit),
      totalCount: total,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// create new task
app.post("/api/activities", checkAuth, upload.fields([{ name: "files", maxCount: 10 }, { name: "file", maxCount: 1 }]), async (req, res) => {
  try {
    const { title, description, deadline } = req.body;
    const userId = req.user.id;
    const userResult = await pool.query("SELECT username FROM users WHERE id = $1", [userId]);
    const recipientEmail = getNotificationEmail(userResult.rows[0]?.username);

    // upload file to drive if there is one
    const uploadedFiles = getUploadedFiles(req);
    const driveLinks = [];
    for (const file of uploadedFiles) {
      const link = await uploadToDrive(file);
      if (link) driveLinks.push(link);
    }
    const driveLink = formatDriveLinksForStorage(driveLinks);

    // sync to calendar if there is deadline
    let calendarEventId = null;
    if (deadline) {
      calendarEventId = await syncToCalendar({ title, description, deadline }, null, recipientEmail);
      
      // send email notification immediately when task with deadline is created
      sendEmailNotification({ title, description, deadline, user_id: userId }, "New Task Created with Deadline", recipientEmail);
    }

    // save to database
    const result = await pool.query(
      `INSERT INTO activities (title, description, drive_link, deadline, google_calendar_event_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description, driveLink, deadline, calendarEventId, userId]
    );

    console.log("task created:", title);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// update task
app.put("/api/activities/:id", checkAuth, upload.fields([{ name: "files", maxCount: 10 }, { name: "file", maxCount: 1 }]), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline } = req.body;
    const userId = req.user.id;
    const userResult = await pool.query("SELECT username FROM users WHERE id = $1", [userId]);
    const recipientEmail = getNotificationEmail(userResult.rows[0]?.username);

    // check if task belongs to user
    const current = await pool.query(
      "SELECT * FROM activities WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const existing = current.rows[0];

    // handle file upload
    let driveLinks = parseDriveLinks(existing.drive_link);
    const uploadedFiles = getUploadedFiles(req);
    for (const file of uploadedFiles) {
      const link = await uploadToDrive(file);
      if (link) driveLinks.push(link);
    }
    const driveLink = formatDriveLinksForStorage(driveLinks);

    // sync calendar
    let calendarId = existing.google_calendar_event_id;
    if (deadline) {
      calendarId = await syncToCalendar({ title, description, deadline }, existing.google_calendar_event_id, recipientEmail);
    }

    // update in database
    const result = await pool.query(
      `UPDATE activities SET title=$1, description=$2, drive_link=$3, deadline=$4,
       google_calendar_event_id=$5, reminder_sent=FALSE, deadline_alert_sent=FALSE
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [title, description, driveLink, deadline, calendarId, id, userId]
    );

    console.log("task updated:", title);
    res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// delete task
app.delete("/api/activities/:id", checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // check if task exists and belongs to user
    const current = await pool.query(
      "SELECT * FROM activities WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    
    if (current.rows.length === 0) {
      return res.status(403).json({ error: "Cannot delete this task" });
    }

    // delete from calendar if it was synced
    const eventId = current.rows[0].google_calendar_event_id;
    if (eventId) {
      try {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: eventId,
        });
        console.log("deleted from calendar");
      } catch (err) {
        console.log("could not delete calendar event:", err);
      }
    }

    // delete from database
    await pool.query("DELETE FROM activities WHERE id = $1 AND user_id = $2", [id, userId]);
    
    console.log("task deleted");
    res.json({ message: "Deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ==================== SCHEDULER FOR EMAIL REMINDERS ====================

// check every 5 minutes for upcoming deadlines
cron.schedule("*/5 * * * *", async () => {
  console.log("checking for deadlines...");
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    // find tasks with deadline in next 24 hours that havent been reminded
    const reminders = await pool.query(
      `SELECT a.*, u.username FROM activities a 
       JOIN users u ON a.user_id = u.id
       WHERE a.deadline <= $1 AND a.deadline > $2 AND a.reminder_sent = FALSE`,
      [tomorrow, now]
    );

    for (const task of reminders.rows) {
      try {
        const recipientEmail = getNotificationEmail(task.username);
        if (!recipientEmail) {
          await pool.query("UPDATE activities SET reminder_sent = TRUE WHERE id = $1", [task.id]);
          console.log("skipping reminder email, user has no valid email:", task.username);
          continue;
        }

        // send email reminder
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: recipientEmail,
          subject: "Upcoming Deadline Reminder",
          html: `<p>Task "<b>${task.title}</b>" is due soon!</p>
                 <p>Deadline: ${new Date(task.deadline).toLocaleString()}</p>`,
        });

        // mark as reminded
        await pool.query("UPDATE activities SET reminder_sent = TRUE WHERE id = $1", [task.id]);
        console.log("sent reminder for:", task.title);
      } catch (err) {
        console.log("email error:", err);
      }
    }

    // find tasks that are past deadline
    const alerts = await pool.query(
      `SELECT a.*, u.username FROM activities a 
       JOIN users u ON a.user_id = u.id
       WHERE a.deadline <= $1 AND a.deadline_alert_sent = FALSE`,
      [now]
    );

    for (const task of alerts.rows) {
      try {
        const recipientEmail = getNotificationEmail(task.username);
        if (!recipientEmail) {
          await pool.query("UPDATE activities SET deadline_alert_sent = TRUE WHERE id = $1", [task.id]);
          console.log("skipping deadline alert email, user has no valid email:", task.username);
          continue;
        }

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: recipientEmail,
          subject: "DEADLINE REACHED: " + task.title,
          html: `<p>Task "<b>${task.title}</b>" has reached its deadline!</p>`,
        });

        await pool.query("UPDATE activities SET deadline_alert_sent = TRUE WHERE id = $1", [task.id]);
        console.log("sent deadline alert for:", task.title);
      } catch (err) {
        console.log("email error:", err);
      }
    }
  } catch (err) {
    console.log("scheduler error:", err);
  }
});

// start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
