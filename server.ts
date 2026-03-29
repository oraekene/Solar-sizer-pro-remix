import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Setup ---
const db = new Database("solar_sizer.db");
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    picture TEXT,
    provider TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    region TEXT,
    battery_preference TEXT,
    devices TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    profile_name TEXT,
    data TEXT, -- JSON string containing the full SavedResult object
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS hardware (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT, -- 'inverter', 'panel', 'battery'
    data TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy is required for correct host/protocol detection in Cloud Run
  app.set('trust proxy', true);

  app.use(express.json());
  app.use(
    cookieSession({
      name: "session",
      keys: [process.env.SESSION_SECRET || "solar-sizer-secret"],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "none",
      secure: true,
      httpOnly: true,
    })
  );

  const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  // --- OAuth Configuration ---
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  // --- Auth Routes ---

  app.get("/api/auth/user", (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // Google OAuth
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google Client ID not configured" });
    }
    const origin = req.query.origin as string || APP_URL;
    const state = Buffer.from(JSON.stringify({ origin })).toString("base64");
    
    // The redirect URI must be exactly what's registered in Google Console
    // We'll use the current host to match the request
    const currentHost = req.get("host") || "";
    const protocol = currentHost.includes("localhost") ? "http" : "https";
    const redirectUri = `${protocol}://${currentHost}/api/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state: state,
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      let origin = APP_URL;
      if (state) {
        try {
          const decodedState = JSON.parse(Buffer.from(state as string, "base64").toString());
          if (decodedState.origin) origin = decodedState.origin;
        } catch (e) {
          console.error("Failed to parse state:", e);
        }
      }

      const currentHost = req.get("host") || "";
      const protocol = currentHost.includes("localhost") ? "http" : "https";
      const redirectUri = `${protocol}://${currentHost}/api/auth/google/callback`;

      const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).catch(err => {
        console.error("Google Token Exchange Error:", err.response?.data || err.message);
        console.error("Sent Redirect URI:", redirectUri);
        throw err;
      });

      const { access_token } = tokenResponse.data;
      const userResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const userData = userResponse.data;
      
      // Upsert user in database
      const upsertUser = db.prepare(`
        INSERT INTO users (id, email, name, picture, provider)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          picture = excluded.picture
      `);
      upsertUser.run(userData.sub, userData.email, userData.name, userData.picture, "google");

      req.session!.user = {
        id: userData.sub,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        provider: "google",
      };

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google Auth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  // --- User Data Routes ---

  // Middleware to check auth
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.get("/api/user/data", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    
    const profiles = db.prepare("SELECT * FROM profiles WHERE user_id = ?").all(userId);
    const results = db.prepare("SELECT * FROM results WHERE user_id = ?").all(userId);
    const hardware = db.prepare("SELECT * FROM hardware WHERE user_id = ?").all(userId);

    res.json({
      profiles: profiles.map((p: any) => ({ ...p, devices: JSON.parse(p.devices) })),
      results: results.map((r: any) => ({ ...r, ...JSON.parse(r.data) })),
      hardware: hardware.map((h: any) => ({ ...h, ...JSON.parse(h.data) }))
    });
  });

  app.post("/api/user/profiles", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const { id, name, region, battery_preference, devices } = req.body;

    const upsert = db.prepare(`
      INSERT INTO profiles (id, user_id, name, region, battery_preference, devices)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        region = excluded.region,
        battery_preference = excluded.battery_preference,
        devices = excluded.devices
    `);
    upsert.run(id, userId, name, region, battery_preference, JSON.stringify(devices));
    res.json({ success: true });
  });

  app.post("/api/user/results", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const { id, profile_name, ...data } = req.body;

    const insert = db.prepare(`
      INSERT INTO results (id, user_id, profile_name, data)
      VALUES (?, ?, ?, ?)
    `);
    insert.run(id, userId, profile_name, JSON.stringify(data));
    res.json({ success: true });
  });

  app.post("/api/user/hardware", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const { id, type, ...data } = req.body;

    const upsert = db.prepare(`
      INSERT INTO hardware (id, user_id, type, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data
    `);
    upsert.run(id, userId, type, JSON.stringify(data));
    res.json({ success: true });
  });

  app.delete("/api/user/:type/:id", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const { type, id } = req.params;

    let table = "";
    if (type === "profile") table = "profiles";
    else if (type === "result") table = "results";
    else if (type === "hardware") table = "hardware";

    if (!table) return res.status(400).json({ error: "Invalid type" });

    const del = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`);
    del.run(id, userId);
    res.json({ success: true });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
