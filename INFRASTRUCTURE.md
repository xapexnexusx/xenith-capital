# Xenith Capital — Infrastructure & Domain Setup

## Domain: xenithcap.io

**Registrar DNS:** Cloudflare (nameservers: amir.ns.cloudflare.com + another)
**Hosting:** GitHub Pages (xapexnexusx/xenith-capital)
**SSL:** Let's Encrypt (auto-provisioned by GitHub Pages)
**Deploy:** GitHub Actions workflow (build_type: workflow)

---

## DNS Records (Cloudflare — xenithcap.io zone)

All records are **DNS only** (grey cloud / no proxy). Cloudflare acts as nameserver only.

### GitHub Pages A Records (apex domain)

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | xenithcap.io | 185.199.108.153 | DNS only | Auto |
| A | xenithcap.io | 185.199.109.153 | DNS only | Auto |
| A | xenithcap.io | 185.199.110.153 | DNS only | Auto |
| A | xenithcap.io | 185.199.111.153 | DNS only | Auto |

### www CNAME

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| CNAME | www | xapexnexusx.github.io | DNS only | Auto |

### GitHub Domain Verification TXT

| Type | Name | Content | TTL |
|------|------|---------|-----|
| TXT | _github-pages-challenge-xapexnexusx | 4c945c8079392c50d005e0db6b1973 | Auto |

### Email Records (Google Workspace)

| Type | Name | Content | Priority | TTL |
|------|------|---------|----------|-----|
| MX | xenithcap.io | smtp.google.com | 1 | Auto |
| TXT | xenithcap.io | v=spf1 include:_spf.google.com ~all | — | Auto |
| TXT | google._domainkey | v=DKIM1; k=rsa; p=MII... | — | Auto |
| TXT | _dmarc | v=DMARC1; p=quarantine; ... | — | Auto |

### Other

| Type | Name | Content | TTL |
|------|------|---------|-----|
| CNAME | ibkr-selector1._domainkey | ibext-selector1.dkim.ibk... | Auto |
| TXT | xenithcap.io | replit-verify=fb3d32fb... | Auto |

---

## GitHub Pages Configuration

```
Repository: xapexnexusx/xenith-capital
Branch: main
Build type: workflow (GitHub Actions)
Custom domain: xenithcap.io
HTTPS enforced: true
Domain verified: yes (protected_domain_state: "verified")
CNAME file: ./CNAME (contains "xenithcap.io")
```

### Verified Domain

Domain is verified at the **account level** (github.com/settings/pages), not just the repo level. This prevents other GitHub users from claiming xenithcap.io on their repos.

---

## Rebuild Playbook

### Prerequisites
- Cloudflare account with xenithcap.io zone
- GitHub account: xapexnexusx
- Repository: xapexnexusx/xenith-capital with GitHub Actions Pages workflow

### Step 1: Cloudflare DNS Records

Add all records from the tables above. Critical settings:
- **All records must be DNS only** (grey cloud). Do NOT proxy through Cloudflare.
- GitHub Pages handles SSL via Let's Encrypt. Cloudflare proxy conflicts with this.
- Cloudflare's SSL/TLS settings are irrelevant when DNS-only.

### Step 2: CNAME File in Repo

Ensure `CNAME` file exists in repo root containing:
```
xenithcap.io
```

### Step 3: Configure GitHub Pages

```bash
# Set custom domain
gh api repos/xapexnexusx/xenith-capital/pages \
  -X PUT -f cname=xenithcap.io -f build_type=workflow

# Verify DNS propagation
dig xenithcap.io +short          # Should show 4 GitHub IPs
dig www.xenithcap.io +short      # Should resolve via CNAME
```

### Step 4: Verify Domain on GitHub

1. Go to github.com/settings/pages
2. Add domain: xenithcap.io
3. Create TXT record in Cloudflare:
   - Name: `_github-pages-challenge-xapexnexusx`
   - Value: (GitHub will provide a new challenge code)
4. Click Verify after DNS propagates (~1 min with Cloudflare)

### Step 5: Enable HTTPS

Wait for Let's Encrypt cert provisioning (5-30 minutes, sometimes longer).

```bash
# Poll until cert is ready
gh api repos/xapexnexusx/xenith-capital/pages \
  -X PUT -f cname=xenithcap.io -F https_enforced=true -f build_type=workflow
```

**If cert takes >20 minutes:** Toggle custom domain off and back on to re-trigger:
```bash
# Remove
gh api repos/xapexnexusx/xenith-capital/pages \
  -X PUT -f cname="" -f build_type=workflow
sleep 10
# Re-add
gh api repos/xapexnexusx/xenith-capital/pages \
  -X PUT -f cname=xenithcap.io -f build_type=workflow
```

### Step 6: Verify

```bash
curl -sI https://xenithcap.io | head -5      # HTTP/2 200
curl -sI https://www.xenithcap.io | head -3   # 301 → xenithcap.io
curl -sI http://xenithcap.io | head -3        # 301 → https
```

---

## Lessons Learned (2026-02-09)

1. **Cloudflare proxy must be OFF** for GitHub Pages custom domains. DNS-only mode lets GitHub handle SSL end-to-end.
2. **HSTS from old Cloudflare proxy** causes browsers to reject the site during cert provisioning. Incognito/new browsers work fine over HTTP.
3. **Cert provisioning can take 30-90 minutes**. If stuck, toggle the custom domain off/on to re-trigger the ACME challenge.
4. **Domain verification is account-level**, done at github.com/settings/pages, separate from the repo-level custom domain setting.
5. **Cloudflare propagation is near-instant** since it's the authoritative nameserver — no waiting for TTL expiry.

---

## Architecture

```
User → DNS (Cloudflare nameservers) → GitHub Pages IPs
                                        ↓
                                   Let's Encrypt SSL
                                        ↓
                                   GitHub CDN (Fastly)
                                        ↓
                                   Static site (index.html)
```

No Cloudflare proxy in the path. Cloudflare is nameserver-only.
