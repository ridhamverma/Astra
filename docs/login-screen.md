# Login screen

The full-page `/login` experience adapts the ASTRYX `login-split` template generated with:

```sh
npx @astryxdesign/cli template login-split ./src/app/login-split
```

The generated composition is adapted into `frontend/app/login/page.tsx` to match the supplied reference: a centered white split card on warm ivory, with the form on the left and the original team photo on the right. Astra's existing React, Next.js and scoped CSS render the design; no additional runtime UI package is required. The temporary generated route was removed after adaptation.

The Concept 11 curved star logo is an inline SVG with a white circular center. Scoped colors use ivory `#F8F7F3`, white `#FFFFFF`, charcoal `#242321`, secondary text `#706D66`, border `#DDD9D0`, coral `#D95D45`, hover `#B94735`, focus `#F0B0A3`, and error `#B93832`. Dark button text preserves the reference treatment with readable contrast; hover uses white text. The locally served photo comes from [ASTRYX's original template assets](https://github.com/facebook/astryx/blob/main/apps/docsite/public/template-assets/light-working-vertical-1.png).

## Layout and behavior

- The root layout provides authentication context. The `(site)` route group supplies the existing global header to Home, Dashboard, Projects, Simulator and Register without changing their URLs.
- `/login` has its own headerless layout. Styles are scoped in `login.module.css`; mobile layouts place a shorter image above the form. Desktop card height adapts to shorter viewports so legal copy stays visible.
- `AuthForm` keeps the existing email/password API, session/CSRF handling and redirect allowlist. A valid `next` destination under `/dashboard`, `/projects` or `/simulator` is preserved, including its query string; other destinations fall back to `/projects`.
- During submission, login inputs and the primary button are disabled and the button reads “Signing in…”. A synchronous guard blocks duplicate requests and stays locked during successful navigation. Failure unlocks the form and displays an accessible alert; invalid credentials also mark both fields invalid. Failed login clears the password while preserving the email.
- Inputs have visually hidden accessible labels, email/password types, autofill hints and visible keyboard focus. Enter submits the semantic form. Sign up opens `/register`.
- Legal copy is visible charcoal with coral links and no underlines. Terms and Privacy retain the supplied `#` placeholder behavior because the application has no existing legal routes.
- Registration keeps its existing page and authentication behavior. Login contains no social providers or forgot-password flow.

## Verification

Lint, the optimized production build, TypeScript checking and all 10 existing frontend tests passed.

Browser checks used a synthetic account against the real FastAPI/PostgreSQL services:

- Failed credentials displayed the backend error and re-enabled the form.
- A temporary local latency proxy delayed actual authentication responses by three seconds to inspect the loading state. Both inputs and the submit button were disabled. One failed submission and one successful submission produced exactly two login requests; the test proxy was then removed from the running services.
- Successful login preserved `/simulator?project=…` and loaded the owned project. Dashboard/Projects navigation retained the existing header; logout returned to the headerless login page.
- The create-account link opened the existing registration page.
- Desktop at 1485 × 898 and 1280 × 720, 768-pixel tablet, 390-pixel mobile and 320-pixel narrow mobile layouts were inspected. Login rendered no header/navigation elements and had no horizontal overflow. Legal copy remained visible, and keyboard focus was checked on inputs and the submit button.

Screenshots: [desktop](login-screen-desktop.png), [mobile](login-screen-mobile.png).
