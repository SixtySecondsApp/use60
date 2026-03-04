FROM gotenberg/gotenberg:8

# Gotenberg 8 runs as a non-root user by default.
# No additional USER directive needed — the base image handles this.

# Override the default CMD to configure Gotenberg with production settings:
#  --chromium-disable-gpu         required for containerised headless Chrome
#  --chromium-wait-delay 500ms    gives web fonts / CSS 500 ms to load before capture
#  --api-port 3000                explicit port binding (Railway injects PORT env var,
#                                  but Gotenberg uses its own --api-port flag)
#  --api-timeout 60s              generous timeout for complex proposals
#
# Paper size defaults (A4) are applied per-request via the Chromium route's
# paperWidth / paperHeight form fields. We set sane defaults here as fallback.

CMD ["gotenberg", \
     "--api-port=3000", \
     "--api-timeout=60s", \
     "--chromium-disable-gpu", \
     "--chromium-wait-delay=500ms", \
     "--log-level=info"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
