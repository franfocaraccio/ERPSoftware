# @erp/arca

The boundary with ARCA (formerly AFIP), Argentina's tax authority, for
electronic invoicing.

## What this package is today

**A contract and a test double, not an integration.** It holds
`IFacturacionElectronica` with its types, and `FacturacionElectronicaFake`,
which enforces the rules of the real service that the emitting code depends
on. The WSAA and WSFEv1 adapters are not written.

That is a deliberate order, not an unfinished job left lying around. The hard
part of electronic invoicing is not the SOAP call — it is numbering without
gaps, retrying without issuing twice, and freezing a document the moment it
comes back authorized. All of that can be written and tested in full against
the fake, and all of it is where a bug is expensive: a duplicate fiscal
document or a gap in a sales-point sequence has to be explained to the tax
authority, not fixed with a migration.

Until the adapters exist, sales documents are loaded by hand, with the operator
typing the sales point and number. The database already carries `cae` and
`cae_vencimiento` columns for when they are issued.

## The contract

```ts
interface IFacturacionElectronica {
  ultimoAutorizado(punto: PuntoDeNumeracion): Promise<number>;
  autorizar(solicitud: SolicitudCae): Promise<ResultadoCae>;
}
```

Three decisions are visible in those two methods.

**Amounts are `Money`, never numbers.** The adapter converts to whatever the
wire format wants, in one place. Nothing upstream gets a chance to add two
floats.

**A rejection is a result; an unreachable service is an exception.** They lead
to opposite actions. A rejection means the document was not authorized, the
number is still free, and something concrete needs fixing. An
`ArcaNoDisponibleError` means *nobody knows*: the request may have arrived and
may have been authorized, and the response did not come back. The only safe
move there is to retry with the same idempotency key — never to issue again
with a new number.

**`ultimoAutorizado` exists because the database is not the source of truth
for numbering.** If a request died without a response, the system may believe
a number is free when it has already been used.

## How the real thing is meant to work

### Gapless numbering

A sales point's numbering cannot skip. The approach:

1. Take `pg_advisory_xact_lock` on `(tenant_id, punto_venta)`, so two
   concurrent emissions in the same organization serialize rather than race for
   the same number.
2. Ask ARCA for the last authorized number for that sequence, and derive the
   next one from the answer rather than from a local counter.
3. Request the CAE, and persist the result inside the same transaction.

This needs a database connection in **session mode**, not a transaction
pooler: an advisory transaction lock is meaningless if the pooler can hand the
next statement to a different backend.

### Idempotency

Every request carries a key derived from the document being issued, not from
the attempt. A retry after a timeout brings the same key and must get the same
answer back. The fake enforces this, so the emitting code is tested against it
from the start.

### A document with a CAE is immutable

Once authorized, nothing about it changes — not the amounts, not the customer,
not the date. Corrections happen only through a credit or debit note that
references it. This is enforced in the domain, not only in the UI.

### Zod at the boundary

Responses are parsed before they touch the domain, like every other external
input in this codebase. They are not written yet: the field names, their order
and the error codes belong to the official WSFEv1 specification, and writing
schemas from memory is how an integration quietly ends up parsing a shape the
service never sends. They get written against the spec, with recorded responses
from the homologation environment as test fixtures.

### Authentication

WSAA issues a time-limited access ticket from a signed request, and that
ticket gets cached and reused until it expires rather than re-requested per
call. A bad certificate or an expired ticket surfaces as
`ArcaNoAutenticadoError`, which is explicitly *not* something to retry in a
loop.

### What this will not use

`@afipsdk/afip.js` is off the table: it routes calls through a paid third-party
service that needs its own access token, which means the tax credentials and
the invoice data of every tenant would leave the system. The libraries are
WSAA and WSFEv1 directly, over the published SOAP endpoints.

## What the fake models, and what it does not

It enforces, in memory and deterministically:

- numbering per emitter, sales point, class and letter, rejecting any gap;
- idempotency — a repeated key returns the first answer and consumes no number;
- a total that is not net plus VAT;
- an A-class invoice without a CUIT-identified recipient;
- a credit or debit note that does not say what it corrects;
- being down, on demand, so the retry path can be tested separately from the
  rejection path.

It does not pretend to be faithful. The real service has dozens of validations
and a published error table; **the codes in the fake are invented**, shaped
like the real ones so that calling code can tell causes apart, and the real
table replaces them when the adapter lands. The CAE is derived from the request
so that it is stable across runs — the real one is assigned by ARCA and cannot
be predicted — and its expiry is a flat ten days from the issue date, which is
a simplification of the real rule.
