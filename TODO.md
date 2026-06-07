# TODO - EmailJS Newsletter Integration

- [x] Added EmailJS integration TODO tracker and `.env.example`
- [x] Add EmailJS backend endpoint `POST /api/newsletter/subscribe`
  - [x] Read EmailJS config from environment (.env)
  - [x] Validate email
  - [x] Send email using `service_73g1mfw` and template `template_iejtckj`
  - [x] Recipient: subscriber email itself
- [x] Update frontend newsletter form (`public/app.js`) to call backend endpoint instead of only localStorage
- [x] Add documentation to `README.md` on required EmailJS env vars
- [ ] Manual test: subscribe from browser and verify EmailJS delivery


