import { env } from "cloudflare:workers";
import quizBank from "@/data/quizzes.json";
import courseCatalog from "@/data/course-catalog.json";

type Role = "learner" | "instructor" | "manager" | "admin";
type User = { id: string; email: string; display_name: string; role: Role; job_path: string | null };
type Row = Record<string, unknown>;
type QuizQuestion = { id: string; prompt: string; options: string[]; topic: string };
const quizVersion = "1.1";
const moduleWorkloads: Record<string, number> = Object.fromEntries(
  courseCatalog.modules.map((module) => [module.id, module.workloadMinutes]),
);
const courseModules = courseCatalog.modules as Array<{
  id: string;
  title: string;
  workloadMinutes: number;
  lessons: Array<{ id: string; title: string }>;
}>;
const allQuizModules = quizBank.modules as Array<{
  id: string;
  title: string;
  version: string;
  questions: QuizQuestion[];
}>;
const maxAttemptsPerCycle = 3;
const partSize = 5 * 1024 * 1024;
const practiceRubric = [
  "Compreensão do contexto",
  "Decisão e limites de atuação",
  "Uso da ferramenta",
  "Qualidade do registro",
  "Entrega para a próxima etapa",
];

function db() {
  if (!env.DB) throw new Error("O banco compartilhado ainda não foi provisionado.");
  return env.DB;
}

function bucket() {
  if (!env.BUCKET) throw new Error("O armazenamento de arquivos ainda não foi provisionado.");
  return env.BUCKET;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function text(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  } catch {
    return fallback;
  }
}

function decodeName(request: Request) {
  const value = request.headers.get("oai-authenticated-user-full-name") ?? "";
  if (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try {
      return decodeURIComponent(value).trim();
    } catch {
      return "";
    }
  }
  return value.trim();
}

async function currentUser(request: Request): Promise<User | null> {
  const id = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!id || !email) return null;
  const displayName = decodeName(request) || email;
  const now = new Date().toISOString();
  const isAdmin = Boolean(env.ACADEMY_ADMIN_EMAIL && email === env.ACADEMY_ADMIN_EMAIL.trim().toLowerCase());
  await db()
    .prepare(
      `INSERT INTO users (id,email,display_name,role,created_at,updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at`,
    )
    .bind(id, email, displayName, isAdmin ? "admin" : "learner", now, now)
    .run();
  if (isAdmin) {
    await db()
      .prepare("UPDATE users SET role='admin', updated_at=? WHERE id=?")
      .bind(now, id)
      .run();
  }
  return await db().prepare("SELECT id,email,display_name,role,job_path FROM users WHERE id=?").bind(id).first<User>();
}

async function requireUser(request: Request) {
  const user = await currentUser(request);
  return user ? { user } : { response: json({ error: "Entre com sua conta ChatGPT para continuar." }, 401) };
}

async function requireRole(request: Request, allowed: Role[]) {
  const result = await requireUser(request);
  if ("response" in result) return result;
  if (!allowed.includes(result.user.role)) {
    return { response: json({ error: "Seu perfil não tem acesso a esta área." }, 403) };
  }
  return result;
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).origin === new URL(request.url).origin;
}

function moduleById(moduleId: string) {
  return courseModules.find((module) => module.id === moduleId);
}

function quizById(moduleId: string) {
  return allQuizModules.find((module) => module.id === moduleId);
}

