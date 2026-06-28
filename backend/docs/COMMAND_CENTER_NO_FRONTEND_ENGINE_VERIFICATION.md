# Command Center No-Frontend-Engine Verification

The Command Center and Backstage panels are display layers.

Confirmed boundaries:

- frontend does not calculate patterns;
- frontend does not calculate outcomes;
- frontend does not calculate governance;
- frontend does not create causal cases;
- frontend does not generate probability;
- frontend renders API/backend/control-plane state;
- empty, stale, and loading states remain explicit;
- backend/local worker owns decisions and persistence.

This preserves the rule: frontend shows what the backend has proven or persisted; it does not invent football intelligence.
