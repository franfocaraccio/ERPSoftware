# 0009 — Identifiers in Spanish

**Status:** accepted

## Context

The domain is Argentine tax law. Its words have precise meanings that their
English approximations lose: a *comprobante* is not a receipt, a
*monotributista* is not a freelancer, a *nota de crédito* is a legal
instrument with rules rather than a refund, and *retención* and *percepción*
are both "withholding" in English while being opposite operations.

The people who use the software, describe the bugs and decide the rules speak
Spanish and use those words.

## Decision

Identifiers, tables and columns are in Spanish. Commit messages, pull
requests and everything written on GitHub are in English. Product
documentation is in Spanish; documentation aimed at an outside reader —
`README.md`, `ARCHITECTURE.md`, these records — is in English.

## Consequences

- A conversation with the person who uses the software maps one-to-one onto
  the code, with no glossary and no mistranslation turning into a bug in a
  fiscal calculation.
- Library APIs stay in English, so most files mix both — `const comprobante =
  await tx.select()`.
- A contributor who does not read Spanish has a harder time, which the README
  addresses by explaining the vocabulary rather than by renaming it.
