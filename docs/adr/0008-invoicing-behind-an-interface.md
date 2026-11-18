# 0008 — Electronic invoicing behind an interface, built later

**Status:** accepted

## Context

Issuing a fiscal document against ARCA is the feature with the most expensive
failure modes in the system, and the SOAP call is the least of it. The hard
parts are numbering a sales point with no gaps, retrying a request whose
response never arrived without issuing twice, and freezing the document the
moment a CAE comes back. A duplicate fiscal document is explained to the tax
authority; it is not fixed with a migration.

Building that logic directly against the real service would mean it could only
be exercised with certificates, a homologation environment and a network.

## Decision

Define the contract first. `@erp/arca` holds `IFacturacionElectronica` and a
fake that enforces the rules the calling code depends on: gapless numbering
per emitter, sales point, class and letter; idempotency by a key derived from
the document; totals that must equal net plus VAT; and being unavailable on
demand, so the retry path is testable apart from the rejection path.

Amounts in the contract are `Money`, so conversion to the wire format happens
in the adapter and nowhere else. A rejection is a *result*; an unreachable
service is an *exception* — they lead to opposite actions.

Until the adapters exist, sales documents are loaded by hand, with the number
typed in. The schema already carries `cae` and `cae_vencimiento`.

## Consequences

- The emission logic can be written and tested in full before any integration
  exists.
- The repository must say plainly that the integration is not there, or the
  contract reads as a claim that it is.
- The fake is a second implementation to keep honest; its error codes are
  invented and labelled as such.
- Mapping to WSFEv1 — field names, codes, the error table — is deferred, and
  will be written against the specification rather than from memory.
