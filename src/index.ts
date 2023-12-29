import { config as setupEnv } from "dotenv";
setupEnv();

import fs from "fs";
import path from "path";
import express from "express";
import cookieParser from "cookie-parser";

if (!fs.existsSync(path.resolve("links.json"))) {
  fs.writeFileSync(path.resolve("links.json"), "[]", "utf-8");
}

const adminPassword = process.env.ADMIN_PASSWORD as string;

let sessionTokens = new Map<
  string,
  {
    createdAt: number;
    expiresAt: number;
  }
>();

const links = loadLinks();

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());

app.get("/admin", (req, res) => {
  if (!req.cookies.token) return res.redirect("/admin/login");
  const token = sessionTokens.get(req.cookies.token);

  if (!token) return res.redirect("/admin/login");

  if (token.expiresAt < Date.now()) {
    sessionTokens.delete(req.cookies.token);
    return res.redirect("/admin/login");
  }

  token.expiresAt = Date.now() + 3600000;
  sessionTokens.set(req.cookies.token, token);

  res.sendFile(path.resolve("assets/admin.html"));
});

app.get("/admin/login", (_req, res) => {
  res.sendFile(path.resolve("assets/login.html"));
});

app.post("/admin/login", express.urlencoded({ extended: true }), (req, res) => {
  if (!req.body.password) return res.redirect("/admin/login");
  if (req.body.password.trim() !== adminPassword.trim()) return res.redirect("/admin/login");

  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  sessionTokens.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  });

  res.setHeader("Set-Cookie", `token=${token}; Max-Age=3600;`).redirect("/admin");
});

app.get("/admin/links", (req, res) => {
  if (!req.cookies.token) return res.sendStatus(401);
  const token = sessionTokens.get(req.cookies.token);
  if (!token) return res.sendStatus(401);

  if (token.expiresAt < Date.now()) {
    sessionTokens.delete(req.cookies.token);
    return res.sendStatus(401);
  }

  res.json(Array.from(links.entries()).map(([id, link]) => ({ id, ...link })));
});

app.post("/admin/links", express.urlencoded({ extended: true }), (req, res) => {
  if (!req.cookies.token) return res.redirect("/admin/login");
  const token = sessionTokens.get(req.cookies.token);
  if (!token) return res.redirect("/admin/login");

  if (token.expiresAt < Date.now()) {
    sessionTokens.delete(req.cookies.token);
    return res.redirect("/admin/login");
  }

    if (!req.body.url) return res.sendStatus(400);
    if (!req.body.id) return res.sendStatus(400);

    links.set(req.body.id, {
        url: req.body.url,
        createdAt: Date.now(),
        uses: 0,
    });

    saveLinks();

    res.sendStatus(200);
});

app.post("/admin/links/:id", (req, res) => {
  if (!req.cookies.token) return res.redirect("/admin/login");
  const token = sessionTokens.get(req.cookies.token);
  if (!token) return res.redirect("/admin/login");

  if (token.expiresAt < Date.now()) {
      sessionTokens.delete(req.cookies.token);
      return res.redirect("/admin/login");
  }

  if (!req.params.id) return res.sendStatus(400);
  if (!req.body.url) return res.sendStatus(400);

  const link = links.get(req.params.id);

  if (!link) return res.sendStatus(404);

  links.set(req.params.id, {
      url: req.body.url,
      createdAt: link.createdAt,
      uses: link.uses,
  });
  
  saveLinks();

  res.sendStatus(200);
});

app.delete("/admin/links/:id", (req, res) => {
    if (!req.cookies.token) return res.redirect("/admin/login");
    const token = sessionTokens.get(req.cookies.token);
    if (!token) return res.redirect("/admin/login");

    if (token.expiresAt < Date.now()) {
        sessionTokens.delete(req.cookies.token);
        return res.redirect("/admin/login");
    }

    if (!req.params.id) return res.sendStatus(400);

    links.delete(req.params.id);
    
    saveLinks();

    res.sendStatus(200);
});

app.get("/", (_req, res) => {
  res.redirect(process.env.FALLBACK_URL as string);
});

app.get("/:id", (req, res) => {
  if (!req.params.id) return res.redirect(process.env.FALLBACK_URL as string);
  const link = links.get(req.params.id);
  if (!link) return res.redirect(process.env.FALLBACK_URL as string);

  res.redirect(link.url);

  links.set(req.params.id, {
    ...link,
    uses: link.uses + 1,
  });

  saveLinks();
});

app.listen(process.env.PORT || 3000);

setInterval(() => {
  const now = Date.now();
  sessionTokens.forEach((token, key) => {
    if (token.expiresAt < now) {
      sessionTokens.delete(key);
    }
  });
}, 3600000);

function loadLinks() {
  const linkFile = fs.readFileSync(path.resolve("links.json"), "utf-8");
  const linkData = JSON.parse(linkFile) as {
    id: string;
    url: string;
    createdAt: number;
    uses: number;
  }[];

  const links = new Map<
    string,
    {
      url: string;
      createdAt: number;
      uses: number;
    }
  >();

  for (const link of linkData) {
    links.set(link.id, link);
  }

  return links;
}

function saveLinks() {
  const data = Array.from(links.entries()).map(([id, link]) => ({
    id,
    url: link.url,
    createdAt: link.createdAt,
    uses: link.uses,
  }));

  fs.writeFileSync(path.resolve("links.json"), JSON.stringify(data, null, 2), "utf-8");
}
