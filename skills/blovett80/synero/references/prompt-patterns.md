# Prompt Patterns

Use these patterns when asking Synero's council for higher-signal answers.

## Product decision

```text
What are the 3 strongest arguments for and against shipping <feature> in the next 30 days?
Assume a startup context with limited engineering capacity.
End with a concrete recommendation and the main risk.
```

## Strategy debate

```text
Debate this position from multiple angles: <claim>.
I want disagreement, hidden assumptions, second-order effects, and a final synthesis.
Keep it practical, not academic.
```

## Leadership / hiring

```text
I'm deciding between <option A> and <option B>.
Evaluate tradeoffs across speed, quality, org complexity, cost, and execution risk.
Then give me the best recommendation for the next 90 days.
```

## Technical architecture

```text
Evaluate this technical plan: <plan>.
Have the council identify likely bottlenecks, hidden migration costs, failure modes, and what I should prototype first.
Return a clear go / no-go recommendation.
```

## Content / positioning

```text
I need a point of view on <topic>.
Give me the strongest contrarian angle, the strongest mainstream angle, and a synthesis that would resonate with operators.
```

## Best practices

- Ask for a concrete recommendation, not just exploration.
- Add operating constraints: timeline, team size, budget, risk tolerance.
- Use `--thread-id` when continuing the same topic across multiple rounds.
- Use `--quiet` when another tool or script needs clean final text only.
- Use `--raw` when debugging streaming behavior or inspecting advisor outputs.
