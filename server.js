const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data", "users.json");
const MEMBERS_FILE = path.join(__dirname, "data", "membros.json");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "escocia-local-session-change-before-publish",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));


// ===============================
// USUÁRIOS
// ===============================

function ensureData() {
  const dir = path.dirname(DATA_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const users = [
      {
        id: 1,
        username: "gabi",
        name: "Gabi",
        role: "Administrador",
        passwordHash: bcrypt.hashSync("troque-esta-senha", 10)
      },
      {
        id: 2,
        username: "lider",
        name: "Líder da Escócia",
        role: "Administrador",
        passwordHash: bcrypt.hashSync("troque-esta-senha", 10)
      }
    ];

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(users, null, 2),
      "utf8"
    );
  }
}

function readUsers() {
  ensureData();

  return JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8")
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };
}


// ===============================
// LOGIN
// ===============================

app.post("/api/login", async (req, res) => {
  try {
    const username = String(
      req.body?.username || ""
    ).trim().toLowerCase();

    const password = String(
      req.body?.password || ""
    );

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error: "Usuário e senha são obrigatórios."
      });
    }

    const user = readUsers().find(
      u => u.username.toLowerCase() === username
    );

    if (
      !user ||
      !bcrypt.compareSync(password, user.passwordHash)
    ) {
      return res.status(401).json({
        ok: false,
        error: "Usuário ou senha inválidos."
      });
    }

    req.session.user = publicUser(user);

    return res.json({
      ok: true,
      user: req.session.user
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Erro interno no login."
    });
  }
});


// ===============================
// MEMBROS DA ESCÓCIA
// ===============================

function ensureMembers() {
  const dir = path.dirname(MEMBERS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(MEMBERS_FILE)) {
    fs.writeFileSync(
      MEMBERS_FILE,
      JSON.stringify([], null, 2),
      "utf8"
    );
  }
}

function readMembers() {
  ensureMembers();

  return JSON.parse(
    fs.readFileSync(MEMBERS_FILE, "utf8")
  );
}

function saveMembers(members) {
  ensureMembers();

  fs.writeFileSync(
    MEMBERS_FILE,
    JSON.stringify(members, null, 2),
    "utf8"
  );
}


// Ver todos os membros
app.get("/api/membros", (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      error: "Não autenticado."
    });
  }

  res.json({
    ok: true,
    membros: readMembers()
  });
});


// Adicionar membro
app.post("/api/membros", (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      error: "Não autenticado."
    });
  }

  const membros = readMembers();

  const novoMembro = {
    id: Date.now(),
    ...req.body
  };

  membros.push(novoMembro);

  saveMembers(membros);

  res.json({
    ok: true,
    membro: novoMembro,
    membros
  });
});


// Editar membro
app.put("/api/membros/:id", (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      error: "Não autenticado."
    });
  }

  const id = Number(req.params.id);

  const membros = readMembers();

  const index = membros.findIndex(
    membro => membro.id === id
  );

  if (index === -1) {
    return res.status(404).json({
      ok: false,
      error: "Membro não encontrado."
    });
  }

  membros[index] = {
    ...membros[index],
    ...req.body,
    id
  };

  saveMembers(membros);

  res.json({
    ok: true,
    membro: membros[index],
    membros
  });
});


// Excluir membro
app.delete("/api/membros/:id", (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      error: "Não autenticado."
    });
  }

  const id = Number(req.params.id);

  let membros = readMembers();

  const quantidadeAntes = membros.length;

  membros = membros.filter(
    membro => membro.id !== id
  );

  if (membros.length === quantidadeAntes) {
    return res.status(404).json({
      ok: false,
      error: "Membro não encontrado."
    });
  }

  saveMembers(membros);

  res.json({
    ok: true,
    membros
  });
});


// ===============================
// USUÁRIO LOGADO
// ===============================

app.get("/api/me", (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      user: null
    });
  }

  res.json({
    ok: true,
    user: req.session.user
  });
});


// ===============================
// LOGOUT
// ===============================

app.post("/api/logout", (req, res) => {

  req.session.destroy(() => {

    res.json({
      ok: true
    });

  });
});


// ===============================
// ÁREA ADMINISTRATIVA
// ===============================

app.get("/api/admin-only", (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      error: "Não autenticado."
    });
  }

  if (req.session.user.role !== "Administrador") {
    return res.status(403).json({
      ok: false,
      error: "Acesso negado."
    });
  }

  res.json({
    ok: true,
    message: "Acesso administrativo autorizado."
  });
});


// ===============================
// SITE
// ===============================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.get("*splat", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


// ===============================
// INICIAR
// ===============================

ensureData();
ensureMembers();

app.listen(PORT, () => {

  console.log(
    `Escócia - Entrega de Metas rodando em http://localhost:${PORT}`
  );

});