function cleanUrl(value: unknown) {
  const candidate = text(value, 2000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function fileUrl(id: string) {
  return `/api/files/${encodeURIComponent(id)}`;
}

async function appSetting(key: string, fallback: string) {
  const result = await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>();
  return result?.value ?? fallback;
}

async function eligibility(userId: string, moduleId: string) {
  const module = moduleById(moduleId);
  if (!module) return null;
  const lessonIds = module.lessons.map((lesson) => lesson.id);
  const marks = await db()
    .prepare("SELECT lesson_id FROM lesson_progress WHERE user_id=? AND completed_at IS NOT NULL")
    .bind(userId)
    .all<{ lesson_id: string }>();
  const completed = new Set((marks.results ?? []).map((row) => row.lesson_id));
  const lessonsComplete = lessonIds.every((id) => completed.has(id));
  const latestQuiz = await db()
    .prepare("SELECT score,passed,cycle,created_at FROM quiz_attempts WHERE user_id=? AND module_id=? ORDER BY created_at DESC LIMIT 1")
    .bind(userId, moduleId)
    .first<{ score: number; passed: number; cycle: number; created_at: string }>();
  const latestPractice = await db()
    .prepare("SELECT score,status,critical_issue,reviewed_at FROM practice_submissions WHERE user_id=? AND module_id=? ORDER BY submitted_at DESC LIMIT 1")
    .bind(userId, moduleId)
    .first<{ score: number | null; status: string; critical_issue: number; reviewed_at: string | null }>();
  const practiceApproved = Boolean(
    latestPractice && latestPractice.status === "aprovada" && (latestPractice.score ?? 0) >= 8 && !latestPractice.critical_issue,
  );
  const quizPassed = Boolean(latestQuiz?.passed);
  const homologated = (await appSetting("criteria_homologated", "0")) === "1";
  return {
    moduleId,
    lessonsComplete,
    completedLessons: lessonIds.filter((id) => completed.has(id)).length,
    totalLessons: lessonIds.length,
    quizPassed,
    latestQuiz: latestQuiz ?? null,
    practiceApproved,
    latestPractice: latestPractice ?? null,
    eligible: lessonsComplete && quizPassed && practiceApproved,
    homologated,
    canIssue: lessonsComplete && quizPassed && practiceApproved && homologated,
    workloadMinutes: module.workloadMinutes,
  };
}

async function getFile(fileId: string, request: Request) {
  const file = await db()
    .prepare("SELECT * FROM content_files WHERE id=?")
    .bind(fileId)
    .first<{ id: string; uploaded_by: string; lesson_id: string | null; module_id: string | null; kind: string; object_key: string; filename: string; mime_type: string; size: number }>();
  if (!file) return json({ error: "Arquivo não encontrado." }, 404);
  const user = await currentUser(request);
  const canTeach = Boolean(user && ["instructor", "manager", "admin"].includes(user.role));
  if (file.kind === "practice" && user?.id !== file.uploaded_by && !canTeach) return json({ error: "Acesso negado." }, 403);
  if (file.lesson_id && !canTeach) {
    const content = await db().prepare("SELECT status FROM lesson_content WHERE lesson_id=?").bind(file.lesson_id).first<{ status: string }>();
    if (content?.status !== "disponivel") return json({ error: "Este material ainda não foi publicado." }, 403);
  }
  const object = await bucket().get(file.object_key);
  if (!object) return json({ error: "O arquivo não está disponível no armazenamento." }, 404);
  const inline = file.mime_type.startsWith("video/") || file.mime_type.startsWith("image/") || file.mime_type === "application/pdf";
  const filename = file.filename.replace(/[\r\n"\\]/g, "_");
  return new Response(object.body, {
    headers: {
      "content-type": file.mime_type,
      "content-length": String(file.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

async function handleGet(request: Request, path: string[]) {
  const route = path.join("/");
  if (route === "me") {
    const user = await currentUser(request);
    return json({
      user,
      signInUrl: "/signin-with-chatgpt?return_to=%2F",
      courseVersion: "1.1",
      privacy: "A plataforma registra perfil, função, aulas consultadas, avaliações, práticas e certificados. Instrutores e gestores autorizados podem consultar as informações acadêmicas; use somente dados fictícios em atividades e nunca envie credenciais ou dados reais de clientes.",
    });
  }
  if (route === "content") {
    const user = await currentUser(request);
    const rows = user && ["instructor", "manager", "admin"].includes(user.role)
      ? await db().prepare("SELECT * FROM lesson_content ORDER BY lesson_id").all()
      : await db().prepare("SELECT * FROM lesson_content WHERE status='disponivel' ORDER BY lesson_id").all();
    return json({ items: rows.results ?? [] });
  }
  if (route === "progress") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const rows = await db().prepare("SELECT lesson_id,consulted_at,completed_at FROM lesson_progress WHERE user_id=? ORDER BY lesson_id").bind(auth.user.id).all();
    return json({ items: rows.results ?? [] });
  }
  if (route === "production") {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const rows = await db().prepare("SELECT * FROM lesson_content ORDER BY lesson_id").all();
    const moduleStats = await db().prepare("SELECT status,COUNT(*) AS count FROM lesson_content GROUP BY status").all();
    const settings = await db().prepare("SELECT key,value FROM app_settings").all();
    return json({ items: rows.results ?? [], statusCounts: moduleStats.results ?? [], settings: Object.fromEntries((settings.results ?? []).map((row: Row) => [row.key, row.value])) });
  }
  if (route === "users") {
    const auth = await requireRole(request, ["manager", "admin"]);
    if ("response" in auth) return auth.response;
    const rows = await db().prepare("SELECT id,email,display_name,role,job_path,created_at,updated_at FROM users ORDER BY display_name").all();
    return json({ items: rows.results ?? [] });
  }
  if (route === "settings") {
    const auth = await requireRole(request, ["manager", "admin"]);
    if ("response" in auth) return auth.response;
    const rows = await db().prepare("SELECT key,value,updated_by,updated_at FROM app_settings ORDER BY key").all();
    const homologated = (await appSetting("criteria_homologated", "0")) === "1";
    return json({ items: rows.results ?? [], homologated, thresholds: { quiz: 4, practice: 8, attemptsPerCycle: maxAttemptsPerCycle, version: "1.1 (proposta)" } });
  }
  if (route === "quiz") {
    const moduleId = new URL(request.url).searchParams.get("moduleId") ?? "";
    const quiz = quizById(moduleId);
    if (!quiz) return json({ error: "Módulo não encontrado." }, 404);
    const user = await currentUser(request);
    const questions = quiz.questions.map(({ id, prompt, options, topic }) => ({ id, prompt, options, topic }));
    if (!user) return json({ moduleId, title: quiz.title, version: quiz.version, questions, history: [], attemptsUsed: 0, attemptsRemaining: maxAttemptsPerCycle, cycle: 1, canAttempt: false, requiresSignIn: true });
    const cycleRow = await db().prepare("SELECT cycle FROM quiz_cycles WHERE user_id=? AND module_id=?").bind(user.id, moduleId).first<{ cycle: number }>();
    const cycle = cycleRow?.cycle ?? 1;
    const attempts = await db().prepare("SELECT id,score,total,passed,cycle,created_at FROM quiz_attempts WHERE user_id=? AND module_id=? ORDER BY created_at DESC").bind(user.id, moduleId).all();
    const current = (attempts.results ?? []).filter((row: Row) => row.cycle === cycle);
    const passed = current.some((row: Row) => row.passed === 1);
    return json({ moduleId, title: quiz.title, version: quiz.version, questions, history: attempts.results ?? [], attemptsUsed: current.length, attemptsRemaining: Math.max(0, maxAttemptsPerCycle - current.length), cycle, canAttempt: !passed && current.length < maxAttemptsPerCycle, locked: !passed && current.length >= maxAttemptsPerCycle });
  }
  if (route === "practice") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const moduleId = new URL(request.url).searchParams.get("moduleId");
    if (!moduleId || !moduleById(moduleId)) return json({ error: "Módulo inválido." }, 400);
    const rows = await db().prepare("SELECT * FROM practice_submissions WHERE user_id=? AND module_id=? ORDER BY submitted_at DESC").bind(auth.user.id, moduleId).all();
    return json({ items: rows.results ?? [], rubric: practiceRubric });
  }
  if (route === "practices") {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const status = new URL(request.url).searchParams.get("status");
    const sql = status
      ? `SELECT p.*,u.display_name,u.email FROM practice_submissions p JOIN users u ON u.id=p.user_id WHERE p.status=? ORDER BY p.submitted_at ASC LIMIT 200`
      : `SELECT p.*,u.display_name,u.email FROM practice_submissions p JOIN users u ON u.id=p.user_id ORDER BY p.submitted_at DESC LIMIT 200`;
    const rows = status ? await db().prepare(sql).bind(status).all() : await db().prepare(sql).all();
    return json({ items: rows.results ?? [], rubric: practiceRubric });
  }
  if (route === "certificates") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const moduleId = new URL(request.url).searchParams.get("moduleId");
    const certs = await db().prepare("SELECT * FROM certificates WHERE user_id=? ORDER BY issued_at DESC").bind(auth.user.id).all();
    if (!moduleId) return json({ items: certs.results ?? [], homologated: (await appSetting("criteria_homologated", "0")) === "1" });
    const status = await eligibility(auth.user.id, moduleId);
    if (!status) return json({ error: "Módulo não encontrado." }, 404);
    const issued = (certs.results ?? []).find((certificate: Row) => certificate.module_id === moduleId);
    return json({ eligibility: status, certificate: issued ?? null });
  }
  if (route === "certificate/verify") {
    const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
    if (!code) return json({ error: "Informe o código de verificação." }, 400);
    const result = await db().prepare("SELECT code,title,full_name,module_id,workload_minutes,version,status,issued_at FROM certificates WHERE code=?").bind(code).first();
    return result ? json({ certificate: result }) : json({ error: "Código não localizado." }, 404);
  }
  if (route.startsWith("files/")) return getFile(decodeURIComponent(route.slice("files/".length)), request);
  if (route === "uploads") {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const rows = await db().prepare("SELECT id,lesson_id,module_id,kind,filename,mime_type,size,created_at FROM content_files ORDER BY created_at DESC LIMIT 200").all();
    return json({ items: (rows.results ?? []).map((row: Row) => ({ ...row, url: fileUrl(String(row.id)) })) });
  }
  return json({ error: "Rota não encontrada." }, 404);
}

async function handlePost(request: Request, path: string[]) {
  const route = path.join("/");
  if (route === "me") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const jobPath = text(body.jobPath, 40);
    const name = text(body.displayName, 120);
    const allowedPaths = ["sdr", "closer", "cs-csm", "atendimento-n1", "monitoramento-n2", "coordenacao"];
    if (jobPath && !allowedPaths.includes(jobPath)) return json({ error: "Selecione uma função da trilha." }, 400);
    await db().prepare("UPDATE users SET job_path=?,display_name=CASE WHEN ?<>'' THEN ? ELSE display_name END,updated_at=? WHERE id=?")
      .bind(jobPath || null, name, name, new Date().toISOString(), auth.user.id).run();
    return json({ user: await db().prepare("SELECT id,email,display_name,role,job_path FROM users WHERE id=?").bind(auth.user.id).first() });
  }
  if (route === "progress") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const lessonId = text(body.lessonId, 12);
    const lesson = courseModules.flatMap((module) => module.lessons).find((item) => item.id === lessonId);
    if (!lesson) return json({ error: "Aula não encontrada." }, 404);
    const now = new Date().toISOString();
    const complete = body.action === "complete";
    if (complete) {
      const content = await db().prepare("SELECT status FROM lesson_content WHERE lesson_id=?").bind(lessonId).first<{ status: string }>();
      if (content?.status !== "disponivel") return json({ error: "A aula só pode ser concluída quando o conteúdo estiver disponível." }, 409);
    }
    await db().prepare(
      `INSERT INTO lesson_progress (user_id,lesson_id,consulted_at,completed_at) VALUES (?,?,?,?)
       ON CONFLICT(user_id,lesson_id) DO UPDATE SET consulted_at=excluded.consulted_at,completed_at=COALESCE(lesson_progress.completed_at,excluded.completed_at)`,
    ).bind(auth.user.id, lessonId, now, complete ? now : null).run();
    return json({ ok: true, action: complete ? "completed" : "consulted", at: now });
  }
  if (route === "content") {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const lessonId = text(body.lessonId, 12);
    if (!courseModules.flatMap((module) => module.lessons).some((lesson) => lesson.id === lessonId)) return json({ error: "Aula não encontrada." }, 404);
    const videoUrl = cleanUrl(body.videoUrl);
    const handouts = Array.isArray(body.handouts) ? body.handouts.map((item) => cleanUrl(item)).filter(Boolean) : [];
    if (body.videoUrl && !videoUrl) return json({ error: "O link do vídeo precisa começar com https:// ou http://." }, 400);
    if (Array.isArray(body.handouts) && handouts.length !== body.handouts.filter((item) => String(item).trim()).length) return json({ error: "Há um link de material inválido." }, 400);
    const status = text(body.status, 30);
    if (!["em_producao", "em_revisao", "disponivel"].includes(status)) return json({ error: "Selecione um status de produção válido." }, 400);
    const videoFileId = text(body.videoFileId, 80) || null;
    const handoutFileIds = Array.isArray(body.handoutFileIds) ? body.handoutFileIds.map((item) => text(item, 80)).filter(Boolean) : [];
    if (status === "disponivel" && !videoUrl && !videoFileId) return json({ error: "Para publicar a aula, associe um vídeo ou link." }, 400);
    const dueDate = text(body.dueDate, 10);
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ error: "Informe o prazo no formato de data válido." }, 400);
    const now = new Date().toISOString();
    await db().prepare(
      `INSERT INTO lesson_content (lesson_id,video_url,video_file_id,handouts_json,handout_file_ids_json,status,author,reviewer,due_date,pending_notes,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(lesson_id) DO UPDATE SET video_url=excluded.video_url,video_file_id=excluded.video_file_id,handouts_json=excluded.handouts_json,handout_file_ids_json=excluded.handout_file_ids_json,status=excluded.status,author=excluded.author,reviewer=excluded.reviewer,due_date=excluded.due_date,pending_notes=excluded.pending_notes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    ).bind(
      lessonId, videoUrl, videoFileId, JSON.stringify(handouts), JSON.stringify(handoutFileIds), status,
      text(body.author, 120) || null, text(body.reviewer, 120) || null, dueDate || null,
      text(body.pendingNotes, 1500) || null, auth.user.id, now,
    ).run();
    return json({ ok: true, lessonId, status, updatedAt: now });
  }
  if (route === "quiz/attempt") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const moduleId = text(body.moduleId, 2);
    const quiz = quizById(moduleId);
    if (!quiz) return json({ error: "Módulo não encontrado." }, 404);
    const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];
    if (answers.length !== 5 || answers.some((answer) => !Number.isInteger(answer) || answer < 0 || answer > 3)) return json({ error: "Responda às cinco questões antes de enviar." }, 400);
    let answerBank: Record<string, number[]>;
    try {
      answerBank = JSON.parse(env.ACADEMY_QUIZ_ANSWERS ?? "{}") as Record<string, number[]>;
    } catch {
      return json({ error: "O banco de avaliação precisa ser configurado pelo gestor." }, 503);
    }
    const key = answerBank[moduleId];
    if (!Array.isArray(key) || key.length !== 5) return json({ error: "Este teste ainda não está configurado." }, 503);
    const cycleRow = await db().prepare("SELECT cycle FROM quiz_cycles WHERE user_id=? AND module_id=?").bind(auth.user.id, moduleId).first<{ cycle: number }>();
    const cycle = cycleRow?.cycle ?? 1;
    const prior = await db().prepare("SELECT score,passed,cycle,created_at FROM quiz_attempts WHERE user_id=? AND module_id=? ORDER BY created_at DESC").bind(auth.user.id, moduleId).all();
    const cycleAttempts = (prior.results ?? []).filter((row: Row) => row.cycle === cycle);
    if (cycleAttempts.some((row: Row) => row.passed === 1)) return json({ error: "Este módulo já está aprovado neste ciclo." }, 409);
    if (cycleAttempts.length >= maxAttemptsPerCycle) return json({ error: "As três tentativas deste ciclo foram usadas. Solicite orientação ao instrutor para iniciar o plano de reforço." }, 429);
    const score = answers.reduce((sum, answer, index) => sum + (answer === key[index] ? 1 : 0), 0);
    const passed = score >= 4;
    const missedTopics = quiz.questions.filter((_, index) => answers[index] !== key[index]).map((question) => question.topic);
    const now = new Date().toISOString();
    await db().prepare("INSERT INTO quiz_attempts (id,user_id,module_id,cycle,version,answers_json,score,total,passed,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), auth.user.id, moduleId, cycle, quiz.version, JSON.stringify(answers), score, 5, passed ? 1 : 0, now).run();
    return json({ score, total: 5, percentage: score * 20, passed, attempt: cycleAttempts.length + 1, maxAttempts: maxAttemptsPerCycle, cycle, missedTopics, feedback: passed ? "Teste aprovado. A aprovação prática e a conclusão das aulas continuam sendo requisitos independentes." : "Revise os temas indicados e tente novamente. A aprovação do teste não substitui a avaliação prática." });
  }
  if (route === "quiz/unlock") {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const userId = text(body.userId, 120);
    const moduleId = text(body.moduleId, 2);
    if (!userId || !moduleById(moduleId)) return json({ error: "Participante ou módulo inválido." }, 400);
    const now = new Date().toISOString();
    const previous = await db().prepare("SELECT cycle FROM quiz_cycles WHERE user_id=? AND module_id=?").bind(userId, moduleId).first<{ cycle: number }>();
    const currentCycle = previous?.cycle ?? 1;
    const attempts = await db().prepare("SELECT passed FROM quiz_attempts WHERE user_id=? AND module_id=? AND cycle=?").bind(userId, moduleId, currentCycle).all<{ passed: number }>();
    if ((attempts.results ?? []).length < maxAttemptsPerCycle || (attempts.results ?? []).some((item) => item.passed === 1)) return json({ error: "O novo ciclo só pode ser aberto após três tentativas sem aprovação." }, 409);
    const nextCycle = currentCycle + 1;
    await db().prepare("INSERT INTO quiz_cycles (user_id,module_id,cycle,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,module_id) DO UPDATE SET cycle=excluded.cycle,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
      .bind(userId, moduleId, nextCycle, auth.user.id, now).run();
    await db().prepare("INSERT INTO app_settings (key,value,updated_by,updated_at) VALUES (?,?,?,?)")
      .bind(`reinforcement:${userId}:${moduleId}:${nextCycle}`, text(body.plan, 1500) || "Plano de reforço orientado pelo instrutor.", auth.user.id, now).run();
    return json({ ok: true, cycle: nextCycle });
  }
  if (route === "practice") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const moduleId = text(body.moduleId, 2);
    const module = moduleById(moduleId);
    const responseText = text(body.responseText, 8000);
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.map((item) => text(item, 80)).filter(Boolean).slice(0, 8) : [];
    if (!module || responseText.length < 20) return json({ error: "Descreva a entrega da prática com pelo menos 20 caracteres." }, 400);
    const latest = await db().prepare("SELECT status,submission_number FROM practice_submissions WHERE user_id=? AND module_id=? ORDER BY submitted_at DESC LIMIT 1").bind(auth.user.id, moduleId).first<{ status: string; submission_number: number }>();
    if (latest && !["revisao", "reprovada"].includes(latest.status)) return json({ error: "Aguarde a avaliação do instrutor antes de enviar outra versão." }, 409);
    const next = (latest?.submission_number ?? 0) + 1;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db().prepare("INSERT INTO practice_submissions (id,user_id,module_id,submission_number,response_text,file_ids_json,status,submitted_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, auth.user.id, moduleId, next, responseText, JSON.stringify(fileIds), "enviada", now).run();
    return json({ ok: true, id, submissionNumber: next, status: "enviada", submittedAt: now }, 201);
  }
  if (route === "practice/review") {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const id = text(body.id, 80);
    const decision = text(body.decision, 20);
    const scores = Array.isArray(body.scores) ? body.scores.map(Number) : [];
    const feedback = text(body.feedback, 2500);
    const criticalIssue = Boolean(body.criticalIssue);
    if (!id || !["approve", "revision"].includes(decision) || scores.length !== 5 || scores.some((score) => !Number.isInteger(score) || score < 0 || score > 2)) return json({ error: "Revise os cinco itens da rubrica e a decisão." }, 400);
    if (feedback.length < 10) return json({ error: "Inclua um comentário para o participante." }, 400);
    const score = scores.reduce((sum, value) => sum + value, 0);
    const status = decision === "approve" && score >= 8 && !criticalIssue ? "aprovada" : "revisao";
    const now = new Date().toISOString();
    await db().prepare("UPDATE practice_submissions SET status=?,score=?,rubric_json=?,critical_issue=?,feedback=?,reviewed_by=?,reviewed_at=? WHERE id=?")
      .bind(status, score, JSON.stringify(scores), criticalIssue ? 1 : 0, feedback, auth.user.id, now, id).run();
    return json({ ok: true, status, score, criticalIssue, reviewedAt: now });
  }
  if (route === "users") {
    const auth = await requireRole(request, ["manager", "admin"]);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const targetId = text(body.userId, 120);
    const role = text(body.role, 20) as Role;
    if (!targetId || !["learner", "instructor", "manager"].includes(role)) return json({ error: "Perfil inválido." }, 400);
    const target = await db().prepare("SELECT id,role FROM users WHERE id=?").bind(targetId).first<{ id: string; role: Role }>();
    if (!target) return json({ error: "Participante não encontrado." }, 404);
    if (target.role === "admin" && auth.user.role !== "admin") return json({ error: "Somente a administração pode alterar outro administrador." }, 403);
    if (role === "manager" && auth.user.role !== "admin") return json({ error: "Somente a administração pode conceder perfil de gestor." }, 403);
    await db().prepare("UPDATE users SET role=?,updated_at=? WHERE id=?").bind(role, new Date().toISOString(), targetId).run();
    return json({ ok: true, userId: targetId, role });
  }
  if (route === "settings") {
    const auth = await requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    if (typeof body.criteriaHomologated !== "boolean") return json({ error: "Informe se os critérios foram homologados." }, 400);
    const now = new Date().toISOString();
    await db().prepare("INSERT INTO app_settings (key,value,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
      .bind("criteria_homologated", body.criteriaHomologated ? "1" : "0", auth.user.id, now).run();
    return json({ ok: true, criteriaHomologated: body.criteriaHomologated, updatedAt: now });
  }
  if (route === "certificates/issue") {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Row;
    const moduleId = text(body.moduleId, 12);
    if (moduleId === "TRILHA") {
      const statuses = await Promise.all(courseModules.map((module) => eligibility(auth.user.id, module.id)));
      const homologated = (await appSetting("criteria_homologated", "0")) === "1";
      if (!homologated || statuses.some((status) => !status?.eligible)) return json({ error: "A trilha completa exige os 12 módulos aprovados e critérios homologados." }, 409);
      const existing = await db().prepare("SELECT * FROM certificates WHERE user_id=? AND module_id='TRILHA' AND status='valido' ORDER BY issued_at DESC LIMIT 1").bind(auth.user.id).first();
      if (existing) return json({ certificate: existing });
      const code = `BBS-ACA-TRILHA-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const name = text(body.fullName, 120) || auth.user.display_name;
      const now = new Date().toISOString();
      await db().prepare("INSERT INTO certificates (code,user_id,module_id,title,full_name,workload_minutes,version,status,issued_by,issued_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(code, auth.user.id, "TRILHA", "BBS ONE Academy — Formação em processos comerciais, implantação e atendimento técnico", name, 730, "1.1", "valido", auth.user.id, now).run();
      return json({ certificate: await db().prepare("SELECT * FROM certificates WHERE code=?").bind(code).first() }, 201);
    }
    const status = await eligibility(auth.user.id, moduleId);
    const module = moduleById(moduleId);
    if (!status || !module) return json({ error: "Módulo não encontrado." }, 404);
    if (!status.canIssue) return json({ error: status.eligible ? "Os critérios estão pendentes de homologação." : "Conclua as aulas, aprove o teste e tenha a prática validada pelo instrutor." }, 409);
    const existing = await db().prepare("SELECT * FROM certificates WHERE user_id=? AND module_id=? AND status='valido' ORDER BY issued_at DESC LIMIT 1").bind(auth.user.id, moduleId).first();
    if (existing) return json({ certificate: existing });
    const code = `BBS-ACA-M${moduleId}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const name = text(body.fullName, 120) || auth.user.display_name;
    const now = new Date().toISOString();
    await db().prepare("INSERT INTO certificates (code,user_id,module_id,title,full_name,workload_minutes,version,status,issued_by,issued_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(code, auth.user.id, moduleId, `BBS ONE Academy — Módulo ${moduleId}: ${module.title}`, name, module.workloadMinutes, "1.1", "valido", auth.user.id, now).run();
    return json({ certificate: await db().prepare("SELECT * FROM certificates WHERE code=?").bind(code).first() }, 201);
  }
  if (route === "uploads/start") return startUpload(request);
  if (route.startsWith("uploads/") && route.endsWith("/part")) return uploadPart(request, path[1]);
  if (route.startsWith("uploads/") && route.endsWith("/complete")) return completeUpload(request, path[1]);
  if (route.startsWith("uploads/") && route.endsWith("/abort")) return abortUpload(request, path[1]);
  return json({ error: "Rota não encontrada." }, 404);
}

async function startUpload(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const body = await request.json() as Row;
  const kind = text(body.kind, 20);
  const lessonId = text(body.lessonId, 12) || null;
  const moduleId = text(body.moduleId, 2) || null;
  const filename = text(body.filename, 180).replace(/[\r\n/\\]/g, "_");
  const mimeType = text(body.mimeType, 120) || "application/octet-stream";
  const size = Number(body.size);
  const isContent = ["video", "material"].includes(kind);
  const isPractice = kind === "practice";
  if ((!isContent && !isPractice) || !filename || !Number.isSafeInteger(size) || size < 1) return json({ error: "Arquivo inválido." }, 400);
  if (isContent && !["instructor", "manager", "admin"].includes(auth.user.role)) return json({ error: "Somente instrutores e gestores publicam materiais." }, 403);
  if (isContent && (!lessonId || !courseModules.flatMap((module) => module.lessons).some((lesson) => lesson.id === lessonId))) return json({ error: "Selecione uma aula válida." }, 400);
  if (isPractice && (!moduleId || !moduleById(moduleId))) return json({ error: "Selecione um módulo válido para a prática." }, 400);
  const maxBytes = kind === "video" ? 1_500_000_000 : kind === "material" ? 100_000_000 : 25_000_000;
  if (size > maxBytes) return json({ error: `O limite deste tipo de arquivo é ${Math.round(maxBytes / 1_000_000)} MB.` }, 413);
  const allowedMime = /^(video\/(mp4|webm|quicktime)|application\/(pdf|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|msword|vnd\.ms-excel|vnd\.ms-powerpoint)|image\/(jpeg|png|webp))$/i;
  if (!allowedMime.test(mimeType)) return json({ error: "Formato não permitido. Use MP4, MOV, WebM, PDF, Office ou imagem." }, 415);
  const id = crypto.randomUUID();
  const objectKey = `${kind}/${moduleId ?? lessonId}/${id}/${filename}`;
  const upload = await bucket().createMultipartUpload(objectKey, { httpMetadata: { contentType: mimeType } });
  const now = new Date().toISOString();
  await db().prepare("INSERT INTO uploads (id,user_id,lesson_id,module_id,kind,object_key,multipart_id,filename,mime_type,size,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, auth.user.id, lessonId, moduleId, kind, objectKey, upload.uploadId, filename, mimeType, size, now).run();
  return json({ id, partSize, uploadId: upload.uploadId, maxSize: maxBytes }, 201);
}

async function uploadPart(request: Request, uploadId: string) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const upload = await db().prepare("SELECT * FROM uploads WHERE id=? AND user_id=?").bind(uploadId, auth.user.id).first<{
    id: string; object_key: string; multipart_id: string;
  }>();
  if (!upload) return json({ error: "Envio não encontrado." }, 404);
  const partNumber = Number(new URL(request.url).searchParams.get("number"));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body) return json({ error: "Parte inválida." }, 400);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > partSize + 1024) return json({ error: "A parte excede o limite de 5 MB." }, 413);
  const part = await bucket().resumeMultipartUpload(upload.object_key, upload.multipart_id).uploadPart(partNumber, bytes);
  await db().prepare("INSERT INTO upload_parts (upload_id,part_number,etag) VALUES (?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag")
    .bind(uploadId, partNumber, part.etag).run();
  return json({ partNumber, etag: part.etag });
}

async function completeUpload(request: Request, uploadId: string) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const upload = await db().prepare("SELECT * FROM uploads WHERE id=? AND user_id=?").bind(uploadId, auth.user.id).first<{
    id: string; lesson_id: string | null; module_id: string | null; kind: string; object_key: string; multipart_id: string;
    filename: string; mime_type: string; size: number;
  }>();
  if (!upload) return json({ error: "Envio não encontrado." }, 404);
  const parts = await db().prepare("SELECT part_number,etag FROM upload_parts WHERE upload_id=? ORDER BY part_number").bind(uploadId).all<{ part_number: number; etag: string }>();
  if (!parts.results?.length) return json({ error: "Envie pelo menos uma parte antes de concluir." }, 400);
  const completed = await bucket().resumeMultipartUpload(upload.object_key, upload.multipart_id).complete(
    parts.results.map((part) => ({ partNumber: part.part_number, etag: part.etag })),
  );
  if (!completed) return json({ error: "Não foi possível concluir o arquivo." }, 500);
  const fileId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db().prepare("INSERT INTO content_files (id,uploaded_by,lesson_id,module_id,kind,object_key,filename,mime_type,size,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(fileId, auth.user.id, upload.lesson_id, upload.module_id, upload.kind, upload.object_key, upload.filename, upload.mime_type, upload.size, now).run();
  await db().prepare("DELETE FROM upload_parts WHERE upload_id=?").bind(uploadId).run();
  await db().prepare("DELETE FROM uploads WHERE id=?").bind(uploadId).run();
  return json({ file: { id: fileId, filename: upload.filename, mimeType: upload.mime_type, size: upload.size, url: fileUrl(fileId), kind: upload.kind } }, 201);
}

async function abortUpload(request: Request, uploadId: string) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const upload = await db().prepare("SELECT object_key,multipart_id FROM uploads WHERE id=? AND user_id=?").bind(uploadId, auth.user.id).first<{ object_key: string; multipart_id: string }>();
  if (!upload) return json({ error: "Envio não encontrado." }, 404);
  await bucket().resumeMultipartUpload(upload.object_key, upload.multipart_id).abort();
  await db().prepare("DELETE FROM upload_parts WHERE upload_id=?").bind(uploadId).run();
  await db().prepare("DELETE FROM uploads WHERE id=?").bind(uploadId).run();
  return json({ ok: true });
}

export async function GET(request: Request) {
  try {
    return await handleGet(request, new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean));
  } catch (error) {
    console.error("BBS Academy API GET failed", error);
    return json({ error: "Não foi possível consultar os dados da Academy." }, 500);
  }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: "Origem não autorizada." }, 403);
  try {
    return await handlePost(request, new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean));
  } catch (error) {
    console.error("BBS Academy API POST failed", error);
    return json({ error: "Não foi possível salvar os dados. Tente novamente." }, 500);
  }
}

export async function PATCH(request: Request) {
  if (!validOrigin(request)) return json({ error: "Origem não autorizada." }, 403);
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    if (path[0] === "users" && path[1]) {
      const auth = await requireRole(request, ["manager", "admin"]);
      if ("response" in auth) return auth.response;
      const body = await request.json() as Row;
      const role = text(body.role, 20) as Role;
      if (!["learner", "instructor", "manager"].includes(role)) return json({ error: "Perfil inválido." }, 400);
      const target = await db().prepare("SELECT id,role FROM users WHERE id=?").bind(decodeURIComponent(path[1])).first<{ id: string; role: Role }>();
      if (!target) return json({ error: "Participante não encontrado." }, 404);
      if (target.role === "admin" && auth.user.role !== "admin") return json({ error: "Somente a administração pode alterar outro administrador." }, 403);
      if (role === "manager" && auth.user.role !== "admin") return json({ error: "Somente a administração pode conceder perfil de gestor." }, 403);
      await db().prepare("UPDATE users SET role=?,updated_at=? WHERE id=?").bind(role, new Date().toISOString(), target.id).run();
      return json({ ok: true, userId: target.id, role });
    }
    if (path[0] === "me") {
      const auth = await requireUser(request);
      if ("response" in auth) return auth.response;
      const body = await request.json() as Row;
      const jobPath = text(body.jobPath, 40);
      const name = text(body.displayName, 120);
      const allowedPaths = ["sdr", "closer", "cs-csm", "atendimento-n1", "monitoramento-n2", "coordenacao"];
      if (jobPath && !allowedPaths.includes(jobPath)) return json({ error: "Selecione uma função da trilha." }, 400);
      await db().prepare("UPDATE users SET job_path=?,display_name=CASE WHEN ?<>'' THEN ? ELSE display_name END,updated_at=? WHERE id=?")
        .bind(jobPath || null, name, name, new Date().toISOString(), auth.user.id).run();
      return json({ user: await db().prepare("SELECT id,email,display_name,role,job_path FROM users WHERE id=?").bind(auth.user.id).first() });
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) {
    console.error("BBS Academy API PATCH failed", error);
    return json({ error: "Não foi possível atualizar o cadastro." }, 500);
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) return json({ error: "Origem não autorizada." }, 403);
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  if (path[0] === "content" && path[1]) {
    const auth = await requireRole(request, ["instructor", "manager", "admin"]);
    if ("response" in auth) return auth.response;
    const lessonId = decodeURIComponent(path[1]);
    await db().prepare("DELETE FROM lesson_content WHERE lesson_id=?").bind(lessonId).run();
    return json({ ok: true });
  }
  if (path[0] === "files" && path[1]) {
    const auth = await requireUser(request);
    if ("response" in auth) return auth.response;
    const fileId = decodeURIComponent(path[1]);
    const file = await db().prepare("SELECT * FROM content_files WHERE id=?").bind(fileId).first<{ id: string; uploaded_by: string; kind: string; object_key: string; lesson_id: string | null }>();
    if (!file) return json({ error: "Arquivo não encontrado." }, 404);
    const allowed = file.uploaded_by === auth.user.id || ["instructor", "manager", "admin"].includes(auth.user.role);
    if (!allowed) return json({ error: "Acesso negado." }, 403);
    await bucket().delete(file.object_key);
    await db().prepare("DELETE FROM content_files WHERE id=?").bind(fileId).run();
    if (file.lesson_id) {
      const row = await db().prepare("SELECT video_file_id,handout_file_ids_json FROM lesson_content WHERE lesson_id=?").bind(file.lesson_id).first<{ video_file_id: string | null; handout_file_ids_json: string }>();
      if (row) {
        const ids = parseJson<string[]>(row.handout_file_ids_json, []).filter((id) => id !== fileId);
        await db().prepare("UPDATE lesson_content SET video_file_id=?,handout_file_ids_json=?,updated_at=? WHERE lesson_id=?")
          .bind(row.video_file_id === fileId ? null : row.video_file_id, JSON.stringify(ids), new Date().toISOString(), file.lesson_id).run();
      }
    }
    return json({ ok: true });
  }
  return json({ error: "Rota não encontrada." }, 404);
}
