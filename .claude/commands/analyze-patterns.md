---
description: 세션 로그에서 패턴을 분석하고 자동화 가능한 영역을 찾아 .claude/ config 파일을 제안합니다
allowed-tools:
  - mcp__prompt-logger__get_tool_sequences
  - mcp__prompt-logger__get_prompt_clusters
  - mcp__prompt-logger__get_project_profiles
  - mcp__prompt-logger__get_workflow_arcs
  - mcp__prompt-logger__get_friction_points
  - mcp__prompt-logger__list_sessions
  - Read
  - Write
  - Glob
  - Grep
---

# Session Pattern Analyzer

최근 Claude Code 세션 로그를 분석하여 자동화 가능한 패턴을 발견하고 `.claude/` 설정 파일을 제안합니다.

## Step 1: 데이터 수집

아래 MCP 도구들을 순서대로 호출하세요:

1. `get_tool_sequences` — 반복되는 tool 사용 패턴 (bigram, trigram, signature)
2. `get_prompt_clusters` — 유사한 prompt 그룹 (action verb 기반 클러스터링)
3. `get_project_profiles` — 프로젝트별 tool 사용 분포와 고유 패턴
4. `get_workflow_arcs` — 세션 단위 워크플로우 패턴 (explore/edit/run 흐름)
5. `get_friction_points` — 마찰 지점 (rapid retry, 반복 시도)

## Step 2: 패턴 분석

수집된 데이터를 종합하여 다음을 식별하세요:

- **반복되는 multi-step tool sequence** → Agent 후보
  - 3개 이상의 tool이 일정한 순서로 반복
  - 여러 세션에 걸쳐 나타남

- **반복되는 user prompt 패턴** → Command 후보
  - 같은 의도의 prompt가 5회 이상 반복
  - 특정 tool 조합과 항상 연결됨

- **프로젝트 고유 컨벤션** → Rules 후보
  - 특정 프로젝트에서만 나타나는 tool 사용 패턴
  - enrichment ratio가 1.5x 이상인 도구

- **반복되는 session workflow** → Skill 후보
  - 동일한 explore → edit → run 흐름이 반복
  - 2개 이상의 세션에서 동일한 arc

- **마찰 지점** → 개선 대상
  - rapid retry가 잦은 영역
  - 같은 prompt를 반복하는 패턴

## Step 3: 기존 설정 확인

```
Glob으로 확인:
- .claude/agents/*.md
- .claude/skills/*/SKILL.md
- .claude/commands/*.md
- .claude/rules/*.md
```

이미 존재하는 설정과 중복되지 않도록 하세요.

## Step 4: 제안 생성

각 발견된 패턴에 대해:

1. **패턴 유형**: Agent / Command / Skill / Rules
2. **근거**: 어떤 데이터에서 발견했는지 (빈도, 세션 수, 예시)
3. **제안하는 파일 경로**: e.g. `.claude/commands/run-tests.md`
4. **파일 내용 초안**: 실제 사용 가능한 완전한 config 파일

Config 파일 작성 시 참고할 패턴:

### Agent 형식
```markdown
---
name: {name}
description: {설명}
allowed-tools:
  - {tool list}
---
# {Name}
## Workflow
### Phase 1: ...
```

### Command 형식
```markdown
---
description: {설명}
allowed-tools:
  - {tool list}
---
# {Name}
{실행할 작업 설명}
```

### Rules 형식
```markdown
# {주제}
- {규칙 1}
- {규칙 2}
```

### Skill 형식
```markdown
---
name: {name}
description: {설명}
---
# {Name}
## 핵심 규칙
...
```

## Step 5: 사용자에게 보고

발견한 패턴과 제안을 요약하여 보고하세요. 사용자가 승인하면 파일을 생성합니다.
