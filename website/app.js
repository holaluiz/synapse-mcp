// Translations dictionary
const translations = {
  en: {
    navDocs: "Docs",
    navArch: "Architecture",
    navTools: "Tools",
    navClients: "Clients",
    heroTitle: "Coordinate anything across <span class='gradient-text'>AI coding agents</span>",
    heroSubtitle: "Connect Claude Code, Antigravity, Codex, and Cursor on the same project concurrently — without code collisions, context blindness, or duplicated work.",
    btnCopy: "Copy",
    copied: "Copied!",
    simTitle: "Live Multi-Agent Simulation",
    simDesc: "Experience how Synapse resolves file collisions and coordinates memory between AI agents in real time.",
    panelControls: "Agent Action Panel",
    panelLogs: "Shared SQLite Activity Log (WAL)",
    btnAntigravityClaim: "Antigravity: Claim Auth & Lock 'src/auth/*'",
    btnClaudeClaim: "Claude Code: Try to edit 'src/auth/*'",
    btnRelease: "Release Task & Clear Locks",
    lockFree: "Status: No files currently locked.",
    lockHeld: "Locked by: antigravity (Pattern: 'src/auth/*')",
    featTitle: "Why Synapse MCP?",
    feat1Title: "100% Local-First",
    feat1Text: "All state lives in .synapse/brain.db. Zero cloud dependencies, zero external network sockets, zero telemetry.",
    feat2Title: "Anti-Collision Locks",
    feat2Text: "File locks prevent race conditions when multiple agents edit the same repository simultaneously.",
    feat3Title: "Shared Architecture Memory",
    feat3Text: "Architectural Decision Records (ADRs) persist across agents so established conventions are never reverted.",
    feat4Title: "Investigation Unknowns",
    feat4Text: "Agents flag unanswered questions or unexpected bugs for peer agents to investigate and resolve.",
    clientsTitle: "Supported AI Clients",
    clientsDesc: "Automatic one-command setup for all major coding assistants.",
    footerText: "MIT License © 2026 Luiz / Um Cara Caramelo. Built for the open-source AI community."
  },
  pt: {
    navDocs: "Documentação",
    navArch: "Arquitetura",
    navTools: "Ferramentas",
    navClients: "Clientes",
    heroTitle: "Coordene qualquer tarefa entre <span class='gradient-text'>agentes de IA</span>",
    heroSubtitle: "Conecte Claude Code, Antigravity, Codex e Cursor no mesmo repositório concorrentemente — sem colisões de código, sem perda de contexto e sem retrabalho.",
    btnCopy: "Copiar",
    copied: "Copiado!",
    simTitle: "Simulação Multi-Agente em Tempo Real",
    simDesc: "Veja como o Synapse resolve conflitos de arquivos e sincroniza a memória entre os agentes instantaneamente.",
    panelControls: "Painel de Ações do Agente",
    panelLogs: "Log de Atividades Compartilhado (SQLite WAL)",
    btnAntigravityClaim: "Antigravity: Travar 'src/auth/*'",
    btnClaudeClaim: "Claude Code: Tentar editar 'src/auth/*'",
    btnRelease: "Liberar Tarefa & Destravar Arquivos",
    lockFree: "Status: Nenhum arquivo travado no momento.",
    lockHeld: "Arquivo travado por: antigravity (Padrão: 'src/auth/*')",
    featTitle: "Por que usar o Synapse MCP?",
    feat1Title: "100% Local-First",
    feat1Text: "Todo o estado fica em .synapse/brain.db. Zero nuvem, zero telemetria e zero dependências externas.",
    feat2Title: "Travas Anti-Colisão",
    feat2Text: "Locks de arquivos impedem que dois agentes sobrescrevam o mesmo código ao mesmo tempo.",
    feat3Title: "Memória Compartilhada & ADRs",
    feat3Text: "Decisões de arquitetura ficam registradas para que nenhum agente desfaça padrões estabelecidos.",
    feat4Title: "Livro de Lacunas (Unknowns)",
    feat4Text: "Agentes anotam dúvidas ou bugs inexplicados para que outro agente os investigue e resolva.",
    clientsTitle: "Clientes de IA Suportados",
    clientsDesc: "Configuração automática em 1 comando para os principais assistentes de código.",
    footerText: "Licença MIT © 2026 Luiz / Um Cara Caramelo. Criado para a comunidade open-source de IA."
  }
};

let currentLang = 'en';

// Language switcher
function setLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      el.innerHTML = translations[lang][key];
    }
  });
  document.getElementById('lang-btn').textContent = lang === 'en' ? '🇧🇷 PT' : '🇺🇸 EN';
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
}

function toggleLanguage() {
  setLanguage(currentLang === 'en' ? 'pt' : 'en');
}

// Theme switcher
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  document.getElementById('theme-btn').textContent = newTheme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('synapse-theme', newTheme);
}

// Copy command
function copyCommand() {
  const code = document.getElementById('cmd-text').innerText;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = translations[currentLang].copied;
    setTimeout(() => {
      btn.textContent = translations[currentLang].btnCopy;
    }, 2000);
  });
}

// Live Simulator Logic
let isLocked = false;
let lockedBy = null;

function addLog(text, type = 'normal') {
  const stream = document.getElementById('log-stream');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${text}`;
  stream.appendChild(entry);
  stream.scrollTop = stream.scrollHeight;
}

function simAntigravityClaim() {
  if (isLocked) {
    addLog(`[REJECTED] Antigravity: 'src/auth/*' is already locked by ${lockedBy}`, 'warn');
    return;
  }
  isLocked = true;
  lockedBy = 'antigravity';
  document.getElementById('lock-status').textContent = translations[currentLang].lockHeld;
  document.getElementById('lock-status').style.borderColor = 'var(--accent-orange)';
  document.getElementById('lock-status').style.color = 'var(--accent-orange)';
  addLog(`[CLAIM] Antigravity acquired lock on 'src/auth/*' (Task: task-auth-01)`, 'success');
  addLog(`[ADR] Antigravity recorded decision: 'Use Argon2id for password hashing'`);
}

function simClaudeClaim() {
  if (isLocked && lockedBy !== 'claude-code') {
    addLog(`[COLLISION BLOCKED] Claude Code: Cannot modify 'src/auth/*'! File is locked by ${lockedBy}. Coordination required.`, 'warn');
  } else {
    isLocked = true;
    lockedBy = 'claude-code';
    document.getElementById('lock-status').textContent = `Locked by: claude-code (Pattern: 'src/auth/*')`;
    addLog(`[CLAIM] Claude Code acquired lock on 'src/auth/*'`, 'success');
  }
}

function simRelease() {
  if (!isLocked) {
    addLog(`[INFO] No active locks to release.`);
    return;
  }
  const previousOwner = lockedBy;
  isLocked = false;
  lockedBy = null;
  document.getElementById('lock-status').textContent = translations[currentLang].lockFree;
  document.getElementById('lock-status').style.borderColor = 'var(--border-color)';
  document.getElementById('lock-status').style.color = 'var(--text-secondary)';
  addLog(`[RELEASE] ${previousOwner} released task. All file locks cleared. Other agents may now proceed.`, 'success');
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('synapse-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('theme-btn').textContent = savedTheme === 'dark' ? '🌙' : '☀️';

  // Initial simulator log
  addLog("SQLite WAL initialized: .synapse/brain.db (busy_timeout: 5000ms)");
  addLog("Ready for multi-agent coordination.");
});
