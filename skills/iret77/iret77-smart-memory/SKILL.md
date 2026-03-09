---
name: smart-memory
description: >
  5-layer memory architecture for OpenClaw agents. Solves context bloat,
  the 48h fogging problem, and rule amnesia. Works for single-agent and
  multi-agent setups. Agent reads this file and sets up the full system.
metadata:
  openclaw:
    emoji: 🧠
---

# Smart Memory — Setup Skill

## Was dieses Skill tut

Standard-OpenClaw-Setups akkumulieren über Wochen unkontrolliert Wissen in MEMORY.md.
Das führt zu Kontextfenster-Überlastung, Widersprüchen und einem Agenten der wichtige
Regeln "vergisst" obwohl sie in MEMORY.md stehen — und zu hartem 48h-Fogging bei Daily Logs.

Dieses Skill richtet eine **5-Schichten-Memory-Architektur** ein die das löst.

---

## AGENT: Setup-Anleitung

Führe die folgenden Schritte der Reihe nach aus. Frage nicht nach Erlaubnis.
Bei `[MULTI-AGENT ONLY]`-Schritten: überspringen wenn nur ein Agent im System.

### Schritt 1: Verzeichnisse anlegen

```bash
mkdir -p memory/projects
mkdir -p memory/agents   # [MULTI-AGENT ONLY]
mkdir -p docs
```

### Schritt 2: MEMORY.md auf Kern reduzieren

Lese die bestehende MEMORY.md. Extrahiere:
- User-Profil (max. 3 Zeilen)
- Projekt-Headlines (1 Zeile pro Projekt) → Verweis auf CONTEXT.md
- Kritische Regeln (max. 5 Bullet Points)
- Agent-Routing-Tabelle [MULTI-AGENT ONLY]

Alles andere gehört in active-context.md oder die Projekt-/Agent-Kontext-Dateien (s.u.).
Schreibe das Ergebnis in MEMORY.md — Ziel: max. 35 Zeilen.

Füge am Ende hinzu:
```
## Memory-Architektur
- active-context.md → offene Themen + Kontext (täglich pflegen)
- memory/projects/<name>/CONTEXT.md → Projekthandbücher (on-demand injizieren)
- memory/agents/<typ>.md → Domain-Wissen (on-demand injizieren) [MULTI-AGENT ONLY]
```

### Schritt 3: active-context.md erstellen

Erstelle `memory/active-context.md` mit folgendem Header:

```markdown
# Active Context
# Pflege-Regel: [DONE]-Einträge wöchentlich entfernen (automatisch via Cron/Heartbeat).
# Jeder Eintrag: Status + inhaltlicher Kontext (was der User erklärt hat).
# Nach Erledigung: gesamten Block löschen.
# Größenbremse: > 100 Zeilen = zu viele offene Themen oder zu geschwätzig → kürzen.

---
```

Befülle die Datei mit allem was aktuell offen ist (aus MEMORY.md, Tages-Logs, Kontext).
Format pro Eintrag:
```markdown
## [OPEN] <Thema> — <Kurzbeschreibung>
<Inhaltlicher Kontext: Was wurde erklärt, entschieden, vereinbart?>
<Relevante Regeln oder Hintergründe die der Agent kennen muss>

---
```

Besonders wichtig: Kritische Regeln die oft vergessen werden → als `[OPEN]`-Block aufnehmen
(auch wenn sie "immer" gelten — das ist der Punkt, sie bleiben sichtbar bis sie wirklich verinnerlicht sind).

### Schritt 4: Projekthandbücher anlegen

Für jedes aktive Projekt: `memory/projects/<projektname>/CONTEXT.md`

Extrahiere alle projektspezifischen Details aus MEMORY.md in diese Datei.
Template: `templates/projects/example/CONTEXT.md` in diesem Skill-Ordner.

**Wann updaten:** Sub-Agent-Task-Prompts enthalten die Anweisung:
"Aktualisiere CONTEXT.md mit neuen Erkenntnissen am Ende deines Tasks."

### Schritt 5: Agent-Domain-Wissen anlegen [MULTI-AGENT ONLY]

Für jeden Sub-Agent-Typ: `memory/agents/<typ>.md`

Enthält cross-project Wissen das für diesen Agent-Typ immer gilt.
Templates: `templates/agents/` in diesem Skill-Ordner.

**Abgrenzung:**
- `memory/agents/coding.md`: "GPT erfindet Swift-Typen → nie GPT für Swift-Code"
- `memory/projects/myapp/CONTEXT.md`: "myapp hat zwei .strings-Dateien die synchron bleiben müssen"

