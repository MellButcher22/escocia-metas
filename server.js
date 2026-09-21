const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data", "users.json");
const MEMBERS_FILE = path.join(__dirname, "data", "membros.json");

// =====================================
// POSTGRESQL
// =====================================

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : null;

// =====================================
// EXPRESS
// =====================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:
    process.env.SESSION_SECRET ||
    "escocia-local-session-change-before-publish",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// =====================================
// USUÁRIOS
// =====================================

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

// =====================================
// LOGIN
// =====================================

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

// =====================================
// MEMBROS - ARQUIVO LOCAL
// =====================================

function ensureMembersFile() {
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

function readMembersFile() {
  ensureMembersFile();

  return JSON.parse(
    fs.readFileSync(MEMBERS_FILE, "utf8")
  );
}

// =====================================
// TABELA DE MEMBROS
// =====================================

async function ensureMembersTable() {
  if (!pool) {
    console.log(
      "DATABASE_URL não configurada. Usando arquivo local."
    );
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS membros (
      id BIGINT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  const result = await pool.query(
    "SELECT COUNT(*)::int AS total FROM membros"
  );

  const total = result.rows[0].total;

  if (total === 0) {
    const membros = readMembersFile();

    for (const membro of membros) {
      await pool.query(
        `
        INSERT INTO membros (id, data)
        VALUES ($1, $2)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          Number(membro.id),
          membro
        ]
      );
    }

    console.log(
      `Banco inicializado com ${membros.length} membros.`
    );
  }

  console.log("PostgreSQL conectado com sucesso.");
}

// =====================================
// LER MEMBROS
// =====================================

async function readMembers() {
  if (!pool) {
    return readMembersFile();
  }

  const result = await pool.query(
    "SELECT data FROM membros ORDER BY id"
  );

  return result.rows.map(
    row => row.data
  );
}

// =====================================
// CONFIGURAÇÕES DO PAINEL
// =====================================

async function ensureConfigTable() {
  if (!pool) {
    console.log(
      "DATABASE_URL não configurada para configurações."
    );
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  console.log("Tabela de configurações pronta.");
}

// =====================================
// LER CONFIGURAÇÕES
// =====================================

app.get("/api/config", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado."
      });
    }

    if (!pool) {
      return res.json({
        ok: true,
        config: null
      });
    }

    const result = await pool.query(
      "SELECT data FROM configuracoes WHERE id = 1"
    );

    if (result.rows.length === 0) {
      return res.json({
        ok: true,
        config: null
      });
    }

    res.json({
      ok: true,
      config: result.rows[0].data
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Erro ao carregar configurações."
    });
  }
});

// =====================================
// SALVAR CONFIGURAÇÕES
// =====================================

app.put("/api/config", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado."
      });
    }

    if (!pool) {
      return res.status(503).json({
        ok: false,
        error: "Banco de dados não configurado."
      });
    }

    const config = req.body;

    await pool.query(
      `
      INSERT INTO configuracoes (id, data)
      VALUES (1, $1)
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data
      `,
      [config]
    );

    res.json({
      ok: true,
      config
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Erro ao salvar configurações."
    });
  }
});

// =====================================
// VER MEMBROS
// =====================================

app.get("/api/membros", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado."
      });
    }

    const membros = await readMembers();

    res.json({
      ok: true,
      membros
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Erro ao carregar membros."
    });
  }
});

// =====================================
// ADICIONAR MEMBRO
// =====================================

app.post("/api/membros", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado."
      });
    }

    const novoMembro = {
      id: Date.now(),
      ...req.body
    };

    if (!pool) {
      const membros = readMembersFile();

      membros.push(novoMembro);

      fs.writeFileSync(
        MEMBERS_FILE,
        JSON.stringify(membros, null, 2),
        "utf8"
      );

      return res.json({
        ok: true,
        membro: novoMembro,
        membros
      });
    }

    await pool.query(
      `
      INSERT INTO membros (id, data)
      VALUES ($1, $2)
      `,
      [
        Number(novoMembro.id),
        novoMembro
      ]
    );

    const membros = await readMembers();

    res.json({
      ok: true,
      membro: novoMembro,
      membros
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Erro ao adicionar membro."
    });
  }
});

// =====================================
// EDITAR MEMBRO
// =====================================

app.put("/api/membros/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado."
      });
    }

    const id = Number(req.params.id);

    if (!pool) {
      const membros = readMembersFile();

      const index = membros.findIndex(
        membro => Number(membro.id) === id
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

      fs.writeFileSync(
        MEMBERS_FILE,
        JSON.stringify(membros, null, 2),
        "utf8"
      );

      return res.json({
        ok: true,
        membro: membros[index],
        membros
      });
    }

    const atual = await pool.query(
      "SELECT data FROM membros WHERE id = $1",
      [id]
    );

    if (atual.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Membro não encontrado."
      });
    }

    const membroAtual = atual.rows[0].data;

    const membroAtualizado = {
      ...membroAtual,
      ...req.body,
      id
    };

    await pool.query(
      `
      UPDATE membros
      SET data = $1
      WHERE id = $2
      `,
      [
        membroAtualizado,
        id
      ]
    );

    const membros = await readMembers();

    res.json({
      ok: true,
      membro: membroAtualizado,
      membros
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Erro ao editar membro."
    });
  }
});

// =====================================
// EXCLUIR MEMBRO
// =====================================

app.delete("/api/membros/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        ok: false,
        error: "Não autenticado."
      });
    }

    const id = Number(req.params.id);

    if (!pool) {
      const membros = readMembersFile();

      const quantidadeAntes = membros.length;

      const novosMembros = membros.filter(
        membro => Number(membro.id) !== id
      );

      if (novosMembros.length === quantidadeAntes) {
        return res.status(404).json({
          ok: false,
          error: "Membro não encontrado."
        });
      }

      fs.writeFileSync(
        MEMBERS_FILE,
        JSON.stringify(novosMembros, null, 2),
        "utf8"
      );

      return res.json({
        ok: true,
        membros: novosMembros
      });
    }

    const result = await pool.query(
      "DELETE FROM membros WHERE id = $1",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "Membro não encontrado."
      });
    }

    const membros = await readMembers();

    res.json({
      ok: true,
      membros
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Erro ao excluir membro."
    });
  }
});

// =====================================
// USUÁRIO LOGADO
// =====================================

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

// =====================================
// LOGOUT
// =====================================

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

// =====================================
// ÁREA ADMINISTRATIVA
// =====================================

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

// =====================================
// SITE
// =====================================

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

// =====================================
// INICIAR SERVIDOR
// =====================================

async function startServer() {
  try {
    ensureData();

    await ensureMembersTable();

    await ensureConfigTable();

    app.listen(PORT, () => {
      console.log(
        `Escócia - Entrega de Metas rodando em http://localhost:${PORT}`
      );
    });

  } catch (error) {
    console.error(
      "Erro ao iniciar o servidor:",
      error
    );

    process.exit(1);
  }
}

startServer();
