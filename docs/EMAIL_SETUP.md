# Turning on real email sending (free, one-time setup)

Right now, Atlas sends emails (quotes, invoices, reminders, review
requests, portal login links) through Resend's shared test address.
That address can **only deliver to the Resend account's own inbox** -
every other recipient (i.e. every real customer) silently never
receives anything. There's no error shown to whoever clicked "Send" -
it just quietly doesn't arrive.

Fixing this is free and takes about 15 minutes, but it does require
**owning a domain name** (e.g. `yourbusiness.com`). If you don't have
one yet, that's the only real cost - domains are usually $10-15/year
through any registrar (Namecheap, Google Domains, etc.).

## Steps

1. **Log into Resend** at [resend.com](https://resend.com) (the same
   account whose API key is already in Atlas's `.env` as
   `RESEND_API_KEY`).

2. Go to **Domains** → **Add Domain**, and enter your domain
   (e.g. `yourbusiness.com`).

3. Resend will show you 2-3 DNS records to add (usually a couple of
   `TXT` records and a `MX` or `CNAME`). Add those in whatever
   dashboard you manage your domain's DNS through (wherever you bought
   the domain, or wherever it's hosted). This step looks the most
   technical, but it's copy-pasting a few values into a form.

4. Wait for Resend to show the domain as **Verified** (usually a few
   minutes, sometimes up to a few hours depending on DNS propagation).

5. Once verified, add this line to Atlas's `.env` file:

   ```
   RESEND_FROM_EMAIL="Your Business Name <hello@yourbusiness.com>"
   ```

   (swap in your actual business name and an address on your verified
   domain - `hello@`, `notifications@`, `no-reply@` are all common
   choices).

6. Restart the Atlas server. That's it - real emails to real customers
   will now go out.

## How to tell if this is done

Atlas itself will tell you: once `RESEND_FROM_EMAIL` is set, the
"Email Sending" warning card disappears from **Settings → Integrations**
on its own. Until then, that card stays up as a reminder that customer
emails aren't actually reaching anyone yet.