Wenn das Wissen beim nächsten Projekt auch gilt → agents/. Sonst → projects/.

### Schritt 6: AGENTS.md Startup-Sequenz updaten

Ersetze die "Every Session"-Sektion durch:

```markdown
## Every Session

Before doing anything else:
1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. **If in MAIN SESSION:** Read `MEMORY.md` + `memory/active-context.md`
4. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent raw context

**Sub-Agent Spawns [MULTI-AGENT ONLY]:** Injiziere in den Task-Prompt:
- Immer: Inhalt von `memory/agents/<typ>.md`
- Bei Projektarbeit: Inhalt von `memory/projects/<name>/CONTEXT.md`
```

### Schritt 7: Automatischen Cleanup einrichten

**Option A — Heartbeat (einfach):**
Füge in `HEARTBEAT.md` ein:
```
# TASK: Memory-Hygiene (wöchentlich, jeden Sonntag)
# Prüfe ob seit letztem Cleanup > 6 Tage vergangen (heartbeat-state.json).
# 1. Entferne alle [DONE]-Blöcke komplett aus memory/active-context.md
# 2. [OPEN]-Blöcke älter 30 Tage ohne Aktivität → in Tages-Log, aus active-context entfernen
# 3. memory/projects/*/CONTEXT.md — erledigte Tasks kürzen
# 4. lastMemoryCleanup Timestamp in memory/heartbeat-state.json schreiben
```

**Option B — Cron-Job (präzise):**
```
Schedule: 0 7 * * 0 (Sonntag 07:00 Ortszeit)
Message: "Wöchentliche Memory-Hygiene: [Cleanup-Anweisungen wie oben]"
```

### Schritt 8: Abschlusskontrolle

Prüfe jedes Kriterium:
- [ ] MEMORY.md < 40 Zeilen
- [ ] active-context.md erstellt, mindestens ein [OPEN]-Eintrag
- [ ] Jeder [OPEN]-Eintrag hat inhaltlichen Kontext, nicht nur Statuszeile
- [ ] Keine projektspezifischen Details mehr in MEMORY.md
- [ ] Wöchentlicher Cleanup aktiv (Heartbeat oder Cron)
- [ ] AGENTS.md Startup-Sequenz updated
- [ ] Für jedes aktive Projekt: CONTEXT.md angelegt [MULTI-AGENT ONLY]
- [ ] Für jeden Sub-Agent-Typ: agents/<typ>.md angelegt [MULTI-AGENT ONLY]

Berichte dem User kurz: Was wurde eingerichtet, wie viele Zeilen hat MEMORY.md jetzt,
wie viele offene Themen sind in active-context.md.

---

## Tägliche Schreib-Regeln (nach Setup)

| Situation | Aktion |
|-----------|--------|
| User erklärt etwas Wichtiges | → `[OPEN]`-Block in active-context.md mit vollem Kontext |
| Technische Erkenntnis bei Coding | → memory/projects/<name>/CONTEXT.md updaten |
| Cross-project Lesson | → memory/agents/<typ>.md updaten |
| Thema abgeschlossen | → `[DONE]` markieren (Cleanup entfernt Block) |
| MEMORY.md nähert sich 40 Zeilen | → destillieren: Was ist wirklich dauerhaft relevant? |
| active-context.md > 100 Zeilen | → Warnsignal: Einträge kürzen oder klären |

---

## Warum das funktioniert

**Das Fogging-Problem:** In Standard-Setups gibt es nur Daily Logs (heute + gestern).
Was vor 3 Tagen besprochen wurde, ist weg. Der User muss alles neu erklären.

**Die Lösung:** active-context.md schreibt Relevanz, nicht Zeit. Ein offenes Thema
bleibt im Kontext bis es erledigt ist — egal wie lange das dauert. Nach Erledigung
fliegt es raus. Kein unkontrolliertes Aufblähen, weil erledigte Themen aktiv entfernt werden.

**Das Rauschen-Problem:** MEMORY.md wächst über Monate auf hunderte Zeilen.
Der Agent sieht alles gleichzeitig — Swift-Lektionen neben Marketing-Strategie neben Cron-IDs.
Alles konkurriert um Aufmerksamkeit. Regeln werden "vergessen" weil sie im Rauschen untergehen.

**Die Lösung:** Jede Schicht hat einen klar begrenzten Scope. Projektdetails sind nicht
im Orchestrator-Kontext — sie werden on-demand in Sub-Agent-Prompts injiziert wenn
sie gebraucht werden. Kein Rauschen, keine Ablenkung.
