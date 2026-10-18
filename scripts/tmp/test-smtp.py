#!/usr/bin/env python3
import smtplib, socket, sys

USER = "notifications@verifscan.pro"
PWDS = ["Love1968@1/", "Love1968@1"]
HOSTS = [
    ("mail.verifscan.com", 465, True),
    ("mail.verifscan.com", 587, False),
    ("mail.verifscan.com", 25, False),
    ("mail.roomscan.pro", 465, True),
    ("mail.roomscan.pro", 587, False),
    ("verifscan.pro", 465, True),
    ("verifscan.pro", 587, False),
]

def try_login(host, port, ssl_):
    for pwd in PWDS:
        tag = f"{host}:{port} ssl={ssl_} pwd=...{pwd[-2:]!r}"
        try:
            if ssl_:
                s = smtplib.SMTP_SSL(host, port, timeout=12)
            else:
                s = smtplib.SMTP(host, port, timeout=12)
            try:
                if not ssl_:
                    s.starttls()
                s.login(USER, pwd)
                s.quit()
                print(f"OK   {tag}")
                return True
            except smtplib.SMTPAuthenticationError as e:
                print(f"AUTHFAIL {tag} -> {e.smtp_code} {str(e.smtp_error)[:80]}")
                try: s.quit()
                except Exception: pass
            except Exception as e:
                print(f"ERR  {tag} -> {type(e).__name__}: {str(e)[:120]}")
                try: s.quit()
                except Exception: pass
        except Exception as e:
            print(f"CONN {tag} -> {type(e).__name__}: {str(e)[:100]}")
    return False

for h, p, s in HOSTS:
    if try_login(h, p, s):
        print("MATCH FOUND")
        sys.exit(0)
print("NO MATCH")
