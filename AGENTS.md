# Vehicles interface review

For a visible change to Vehicles, use an independent reviewer before publishing. For changes that affect both desktop and phone layouts, have separate reviewers inspect each layout. Give each reviewer the affected user journeys and the previous failure.

Use a fictional vehicle with a registration payment, a separate confirmed expiry, a service and an undated maintenance follow-up. Where possible, have two entries reference one original. Keep the household register read-only during visual checks.

Check Home, Registration, Maintenance and Servicing at desktop and phone widths. Inspect card alignment, wrapping, readable dates and amounts, evidence links, keyboard focus and the active ribbon section. Exercise the capture and review controls when they change. Verify that leaving a review preserves the original and handles any unsaved edits or recording explicitly.

In HeyMeg, run `npm run test:vehicles`. In another host, run `node path/to/check-history.mjs path/to/vehicles` with the host dependencies available. Use the optional `--browser` flag to check phone and desktop geometry when Chromium is available. Run the scoped regression checks and verify the changed view in the signed-in host. Correct reproducible defects and repeat the affected checks. State which checks ran and which still need verification.
