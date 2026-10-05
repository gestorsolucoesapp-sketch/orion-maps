from __future__ import annotations

import getpass
import keyring
from supabase import create_client

SUPABASE_URL = "https://zxmhpkcxwlpvkelqapbf.supabase.co"
SUPABASE_KEY = "sb_publishable_Tcg2rXYt-HlQuvIP9jkdog_5CaSBVs-"
SERVICE = "OrionMapsAgent"

print("=" * 60)
print("ORION MAPS - CONFIGURAÇÃO DO AGENTE LOCAL")
print("=" * 60)

email = input("E-mail do Orion Maps [oriondronemaps@gmail.com]: ").strip() or "oriondronemaps@gmail.com"
password = getpass.getpass("Senha do Orion Maps: ")

client = create_client(SUPABASE_URL, SUPABASE_KEY)
auth = client.auth.sign_in_with_password({"email": email, "password": password})

if not auth.user:
    raise SystemExit("Não foi possível autenticar.")

keyring.set_password(SERVICE, "account", email)
keyring.set_password(SERVICE, email, password)

print()
print("Credenciais validadas e salvas no Gerenciador de Credenciais do Windows.")
print(f"Usuário: {email}")
print("Configuração concluída.")
