# Design QA

- Date : 2026-06-20
- Référence : `design/reference-paper-intelligence.png`
- Cible : `http://localhost:3000`
- Résultat fonctionnel : réussi (build, typage, lint, tests unitaires et parcours API réel)
- Résultat visuel : bloqué

Le canal d’automatisation de l’extension Chrome/Comet échoue avant la navigation avec une erreur interne liée à `sandboxPolicy`. Playwright n’a pas été utilisé, conformément à la demande de l’utilisateur. Aucune capture d’implémentation n’a donc été produite ni comparée à la référence pendant cette passe.
