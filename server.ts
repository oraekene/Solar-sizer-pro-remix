import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  const APP_URL = process.env.APP_URL || "http://localhost:3000";

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
    const redirectUri = `${APP_URL}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const redirectUri = `${APP_URL}/api/auth/google/callback`;
      const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const { access_token } = tokenResponse.data;
      const userResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const userData = userResponse.data;
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
