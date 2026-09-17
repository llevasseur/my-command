# Architecture Decision Records

Numbered records of significant, hard-to-reverse decisions. List them:

    okq find --type adr

Add one with `okq new adr "<title>"`.

<!-- okq:index:begin -->
### Concepts

| Title | File |
|-------|------|
| Record architecture decisions | [0001-record-architecture-decisions.md](0001-record-architecture-decisions.md) |
| Command docs as okq specs and per-command feature docs | [0002-command-docs-as-okq-specs.md](0002-command-docs-as-okq-specs.md) |
| A dirty frontmatter flag hands changed docs to a separate density pass | [0003-dirty-flag-for-doc-density.md](0003-dirty-flag-for-doc-density.md) |
| Docs completes the density pass in the same task | [0004-docs-completes-density-pass.md](0004-docs-completes-density-pass.md) |
| Agent-authored decisions are marked in frontmatter | [0005-agent-authored-decisions-are-marked-in-frontmatter.md](0005-agent-authored-decisions-are-marked-in-frontmatter.md) |
| A campaign recorded as unattended resumes unattended | [0006-unattended-campaigns-resume-unattended.md](0006-unattended-campaigns-resume-unattended.md) |
| The deterministic trim gates stay a facts verb rather than becoming classifier questions | [0007-deterministic-trim-gates-stay-a-facts-verb.md](0007-deterministic-trim-gates-stay-a-facts-verb.md) |
| No Jev question set acts in the campaign that introduces the layer | [0008-no-question-set-acts-in-this-campaign.md](0008-no-question-set-acts-in-this-campaign.md) |
| Conversation-derived state leaves the device when the judgement layer runs | [0009-conversation-derived-state-leaves-the-device.md](0009-conversation-derived-state-leaves-the-device.md) |
| The campaign builds the eval before the judgement layer it evaluates | [0010-eval-harness-before-the-layer.md](0010-eval-harness-before-the-layer.md) |
| The deterministic comment keeps run before the classifier and leave the eval corpus | [0011-deterministic-comment-keeps-run-before-the-classifier.md](0011-deterministic-comment-keeps-run-before-the-classifier.md) |
| The judgement layer ships with two eval subjects, not five | [0012-two-eval-subjects-not-five.md](0012-two-eval-subjects-not-five.md) |
| The numbers that abandon the judgement layer are fixed before the eval runs | [0013-the-eval-bar-is-pre-registered.md](0013-the-eval-bar-is-pre-registered.md) |
| The eval returned no, and the layer ships measured rather than working | [0014-the-eval-returned-no.md](0014-the-eval-returned-no.md) |
<!-- okq:index:end -->
